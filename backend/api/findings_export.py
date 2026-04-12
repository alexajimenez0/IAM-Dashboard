"""
CSV export for security findings (DynamoDB IAM findings table, PostgreSQL fallback).
"""

from __future__ import annotations

import csv
import io
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Set

from botocore.exceptions import BotoCoreError, ClientError, NoCredentialsError
from flask import Response, request

from services.database_service import DatabaseService, SecurityFinding
from services.dynamodb_service import DynamoDBService

logger = logging.getLogger(__name__)

CSV_COLUMNS = [
    "finding_id",
    "severity",
    "type",
    "resource",
    "timestamp",
    "status",
    "remediation_notes",
]

VALID_SEVERITIES = frozenset({"LOW", "MEDIUM", "HIGH", "CRITICAL"})
VALID_STATUSES = frozenset({"OPEN", "RESOLVED", "SUPPRESSED"})


def _parse_multi_args(name: str) -> List[str]:
    raw = request.args.getlist(name)
    if not raw:
        single = request.args.get(name)
        if single:
            raw = [single]
    out: List[str] = []
    for part in raw:
        for piece in part.split(","):
            s = piece.strip()
            if s:
                out.append(s)
    return out


def _parse_iso_datetime(value: Optional[str]) -> Optional[datetime]:
    if not value or not str(value).strip():
        return None
    s = str(value).strip().replace("Z", "+00:00")
    try:
        dt = datetime.fromisoformat(s)
        if dt.tzinfo is not None:
            return dt.astimezone(timezone.utc).replace(tzinfo=None)
        return dt
    except ValueError:
        return None


def _norm_severity(value: Any) -> str:
    return str(value or "").strip().upper()


def _dynamo_norm_status(item: Dict[str, Any]) -> str:
    s = str(item.get("status") or "").lower()
    if s in ("resolved", "closed", "complete", "completed"):
        return "RESOLVED"
    if s in ("suppressed", "supress"):
        return "SUPPRESSED"
    return "OPEN"


def _dynamo_row(item: Dict[str, Any]) -> Dict[str, str]:
    rid = str(item.get("resource_id") or "")
    rtype = str(item.get("resource_type") or "")
    resource = f"{rtype}:{rid}" if rtype and rid else (rid or rtype or "")
    ts = str(
        item.get("detected_at")
        or item.get("created_at")
        or item.get("updated_at")
        or ""
    )
    return {
        "finding_id": str(item.get("finding_id") or ""),
        "severity": _norm_severity(item.get("severity")) or "UNKNOWN",
        "type": rtype,
        "resource": resource,
        "timestamp": ts,
        "status": _dynamo_norm_status(item),
        "remediation_notes": str(item.get("recommendation") or item.get("description") or ""),
    }


def _sql_norm_status(f: SecurityFinding) -> str:
    st = str(f.status or "").upper()
    if st == "SUPPRESSED":
        return "SUPPRESSED"
    if f.resolved or st in ("RESOLVED", "CLOSED"):
        return "RESOLVED"
    return "OPEN"


def _sql_row(f: SecurityFinding) -> Dict[str, str]:
    rid = str(f.resource_id or "")
    rtype = str(f.resource_type or "")
    resource = f"{rtype}:{rid}" if rtype and rid else (rid or rtype or "")
    ts = f.created_at.isoformat() if f.created_at else ""
    return {
        "finding_id": str(f.finding_id or ""),
        "severity": _norm_severity(f.severity) or "UNKNOWN",
        "type": rtype,
        "resource": resource,
        "timestamp": ts,
        "status": _sql_norm_status(f),
        "remediation_notes": str(f.description or ""),
    }


def _filter_rows(
    rows: List[Dict[str, str]],
    severities: Optional[Set[str]],
    statuses: Optional[Set[str]],
    start: Optional[datetime],
    end: Optional[datetime],
) -> List[Dict[str, str]]:
    out: List[Dict[str, str]] = []
    for r in rows:
        if severities and r["severity"] not in severities:
            continue
        if statuses and r["status"] not in statuses:
            continue
        if start or end:
            ts_raw = r.get("timestamp") or ""
            try:
                dt = datetime.fromisoformat(ts_raw.replace("Z", "+00:00"))
                if dt.tzinfo:
                    dt = dt.astimezone(timezone.utc).replace(tzinfo=None)
            except ValueError:
                dt = None
            if dt is None:
                continue
            if start and dt < start:
                continue
            if end and dt > end:
                continue
        out.append(r)
    return out


def _sanitize_csv_cell(value: str) -> str:
    if value and value[0] in "=+-@":
        return "'" + value
    return value


def _build_csv(rows: List[Dict[str, str]]) -> str:
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=CSV_COLUMNS, extrasaction="ignore")
    writer.writeheader()
    for r in rows:
        writer.writerow({k: _sanitize_csv_cell(str(v)) for k, v in r.items()})
    return buf.getvalue()


def export_findings_csv():
    """GET /api/findings/export/csv — CSV of IAM/security findings."""
    severities_in = _parse_multi_args("severity")
    statuses_in = _parse_multi_args("status")
    start = _parse_iso_datetime(request.args.get("start_date"))
    end = _parse_iso_datetime(request.args.get("end_date"))

    severities: Optional[Set[str]] = None
    if severities_in:
        severities = {s.upper() for s in severities_in if s.upper() in VALID_SEVERITIES}
        if not severities:
            severities = None

    statuses: Optional[Set[str]] = None
    if statuses_in:
        statuses = {s.upper() for s in statuses_in if s.upper() in VALID_STATUSES}
        if not statuses:
            statuses = None

    rows: List[Dict[str, str]] = []

    def _from_sql() -> List[Dict[str, str]]:
        db = DatabaseService()
        findings = db.query_security_findings_for_export(
            severities=severities,
            start=start,
            end=end,
            statuses=statuses,
        )
        return [_sql_row(f) for f in findings]

    try:
        dynamo = DynamoDBService()
        items = dynamo.list_all_iam_findings()
        rows = [_dynamo_row(i) for i in items]
        rows = _filter_rows(rows, severities, statuses, start, end)
    except (NoCredentialsError, ClientError, BotoCoreError) as e:
        logger.warning("DynamoDB findings export unavailable, using SQL: %s", e)
        try:
            rows = _from_sql()
        except Exception as db_e:
            logger.error("PostgreSQL findings export failed: %s", db_e, exc_info=True)
            rows = []
    except Exception as e:
        logger.error("Unexpected error loading DynamoDB findings: %s", e, exc_info=True)
        try:
            rows = _from_sql()
        except Exception as db_e:
            logger.error("PostgreSQL findings export failed: %s", db_e, exc_info=True)
            rows = []

    csv_body = _build_csv(rows)
    ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    filename = f"iam_findings_{ts}.csv"

    return Response(
        csv_body,
        mimetype="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-store",
        },
    )
