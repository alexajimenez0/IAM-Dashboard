import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useScanResults } from './ScanResultsContext';
import { useAuth } from './AuthContext';
import { getAccounts } from '../services/accounts';

export interface AwsConnectedAccount {
  id: string;
  label: string;
  accountId: string;
}

const STORAGE_SELECTED = 'iam-dashboard-selected-aws-account';
const DATA_MODE = (import.meta.env.VITE_DATA_MODE || 'live').toLowerCase();
const IS_MOCK = DATA_MODE === 'mock';

/** Mock connections used in mock mode. IDs align with scan storage keys. */
export const MOCK_AWS_ACCOUNTS: AwsConnectedAccount[] = [
  { id: 'mock-prod', label: 'Production', accountId: '111122223333' },
  { id: 'mock-staging', label: 'Staging', accountId: '222233334444' },
  { id: 'mock-dev', label: 'Development', accountId: '333344445555' },
];

/** Fallback used in live mode when GET /accounts fails or returns nothing. */
const FALLBACK_MAIN_ACCOUNT: AwsConnectedAccount = {
  id: 'main',
  label: 'Main Account',
  accountId: '',
};

function readStoredSelectedId(): string | null {
  try {
    const v = localStorage.getItem(STORAGE_SELECTED);
    return v?.trim() || null;
  } catch {
    return null;
  }
}

function writeStoredSelectedId(id: string): void {
  try {
    localStorage.setItem(STORAGE_SELECTED, id);
  } catch {
    /* ignore */
  }
}

interface AwsAccountContextValue {
  accounts: AwsConnectedAccount[];
  selectedAccount: AwsConnectedAccount | null;
  selectAccount: (id: string) => void;
  isLoadingAccounts: boolean;
  accountsError: string | null;
  refreshAccounts: () => Promise<void>;
}

const AwsAccountContext = createContext<AwsAccountContextValue | undefined>(
  undefined,
);

export function AwsAccountProvider({ children }: { children: ReactNode }) {
  const { ensureMockFullScanIfEmpty } = useScanResults();
  const auth = useAuth();

  const [accounts, setAccounts] = useState<AwsConnectedAccount[]>(
    IS_MOCK ? MOCK_AWS_ACCOUNTS : [FALLBACK_MAIN_ACCOUNT],
  );
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    const initial = IS_MOCK ? MOCK_AWS_ACCOUNTS : [FALLBACK_MAIN_ACCOUNT];
    if (initial.length === 0) return null;
    const stored = readStoredSelectedId();
    if (stored && initial.some((a) => a.id === stored)) return stored;
    return initial[0].id;
  });
  const [isLoadingAccounts, setIsLoadingAccounts] = useState(!IS_MOCK);
  const [accountsError, setAccountsError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadAccounts = useCallback(async () => {
    if (IS_MOCK || !auth.isAuthenticated) return;

    setIsLoadingAccounts(true);
    setAccountsError(null);

    try {
      const response = await getAccounts();
      if (!mountedRef.current) return;

      const raw = Array.isArray(response?.accounts) ? response.accounts : [];
      const mapped: AwsConnectedAccount[] = raw
        .filter((a) => typeof a.account_id === 'string' && a.account_id.trim())
        .map((a) => {
          const accountId = a.account_id.trim();
          const accountName =
            typeof a.account_name === 'string' && a.account_name.trim()
              ? a.account_name.trim()
              : accountId;
          return { id: accountId, label: accountName, accountId };
        });

      const next = mapped.length > 0 ? mapped : [FALLBACK_MAIN_ACCOUNT];
      setAccounts(next);

      setSelectedId((prev) => {
        const stored = prev ?? readStoredSelectedId();
        if (stored && next.some((a) => a.id === stored)) return stored;
        const first = next[0].id;
        writeStoredSelectedId(first);
        return first;
      });
    } catch (err) {
      if (!mountedRef.current) return;
      const msg = err instanceof Error ? err.message : 'Unable to load AWS accounts.';
      setAccountsError(msg);
      setAccounts([FALLBACK_MAIN_ACCOUNT]);
      setSelectedId((prev) => {
        if (prev === FALLBACK_MAIN_ACCOUNT.id) return prev;
        writeStoredSelectedId(FALLBACK_MAIN_ACCOUNT.id);
        return FALLBACK_MAIN_ACCOUNT.id;
      });
    } finally {
      if (mountedRef.current) setIsLoadingAccounts(false);
    }
  }, [auth.isAuthenticated]);

  // Load accounts once auth is ready in live mode
  useEffect(() => {
    if (IS_MOCK || auth.isLoading) return;
    if (auth.isAuthenticated) {
      void loadAccounts();
    } else {
      setIsLoadingAccounts(false);
    }
  }, [auth.isLoading, auth.isAuthenticated, loadAccounts]);

  // Keep selectedId valid when accounts list changes
  useEffect(() => {
    if (accounts.length === 0) {
      setSelectedId(null);
      return;
    }
    setSelectedId((prev) => {
      if (prev && accounts.some((a) => a.id === prev)) return prev;
      const first = accounts[0].id;
      writeStoredSelectedId(first);
      return first;
    });
  }, [accounts]);

  const selectedAccount = useMemo(
    () => (selectedId ? (accounts.find((a) => a.id === selectedId) ?? null) : null),
    [accounts, selectedId],
  );

  // Seed mock scan data only in mock mode
  useEffect(() => {
    if (!IS_MOCK || !selectedAccount) return;
    ensureMockFullScanIfEmpty(
      selectedAccount.id,
      selectedAccount.accountId,
      selectedAccount.label,
    );
  }, [selectedAccount, ensureMockFullScanIfEmpty]);

  const selectAccount = useCallback(
    (id: string) => {
      if (!accounts.some((a) => a.id === id)) return;
      setSelectedId(id);
      writeStoredSelectedId(id);
    },
    [accounts],
  );

  const refreshAccounts = useCallback(async () => {
    if (IS_MOCK) return;
    await loadAccounts();
  }, [loadAccounts]);

  const value = useMemo(
    () => ({
      accounts,
      selectedAccount,
      selectAccount,
      isLoadingAccounts,
      accountsError,
      refreshAccounts,
    }),
    [accounts, selectedAccount, selectAccount, isLoadingAccounts, accountsError, refreshAccounts],
  );

  return (
    <AwsAccountContext.Provider value={value}>
      {children}
    </AwsAccountContext.Provider>
  );
}

export function useAwsAccount(): AwsAccountContextValue {
  const ctx = useContext(AwsAccountContext);
  if (!ctx) {
    throw new Error('useAwsAccount must be used within AwsAccountProvider');
  }
  return ctx;
}
