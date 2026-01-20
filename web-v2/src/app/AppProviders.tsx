import type { PropsWithChildren } from 'react';
import { I18nProvider } from '@/i18n/I18nProvider';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { StatusProvider } from '@/stores/status/StatusStore';
import { AuthProvider } from '@/stores/auth/AuthStore';

export function AppProviders({ children }: PropsWithChildren) {
  return (
    <I18nProvider>
      <ThemeProvider>
        <StatusProvider>
          <AuthProvider>{children}</AuthProvider>
        </StatusProvider>
      </ThemeProvider>
    </I18nProvider>
  );
}

