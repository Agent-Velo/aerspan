import { Outlet, useMatch, useNavigate, useResolvedPath } from 'react-router-dom';
import type { ReactNode } from 'react';
import { Header } from '@/layouts/Header';
import { useSidebarModules } from '@/hooks/useSidebarModules';
import { useStatus } from '@/stores/status/StatusStore';
import { Button, Surface } from '@/components/ui/heroui';

function SidebarNavButton({
  to,
  end,
  children,
}: {
  to: string;
  end?: boolean;
  children: ReactNode;
}) {
  const navigate = useNavigate();
  const resolved = useResolvedPath(to);
  const match = useMatch({ path: resolved.pathname, end });

  return (
    <Button
      fullWidth
      size='sm'
      variant={match ? 'secondary' : 'ghost'}
      className='justify-start'
      onPress={() => navigate(to)}
    >
      {children}
    </Button>
  );
}

export function ConsoleLayout() {
  const { hasSectionVisibleModules, isModuleVisible } = useSidebarModules();
  const { status } = useStatus();

  const chats = Array.isArray(status?.chats) ? status?.chats : [];
  const chatLinks = chats
    .map((obj: any, idx: number) => {
      const entries = obj && typeof obj === 'object' ? Object.entries(obj) : [];
      const [name, url] = entries[0] || [];
      if (!name || typeof url !== 'string') return null;
      if (url.startsWith('fluent')) return null;
      return { idx, name };
    })
    .filter(Boolean) as Array<{ idx: number; name: string }>;

  return (
    <div className='min-h-screen'>
      <Header />
      <div className='mx-auto flex w-full max-w-7xl gap-4 px-4 py-6'>
        <Surface
          className='hidden w-60 shrink-0 rounded-lg p-2 md:block'
          variant='secondary'
        >
          {hasSectionVisibleModules('chat') && (
            <div className='mb-4'>
              <div className='px-3 py-1 text-xs font-semibold uppercase text-muted'>Chat</div>
              {isModuleVisible('chat', 'playground') && (
                <SidebarNavButton to='/playground'>Playground</SidebarNavButton>
              )}
              {isModuleVisible('chat', 'chat') &&
                chatLinks.map((c) => (
                  <SidebarNavButton key={c.idx} to={`/chat/${c.idx}`}>
                    {c.name}
                  </SidebarNavButton>
                ))}
            </div>
          )}

          {hasSectionVisibleModules('console') && (
            <div className='mb-4'>
              <div className='px-3 py-1 text-xs font-semibold uppercase text-muted'>Console</div>
              {isModuleVisible('console', 'detail') && (
                <SidebarNavButton to='/dashboard' end>
                  Dashboard
                </SidebarNavButton>
              )}
              {isModuleVisible('console', 'token') && (
                <SidebarNavButton to='/api-keys'>API Keys</SidebarNavButton>
              )}
              {isModuleVisible('console', 'log') && (
                <>
                  <SidebarNavButton to='/usage-log'>Usage Logs</SidebarNavButton>
                  <SidebarNavButton to='/audit-log'>Audit Logs</SidebarNavButton>
                </>
              )}
              {isModuleVisible('console', 'midjourney') && (
                <SidebarNavButton to='/midjourney'>Midjourney</SidebarNavButton>
              )}
              {isModuleVisible('console', 'task') && (
                <SidebarNavButton to='/task'>Tasks</SidebarNavButton>
              )}
            </div>
          )}

          {hasSectionVisibleModules('personal') && (
            <div>
              <div className='px-3 py-1 text-xs font-semibold uppercase text-muted'>Account</div>
              {isModuleVisible('personal', 'topup') && (
                <SidebarNavButton to='/billing'>Billing</SidebarNavButton>
              )}
              {isModuleVisible('personal', 'personal') && (
                <SidebarNavButton to='/personal'>Personal</SidebarNavButton>
              )}
            </div>
          )}
        </Surface>

        <main className='min-w-0 flex-1'>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
