import { useMemo } from 'react';
import { useAuth } from '@/stores/auth/AuthStore';
import { useStatus } from '@/stores/status/StatusStore';

export type SidebarConfig = Record<string, any>;

const DEFAULT_ADMIN_CONFIG: SidebarConfig = {
  chat: {
    enabled: true,
    playground: true,
    chat: true,
  },
  console: {
    enabled: true,
    detail: true,
    token: true,
    log: true,
    midjourney: true,
    task: true,
  },
  personal: {
    enabled: true,
    topup: true,
    personal: true,
  },
};

function isEnabledFlag(value: unknown): boolean {
  return value === true || value === 'true' || value === 1 || value === '1';
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function mergeAdminConfig(savedConfig: unknown): SidebarConfig {
  const merged = deepClone(DEFAULT_ADMIN_CONFIG);
  if (!savedConfig || typeof savedConfig !== 'object') return merged;

  for (const [sectionKey, sectionConfig] of Object.entries(savedConfig as any)) {
    if (!sectionConfig || typeof sectionConfig !== 'object') continue;
    merged[sectionKey] = { ...(merged[sectionKey] || {}), ...(sectionConfig as any) };
  }

  return merged;
}

function parseMaybeJson(value: unknown): any {
  if (!value) return null;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }
  return value;
}

export function useSidebarModules() {
  const { status } = useStatus();
  const { user } = useAuth();

  return useMemo(() => {
    const adminConfig = mergeAdminConfig(parseMaybeJson(status?.SidebarModulesAdmin));
    const userConfig = parseMaybeJson(user?.sidebar_modules) || null;
    const permissionsConfig = (user?.permissions as any)?.sidebar_modules || null;

    const finalConfig: SidebarConfig = {};

    for (const sectionKey of Object.keys(adminConfig)) {
      const adminSection = adminConfig[sectionKey] || {};
      const userSection = userConfig?.[sectionKey] || null;
      const permsSection = permissionsConfig?.[sectionKey] ?? null;

      if (adminSection.enabled === false) {
        finalConfig[sectionKey] = { enabled: false };
        continue;
      }
      if (permsSection === false) {
        finalConfig[sectionKey] = { enabled: false };
        continue;
      }

      const sectionEnabled = userSection ? userSection.enabled !== false : true;
      finalConfig[sectionKey] = { enabled: sectionEnabled };

      for (const moduleKey of Object.keys(adminSection)) {
        if (moduleKey === 'enabled') continue;
        const adminAllowed = adminSection[moduleKey] === true;
        const userAllowed = userSection ? userSection[moduleKey] !== false : true;

        let permissionAllowed = true;
        if (permsSection && typeof permsSection === 'object') {
          if ((permsSection as any)[moduleKey] === false) permissionAllowed = false;
        }

        finalConfig[sectionKey][moduleKey] =
          adminAllowed && userAllowed && permissionAllowed && sectionEnabled;
      }
    }

    // Apply status-level module switches.
    if (!isEnabledFlag(status?.enable_drawing) && finalConfig.console) {
      finalConfig.console.midjourney = false;
    }
    if (!isEnabledFlag(status?.enable_task) && finalConfig.console) {
      finalConfig.console.task = false;
    }

    const isModuleVisible = (sectionKey: string, moduleKey?: string) => {
      if (!moduleKey) return finalConfig[sectionKey]?.enabled === true;
      return finalConfig[sectionKey]?.[moduleKey] === true;
    };

    const hasSectionVisibleModules = (sectionKey: string) => {
      const section = finalConfig[sectionKey];
      if (!section?.enabled) return false;
      return Object.keys(section).some((k) => k !== 'enabled' && section[k] === true);
    };

    return { adminConfig, userConfig, finalConfig, isModuleVisible, hasSectionVisibleModules };
  }, [
    status?.SidebarModulesAdmin,
    status?.enable_drawing,
    status?.enable_task,
    user?.sidebar_modules,
    user?.permissions,
  ]);
}
