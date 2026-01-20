import type { PropsWithChildren } from 'react';
import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { fetchJson } from '@/api/client';
import type { ApiResponse } from '@/api/types';
import { setStatusCache } from '@/lib/storage';

export type Status = Record<string, any> & {
  setup?: boolean;
  system_name?: string;
  logo?: string;
  footer_html?: string;
  docs_link?: string;
  HeaderNavModules?: string;
  SidebarModulesAdmin?: string;
  server_address?: string;
};

type StatusContextValue = {
  status: Status | null;
  loaded: boolean;
  error: string | null;
  refreshStatus: () => Promise<void>;
};

const StatusContext = createContext<StatusContextValue>({
  status: null,
  loaded: false,
  error: null,
  refreshStatus: async () => {},
});

function updateTitleAndFavicon(status: Status) {
  if (status.system_name) {
    document.title = status.system_name;
  }
  if (status.logo) {
    const linkElement = document.querySelector<HTMLLinkElement>("link[rel~='icon']");
    if (linkElement) linkElement.href = status.logo;
  }
}

export function StatusProvider({ children }: PropsWithChildren) {
  const [status, setStatus] = useState<Status | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshStatus = useCallback(async () => {
    try {
      setError(null);
      const res = await fetchJson<ApiResponse<Status>>('/api/status');
      setStatus(res.data);
      setStatusCache(res.data);
      updateTitleAndFavicon(res.data);
      setLoaded(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load status';
      setError(message);
      setLoaded(true);
    }
  }, []);

  const value = useMemo<StatusContextValue>(
    () => ({ status, loaded, error, refreshStatus }),
    [status, loaded, error, refreshStatus],
  );

  return <StatusContext.Provider value={value}>{children}</StatusContext.Provider>;
}

export function useStatus() {
  return useContext(StatusContext);
}
