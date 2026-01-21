import { storageKeys } from '@/lib/storage';

export function getSystemName(): string {
  return localStorage.getItem(storageKeys.systemName) || 'Aerspan';
}

export function getLogoUrl(): string {
  return localStorage.getItem(storageKeys.logo) || '/logo.png';
}

export function getFooterHtml(): string {
  return localStorage.getItem(storageKeys.footerHtml) || '';
}

export function getDocsLink(): string | null {
  const raw = localStorage.getItem(storageKeys.docsLink);
  return raw && raw.trim() ? raw.trim() : null;
}

