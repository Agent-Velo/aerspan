import type { UserBase } from '@/api/types';

export const storageKeys = {
  user: 'user',
  status: 'status',
  systemName: 'system_name',
  logo: 'logo',
  footerHtml: 'footer_html',
  quotaPerUnit: 'quota_per_unit',
  quotaDisplayType: 'quota_display_type',
  displayInCurrency: 'display_in_currency',
  enableDrawing: 'enable_drawing',
  enableTask: 'enable_task',
  enableDataExport: 'enable_data_export',
  chats: 'chats',
  dataExportDefaultTime: 'data_export_default_time',
  defaultCollapseSidebar: 'default_collapse_sidebar',
  mjNotifyEnabled: 'mj_notify_enabled',
  docsLink: 'docs_link',

  language: 'i18nextLng',
  themeMode: 'theme-mode',
  aff: 'aff',

  noticeCloseDate: 'notice_close_date',
  noticeReadKeys: 'notice_read_keys',
  tableCompactModes: 'table_compact_modes',

  logsTableColumnsUser: 'logs-table-columns-user',
  mjLogsTableColumnsUser: 'mj-logs-table-columns-user',
  taskLogsTableColumnsUser: 'task-logs-table-columns-user',

  pageSizeLogs: 'page-size',
  pageSizeMj: 'mj-page-size',
  pageSizeTask: 'task-page-size',

  playgroundConfig: 'playground_config',
  playgroundMessages: 'playground_messages',

  fluentNotifySuppressed: 'fluent_notify_suppressed',
} as const;

export function safeJsonParse<T>(value: string | null): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

export function getStoredUser(): UserBase | null {
  return safeJsonParse<UserBase>(localStorage.getItem(storageKeys.user));
}

export function setStoredUser(user: UserBase) {
  localStorage.setItem(storageKeys.user, JSON.stringify(user));
}

export function clearStoredUser() {
  localStorage.removeItem(storageKeys.user);
}

export function getStoredUserId(): number | null {
  const user = getStoredUser();
  if (!user) return null;
  if (typeof user.id !== 'number') return null;
  return user.id;
}

export function getStoredThemeMode(): 'light' | 'dark' | 'auto' {
  const raw = localStorage.getItem(storageKeys.themeMode);
  if (raw === 'light' || raw === 'dark' || raw === 'auto') return raw;
  return 'auto';
}

export function setStoredThemeMode(mode: 'light' | 'dark' | 'auto') {
  localStorage.setItem(storageKeys.themeMode, mode);
}

export function setStatusCache(data: any) {
  localStorage.setItem(storageKeys.status, JSON.stringify(data));
  localStorage.setItem(storageKeys.systemName, data.system_name);
  localStorage.setItem(storageKeys.logo, data.logo);
  localStorage.setItem(storageKeys.footerHtml, data.footer_html);
  localStorage.setItem(storageKeys.quotaPerUnit, String(data.quota_per_unit));
  localStorage.setItem(storageKeys.displayInCurrency, String(data.display_in_currency));
  localStorage.setItem(storageKeys.quotaDisplayType, String(data.quota_display_type || 'USD'));
  localStorage.setItem(storageKeys.enableDrawing, String(data.enable_drawing));
  localStorage.setItem(storageKeys.enableTask, String(data.enable_task));
  localStorage.setItem(storageKeys.enableDataExport, String(data.enable_data_export));
  localStorage.setItem(storageKeys.chats, JSON.stringify(data.chats));
  localStorage.setItem(
    storageKeys.dataExportDefaultTime,
    String(data.data_export_default_time),
  );
  localStorage.setItem(
    storageKeys.defaultCollapseSidebar,
    String(data.default_collapse_sidebar),
  );
  localStorage.setItem(storageKeys.mjNotifyEnabled, String(data.mj_notify_enabled));

  if (data.docs_link) {
    localStorage.setItem(storageKeys.docsLink, data.docs_link);
  } else {
    localStorage.removeItem(storageKeys.docsLink);
  }
}

