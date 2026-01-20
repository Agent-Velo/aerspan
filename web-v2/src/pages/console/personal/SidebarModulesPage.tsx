import { useEffect, useMemo, useState } from 'react';
import { fetchJson } from '@/api/client';
import type { ApiResponse } from '@/api/types';
import { toast } from '@/ui/toast';
import { useAuth } from '@/stores/auth/AuthStore';
import { useStatus } from '@/stores/status/StatusStore';
import { Button, Card, Checkbox, Label } from '@/components/ui/heroui';
import { PageHeader } from './components/PageHeader';
import { parseJson } from './helpers';

export function SidebarModulesPage() {
  const { user, refreshSelf } = useAuth();
  const { status } = useStatus();

  const [sidebarDraft, setSidebarDraft] = useState<Record<string, any>>(() =>
    parseJson<Record<string, any>>(user?.sidebar_modules) || {},
  );

  useEffect(() => {
    setSidebarDraft(parseJson<Record<string, any>>(user?.sidebar_modules) || {});
  }, [user?.sidebar_modules]);

  const adminSidebarConfig = useMemo(() => {
    const fallback = {
      chat: { enabled: true, playground: true, chat: true },
      console: { enabled: true, detail: true, token: true, log: true, midjourney: true, task: true },
      personal: { enabled: true, topup: true, personal: true },
    };
    return parseJson<Record<string, any>>(status?.SidebarModulesAdmin) || fallback;
  }, [status?.SidebarModulesAdmin]);

  const sidebarSettingsAllowed = Boolean((user?.permissions as any)?.sidebar_settings !== false);
  const sidebarPermissionConfig = (user?.permissions as any)?.sidebar_modules || null;

  const saveSidebarModules = async () => {
    await fetchJson<ApiResponse<any>>('/api/user/self', {
      method: 'PUT',
      body: { sidebar_modules: JSON.stringify(sidebarDraft) },
    });
    toast.success('Sidebar updated');
    await refreshSelf();
  };

  if (!sidebarSettingsAllowed) {
    return (
      <div className='space-y-4'>
        <PageHeader
          title='Sidebar Modules'
          description='Customize which sidebar items are visible'
        />
        <Card>
          <Card.Content>
            <div className='text-sm text-muted'>
              Sidebar settings are not available for this account.
            </div>
          </Card.Content>
        </Card>
      </div>
    );
  }

  return (
    <div className='space-y-4'>
      <PageHeader
        title='Sidebar Modules'
        description='Customize which sidebar items are visible'
      />

      <div className='space-y-4'>
        {Object.entries(adminSidebarConfig).map(([sectionKey, sectionValue]) => {
          const adminSection = sectionValue as any;
          if (adminSection?.enabled === false) return null;

          const userSection = sidebarDraft?.[sectionKey] || {};
          const permsSection = sidebarPermissionConfig?.[sectionKey] ?? null;
          const sectionAllowed = permsSection !== false;
          const sectionEnabled = userSection?.enabled !== false;
          const showId = `sidebar-${sectionKey}-enabled`;

          return (
            <Card key={sectionKey} variant='secondary'>
              <Card.Header>
                <div className='flex w-full items-center justify-between gap-2'>
                  <Card.Title className='text-sm capitalize'>{sectionKey}</Card.Title>
                  <div className='flex items-center gap-3'>
                    <Checkbox
                      id={showId}
                      isSelected={sectionEnabled}
                      isDisabled={!sectionAllowed}
                      onChange={(isSelected) => {
                        setSidebarDraft((prev) => ({
                          ...prev,
                          [sectionKey]: { ...(prev[sectionKey] || {}), enabled: isSelected },
                        }));
                      }}
                    >
                      <Checkbox.Control>
                        <Checkbox.Indicator />
                      </Checkbox.Control>
                    </Checkbox>
                    <Label htmlFor={showId}>Show</Label>
                  </div>
                </div>
              </Card.Header>
              <Card.Content>
                <div className='grid grid-cols-1 gap-2 md:grid-cols-2'>
                  {Object.keys(adminSection)
                    .filter((k) => k !== 'enabled')
                    .map((moduleKey) => {
                      const adminAllowed = adminSection[moduleKey] === true;
                      let permissionAllowed = true;
                      if (permsSection && typeof permsSection === 'object') {
                        if ((permsSection as any)[moduleKey] === false) permissionAllowed = false;
                      }
                      const userAllowed = userSection ? userSection[moduleKey] !== false : true;
                      const moduleId = `sidebar-${sectionKey}-${moduleKey}`;
                      const moduleDisabled = !adminAllowed || !permissionAllowed || !sectionAllowed;

                      return (
                        <Card key={moduleKey} variant='tertiary'>
                          <Card.Content className='flex items-center justify-between gap-2 py-2'>
                            <span className='text-sm capitalize'>{moduleKey}</span>
                            <Checkbox
                              id={moduleId}
                              isSelected={userAllowed}
                              isDisabled={moduleDisabled}
                              onChange={(isSelected) => {
                                setSidebarDraft((prev) => ({
                                  ...prev,
                                  [sectionKey]: {
                                    ...(prev[sectionKey] || {}),
                                    [moduleKey]: isSelected,
                                  },
                                }));
                              }}
                            >
                              <Checkbox.Control>
                                <Checkbox.Indicator />
                              </Checkbox.Control>
                            </Checkbox>
                          </Card.Content>
                        </Card>
                      );
                    })}
                </div>
              </Card.Content>
            </Card>
          );
        })}

        <Button onPress={() => saveSidebarModules().catch(() => {})}>Save sidebar</Button>
      </div>
    </div>
  );
}
