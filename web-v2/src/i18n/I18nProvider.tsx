import type { PropsWithChildren } from 'react';
import { useEffect } from 'react';
import { I18nextProvider } from 'react-i18next';
import { ensureI18n } from '@/i18n/i18n';

export function I18nProvider({ children }: PropsWithChildren) {
  const i18n = ensureI18n();

  useEffect(() => {
    document.documentElement.lang = i18n.language || 'en';
  }, [i18n.language]);

  return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>;
}

