/**
 * CSV export against the Flask backend (/api/findings/export/csv).
 */

export const FLASK_API_BASE =
  (import.meta.env.VITE_FLASK_API_URL as string | undefined)?.replace(/\/$/, "") ||
  "http://localhost:5001";

export type ExportSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type ExportFindingStatus = "OPEN" | "RESOLVED" | "SUPPRESSED";

export interface FindingsExportFilters {
  severities: ExportSeverity[];
  statuses: ExportFindingStatus[];
  startDate: string;
  endDate: string;
}

export function buildFindingsExportQueryString(filters: FindingsExportFilters): string {
  const p = new URLSearchParams();
  for (const s of filters.severities) {
    p.append("severity", s);
  }
  for (const st of filters.statuses) {
    p.append("status", st);
  }
  if (filters.startDate.trim()) {
    p.set("start_date", new Date(filters.startDate).toISOString());
  }
  if (filters.endDate.trim()) {
    p.set("end_date", new Date(filters.endDate).toISOString());
  }
  return p.toString();
}

/**
 * Uses fetch + Blob so Authorization headers work when JWT_SECRET is set on the backend.
 */
export async function downloadFindingsCsv(filters: FindingsExportFilters): Promise<void> {
  const qs = buildFindingsExportQueryString(filters);
  const url = `${FLASK_API_BASE}/api/findings/export/csv?${qs}`;
  const headers: HeadersInit = {};
  const token =
    (typeof localStorage !== "undefined" && localStorage.getItem("access_token")) ||
    (typeof localStorage !== "undefined" && localStorage.getItem("jwt")) ||
    (import.meta.env.VITE_JWT_TOKEN as string | undefined);
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  const res = await fetch(url, { headers });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Export failed (${res.status})`);
  }
  const blob = await res.blob();
  const cd = res.headers.get("Content-Disposition");
  let filename = "iam_findings.csv";
  const m = cd?.match(/filename="([^"]+)"/);
  if (m?.[1]) {
    filename = m[1];
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}
