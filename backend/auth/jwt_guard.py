"""
Optional HS256 JWT verification for API routes (stdlib only).

If JWT_SECRET is not set, auth is skipped so local dev matches existing
unauthenticated API resources. When JWT_SECRET is set, requests must include
Authorization: Bearer <jwt> with a valid HS256 signature.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import logging
import os
import time
from functools import wraps
from typing import Callable

from flask import jsonify, request

logger = logging.getLogger(__name__)


def _b64url_decode(data: str) -> bytes:
    pad = "=" * ((4 - len(data) % 4) % 4)
    return base64.urlsafe_b64decode(data + pad)


def verify_jwt_hs256(token: str, secret: str) -> bool:
    """Verify HS256 JWT signature and optional exp claim."""
    try:
        parts = token.split(".")
        if len(parts) != 3:
            return False
        header_b64, payload_b64, sig_b64 = parts
        signing_input = f"{header_b64}.{payload_b64}".encode("ascii")
        expected_sig = hmac.new(
            secret.encode("utf-8"), signing_input, hashlib.sha256
        ).digest()
        try:
            sent_sig = _b64url_decode(sig_b64)
        except Exception:
            return False
        if not hmac.compare_digest(expected_sig, sent_sig):
            return False
        payload = json.loads(_b64url_decode(payload_b64).decode("utf-8"))
        exp = payload.get("exp")
        if exp is not None:
            try:
                if time.time() > float(exp):
                    return False
            except (TypeError, ValueError):
                return False
        return True
    except Exception:
        return False


def require_jwt(view_func: Callable):
    """
    Protect a view when JWT_SECRET is set; otherwise no-op (dev parity with
    other Flask resources in this repo).
    """

    @wraps(view_func)
    def wrapped(*args, **kwargs):
        secret = os.environ.get("JWT_SECRET", "").strip()
        if not secret:
            if os.environ.get("FLASK_ENV") == "development":
                return view_func(*args, **kwargs)
            logger.critical("JWT_SECRET is not configured")
            return (
                jsonify(
                    {"error": "Service unavailable", "message": "JWT auth is not configured"}
                ),
                503,
            )

        authz = request.headers.get("Authorization", "")
        if not authz.startswith("Bearer "):
            return jsonify({"error": "Unauthorized", "message": "Missing bearer token"}), 401
        token = authz[7:].strip()
        if not token or not verify_jwt_hs256(token, secret):
            logger.warning("JWT verification failed for %s", request.path)
            return jsonify({"error": "Unauthorized", "message": "Invalid or expired token"}), 401
        return view_func(*args, **kwargs)

    return wrapped
