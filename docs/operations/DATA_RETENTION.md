# Data retention policy (A17 / #196)

This document defines how long **metrics**, **findings**, and **scans** are kept across observability stacks, the application database, AWS persistence, and the browser. Defaults target a balance between troubleshooting history and storage cost; production teams may tighten or extend periods via Terraform variables, Docker Compose environment values, or scheduled jobs.

## Summary

| Data | Where | Default retention | Cleanup mechanism |
|------|--------|---------------------|-------------------|
| Time-series metrics | Prometheus (Docker) | Configurable; default **200 hours (~8.3 days)** | Prometheus TSDB compaction and retention (`--storage.tsdb.retention.time`) |
| Dashboards / users / annotations | Grafana SQLite volume | **Indefinite** (until volume is reset) | Operational: backup or prune volume; not time-based |
| Metrics queried in Grafana | Same as Prometheus | Same as Prometheus | N/A (Grafana does not store scraped samples) |
| `performance_metrics` rows | PostgreSQL | **90 days** (recommended) | `backend/sql/retention_cleanup.sql` (scheduled `psql`) |
| Resolved `security_findings` | PostgreSQL | **730 days** (recommended) | Same SQL script (optional section) |
| Open / unresolved findings | PostgreSQL | **Until resolved** then subject to resolved row policy | Manual or SQL script |
| Scan payloads | DynamoDB `scan_id` + `timestamp` | **365 days** after write (default) | DynamoDB **TTL** on attribute `expires_at` |
| Scan JSON objects | S3 prefix `scan-results/` | **365 days** (default, matches DynamoDB) | S3 lifecycle expiration |
| Scan snapshots (Reports UI) | Browser `sessionStorage` key `iam-dashboard-scan-results` | **Until the tab is closed** | Browser; user **Clear** in app |
| S3 access logs (site bucket) | Separate logging bucket | **90 days** | Terraform lifecycle (`infra/s3`) |
| API Gateway execution logs | CloudWatch Logs | **365 days** | `retention_in_days` in `infra/api-gateway` |

## Prometheus (local / Docker Compose)

- Retention is controlled by the Prometheus flag `--storage.tsdb.retention.time`.
- In this repository, Compose sets `PROMETHEUS_RETENTION_TIME` (default **`200h`**) so operators can change retention without editing the YAML structure.
- Longer retention increases disk use under the `prometheus_data` volume.

## Grafana

- **Dashboards, folders, users, and API keys** live in Grafana’s database on the `grafana_data` Docker volume. There is no automatic expiry.
- **Panels** read metrics from Prometheus; historical depth for charts equals Prometheus retention, not Grafana’s disk usage for dashboards.
- For production, document who may delete dashboards and how volumes are backed up or rotated.

## PostgreSQL (`performance_metrics`, `security_findings`)

- Application models live in `backend/services/database_service.py`. Rows are not purged automatically by the app.
- Run `backend/sql/retention_cleanup.sql` on a schedule (for example weekly) using `psql` and `DATABASE_URL`, or equivalent automation against the `db` service.
- Adjust `INTERVAL` values in the script if your compliance regime requires different periods.

## AWS DynamoDB and S3 (Lambda-stored scans)

- **DynamoDB:** Terraform enables TTL on the `expires_at` numeric attribute (Unix epoch seconds). The scanner Lambda and the Python `DynamoDBService` set `expires_at` at write time using `SCAN_RESULTS_TTL_DAYS` (default **365**). Items **without** `expires_at` are not removed by TTL until updated or migrated.
- **S3:** Objects under `scan-results/` share the static-site bucket; a lifecycle rule expires them after `scan_results_s3_retention_days` (default **365**), aligned with DynamoDB for consistent reconstruction windows.

## Changing defaults

| Knob | Location |
|------|-----------|
| Prometheus retention | `PROMETHEUS_RETENTION_TIME` in `.env` or Compose environment |
| DynamoDB TTL attribute | Terraform `module.dynamodb` → `dynamodb_ttl_attribute_name`, `enable_dynamodb_ttl` |
| TTL horizon (days) | Terraform `scan_results_ttl_days` → Lambda `SCAN_RESULTS_TTL_DAYS`; set `SCAN_RESULTS_TTL_DAYS` for local/backend writers |
| S3 scan object expiry | Terraform `scan_results_s3_retention_days` |
| Postgres deletes | Edit intervals in `backend/sql/retention_cleanup.sql` |

## References

- `docker-compose.yml` — Prometheus and Grafana services  
- `infra/dynamodb/main.tf` — DynamoDB TTL  
- `infra/s3/main.tf` — Lifecycle rules including `scan-results/`  
- `infra/lambda/lambda_function.py` — `store_results` writes `expires_at`  
- `backend/services/dynamodb_service.py` — Scan record writes  
