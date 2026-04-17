/**
 * Account Management API Service for IAM Dashboard
 * Handles account registration, listing, and deletion via the account management Lambda.
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

export interface AccountRecord {
  account_id: string;
  account_name: string;
  date_added?: string;
  added_by?: string;
  is_main?: boolean;
}

export interface GetAccountsResponse {
  accounts: AccountRecord[];
  total?: number;
}

export interface CreateAccountRequest {
  account_id: string;
  account_name: string;
}

export interface CreateAccountResponse {
  message?: string;
  account?: AccountRecord;
}

export interface DeleteAccountResponse {
  message?: string;
  account_id?: string;
}

interface AccountsErrorResponse {
  error?: string;
  message?: string;
}

async function accountsRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  let responseData: AccountsErrorResponse | T | null = null;
  const responseText = await response.text();

  if (responseText.trim()) {
    try {
      responseData = JSON.parse(responseText) as AccountsErrorResponse | T;
    } catch {
      if (!response.ok) {
        throw new Error(`Request failed: ${response.status} ${response.statusText}`);
      }
      throw new Error("Invalid JSON response from accounts API");
    }
  }

  if (!response.ok) {
    const err = (responseData as AccountsErrorResponse) || {};
    throw new Error(err.message || err.error || `Request failed: ${response.status}`);
  }

  return (responseData ?? {}) as T;
}

/**
 * List all registered accounts (includes main account from backend).
 */
export async function getAccounts(): Promise<GetAccountsResponse> {
  return accountsRequest<GetAccountsResponse>("/accounts", { method: "GET" });
}

/**
 * Register a new AWS account.
 */
export async function createAccount(
  request: CreateAccountRequest
): Promise<CreateAccountResponse> {
  if (!request.account_id?.trim()) {
    throw new Error("account_id is required");
  }
  if (!request.account_name?.trim()) {
    throw new Error("account_name is required");
  }

  return accountsRequest<CreateAccountResponse>("/accounts", {
    method: "POST",
    body: JSON.stringify({
      account_id: request.account_id.trim(),
      account_name: request.account_name.trim(),
    }),
  });
}

/**
 * Remove a registered account by ID.
 */
export async function deleteAccount(
  accountId: string
): Promise<DeleteAccountResponse> {
  if (!accountId?.trim()) {
    throw new Error("accountId is required");
  }

  return accountsRequest<DeleteAccountResponse>(
    `/accounts/${encodeURIComponent(accountId.trim())}`,
    { method: "DELETE" }
  );
}
