import { useEffect, useState } from 'react';
import { fetchJson } from '@/api/client';
import type { ApiResponse } from '@/api/types';

export function useCachedText(cacheKey: string, apiPath: string) {
  const [value, setValue] = useState<string>(() => localStorage.getItem(cacheKey) || '');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetchJson<ApiResponse<string>>(apiPath);
        const text = res.data || '';
        localStorage.setItem(cacheKey, text);
        if (!cancelled) setValue(text);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [cacheKey, apiPath]);

  return { value, loading };
}

