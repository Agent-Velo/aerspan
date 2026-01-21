import type { PropsWithChildren } from 'react';
import { createContext, useCallback, useEffect, useMemo, useState } from 'react';
import { getStoredThemeMode, setStoredThemeMode } from '@/lib/storage';

export type ThemeMode = 'light' | 'dark' | 'auto';

type ThemeContextValue = {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  resolvedTheme: 'light' | 'dark';
};

export const ThemeContext = createContext<ThemeContextValue>({
  mode: 'auto',
  setMode: () => {},
  resolvedTheme: 'light',
});

function resolveTheme(mode: ThemeMode): 'light' | 'dark' {
  if (mode === 'light') return 'light';
  if (mode === 'dark') return 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function ThemeProvider({ children }: PropsWithChildren) {
  const [mode, setModeState] = useState<ThemeMode>(() => getStoredThemeMode());
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>(() => resolveTheme(mode));

  const apply = useCallback(
    (nextMode: ThemeMode) => {
      const nextResolved = resolveTheme(nextMode);
      setResolvedTheme(nextResolved);
      document.documentElement.setAttribute(
        'data-theme',
        nextResolved === 'dark' ? 'graphite-dark' : 'graphite'
      );
    },
    [],
  );

  const setMode = useCallback(
    (nextMode: ThemeMode) => {
      setModeState(nextMode);
      setStoredThemeMode(nextMode);
      apply(nextMode);
    },
    [apply],
  );

  useEffect(() => {
    apply(mode);
  }, [apply, mode]);

  useEffect(() => {
    if (mode !== 'auto') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => apply('auto');

    media.addEventListener('change', handler);
    return () => media.removeEventListener('change', handler);
  }, [apply, mode]);

  const value = useMemo<ThemeContextValue>(
    () => ({ mode, setMode, resolvedTheme }),
    [mode, resolvedTheme, setMode],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
