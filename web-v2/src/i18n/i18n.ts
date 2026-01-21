import i18n from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';

let initialized = false;

export function ensureI18n() {
  if (initialized) return i18n;

  i18n
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
      resources: {
        en: { translation: {} },
      },
      fallbackLng: 'en',
      supportedLngs: ['en'],
      interpolation: {
        escapeValue: false,
      },
      detection: {
        order: ['localStorage'],
        caches: ['localStorage'],
        lookupLocalStorage: 'i18nextLng',
      },
      react: {
        useSuspense: false,
      },
    });

  initialized = true;
  return i18n;
}

