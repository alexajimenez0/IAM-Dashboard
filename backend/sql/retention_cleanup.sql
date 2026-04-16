-- Periodic retention cleanup for PostgreSQL (A17 / issue #196).
-- Run on a schedule, for example from repo root (Docker Compose):
--   docker compose exec -T db psql -U postgres -d cybersecurity_db < backend/sql/retention_cleanup.sql
-- Or with DATABASE_URL on the host:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f backend/sql/retention_cleanup.sql
--
-- Adjust intervals below to match docs/operations/DATA_RETENTION.md and your compliance needs.

BEGIN;

-- Application performance samples (dashboard / metrics table)
DELETE FROM performance_metrics
WHERE timestamp < NOW() - INTERVAL '90 days';

-- Optional: long-lived resolved findings (uncomment if you want automatic pruning)
-- DELETE FROM security_findings
-- WHERE resolved = TRUE
--   AND updated_at < NOW() - INTERVAL '730 days';

COMMIT;
