export const ACCOUNTS_CACHE_KEY = "iam-dashboard-accounts-cache";

export function clearAccountsCache(): void {
  try {
    sessionStorage.removeItem(ACCOUNTS_CACHE_KEY);
  } catch {
    /* ignore */
  }
}
