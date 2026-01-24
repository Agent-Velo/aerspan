import { NavLink, useMatch, useNavigate, useResolvedPath } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useContext, useMemo, useState } from 'react';
import { ExternalLink, LogOut, Menu, Moon, Sun } from 'lucide-react';
import { getDocsLink, getLogoUrl, getSystemName } from '@/lib/branding';
import { useAuth } from '@/stores/auth/AuthStore';
import { useStatus } from '@/stores/status/StatusStore';
import { useSidebarModules } from '@/hooks/useSidebarModules';
import { NoticeCenterButton } from '@/components/NoticeCenter';
import { ThemeContext } from '@/theme/ThemeProvider';
import { Button, Modal } from '@/components/ui/heroui';

function isPricingEnabled(headerNavModules?: string): boolean {
  if (!headerNavModules) return true;
  try {
    const modules = JSON.parse(headerNavModules);
    const pricing = modules?.pricing;
    if (typeof pricing === 'boolean') return pricing;
    if (pricing && typeof pricing === 'object') return pricing.enabled !== false;
  } catch {
    // ignore
  }
  return true;
}

function HeaderNavButton({
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
      size='sm'
      variant={match ? 'secondary' : 'ghost'}
      onPress={() => navigate(to)}
    >
      {children}
    </Button>
  );
}

export function Header() {
  const { user, logout } = useAuth();
  const { status } = useStatus();
  const { hasSectionVisibleModules, isModuleVisible } = useSidebarModules();
  const { mode, setMode, resolvedTheme } = useContext(ThemeContext);
  const navigate = useNavigate();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const showModels = isPricingEnabled(status?.HeaderNavModules);

  const docsLink = useMemo(() => {
    return (status?.docs_link as string | undefined) || getDocsLink();
  }, [status?.docs_link]);

  const chatLinks = useMemo(() => {
    const chats = Array.isArray(status?.chats) ? status?.chats : [];
    return chats
      .map((obj: any, idx: number) => {
        const entries = obj && typeof obj === 'object' ? Object.entries(obj) : [];
        const [name, url] = entries[0] || [];
        if (!name || typeof url !== 'string') return null;
        if (url.startsWith('fluent')) return null;
        return { idx, name };
      })
      .filter(Boolean) as Array<{ idx: number; name: string }>;
  }, [status?.chats]);

  return (
    <header className='app-header'>
      <div className='mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3'>
        <div className='flex min-w-0 items-center gap-3'>
          <NavLink to='/' className='flex min-w-0 items-center gap-2'>
            <img src={getLogoUrl()} alt='logo' className='h-7 w-7 rounded' />
            <span className='truncate text-sm font-semibold'>{getSystemName()}</span>
          </NavLink>
          <nav className='hidden items-center gap-1 md:flex'>
            <HeaderNavButton to='/dashboard'>
              Dashboard
            </HeaderNavButton>
            {showModels ? (
              <HeaderNavButton to='/models' end>
                Models
              </HeaderNavButton>
            ) : null}
            {docsLink ? (
              <Button
                size='sm'
                variant='ghost'
                onPress={() => window.open(docsLink, '_blank', 'noopener,noreferrer')}
              >
                Docs
                <ExternalLink size={14} className='ml-1' />
              </Button>
            ) : null}
          </nav>
        </div>

        <div className='flex items-center gap-2'>
          <Modal isOpen={mobileNavOpen} onOpenChange={setMobileNavOpen}>
            <Button
              isIconOnly
              aria-label='Open menu'
              variant='tertiary'
              className='md:hidden'
            >
              <Menu size={16} />
            </Button>

            <Modal.Backdrop>
              <Modal.Container size='sm'>
                <Modal.Dialog>
                  <Modal.CloseTrigger />
                  <Modal.Header>
                    <Modal.Heading>Menu</Modal.Heading>
                  </Modal.Header>
                  <Modal.Body>
                    <div className='space-y-4'>
                      <div className='space-y-2'>
                        <div className='px-1 text-xs font-semibold uppercase text-muted'>
                          Navigation
                        </div>
                        <Button
                          fullWidth
                          variant='ghost'
                          className='justify-start'
                          onPress={() => {
                            setMobileNavOpen(false);
                            navigate('/dashboard');
                          }}
                        >
                          Dashboard
                        </Button>
                        {showModels ? (
                          <Button
                            fullWidth
                            variant='ghost'
                            className='justify-start'
                            onPress={() => {
                              setMobileNavOpen(false);
                              navigate('/models');
                            }}
                          >
                            Models
                          </Button>
                        ) : null}
                        {docsLink ? (
                          <Button
                            fullWidth
                            variant='ghost'
                            className='justify-start'
                            onPress={() => {
                              setMobileNavOpen(false);
                              window.open(docsLink, '_blank', 'noopener,noreferrer');
                            }}
                          >
                            <span className='flex items-center gap-2'>
                              Docs
                              <ExternalLink size={14} />
                            </span>
                          </Button>
                        ) : null}
                      </div>

                      {user && hasSectionVisibleModules('chat') ? (
                        <div className='space-y-2'>
                          <div className='px-1 text-xs font-semibold uppercase text-muted'>Chat</div>
                          {isModuleVisible('chat', 'playground') ? (
                            <Button
                              fullWidth
                              variant='ghost'
                              className='justify-start'
                              onPress={() => {
                                setMobileNavOpen(false);
                                navigate('/playground');
                              }}
                            >
                              Playground
                            </Button>
                          ) : null}
                          {isModuleVisible('chat', 'chat')
                            ? chatLinks.map((c) => (
                                <Button
                                  key={c.idx}
                                  fullWidth
                                  variant='ghost'
                                  className='justify-start'
                                  onPress={() => {
                                    setMobileNavOpen(false);
                                    navigate(`/chat/${c.idx}`);
                                  }}
                                >
                                  {c.name}
                                </Button>
                              ))
                            : null}
                        </div>
                      ) : null}

                      {user && hasSectionVisibleModules('console') ? (
                        <div className='space-y-2'>
                          <div className='px-1 text-xs font-semibold uppercase text-muted'>Console</div>
                          {isModuleVisible('console', 'token') ? (
                            <Button
                              fullWidth
                              variant='ghost'
                              className='justify-start'
                              onPress={() => {
                                setMobileNavOpen(false);
                                navigate('/api-keys');
                              }}
                            >
                              API Keys
                            </Button>
                          ) : null}
                          {isModuleVisible('console', 'log') ? (
                            <>
                              <Button
                                fullWidth
                                variant='ghost'
                                className='justify-start'
                                onPress={() => {
                                  setMobileNavOpen(false);
                                  navigate('/usage-log');
                                }}
                              >
                                Usage Logs
                              </Button>
                              <Button
                                fullWidth
                                variant='ghost'
                                className='justify-start'
                                onPress={() => {
                                  setMobileNavOpen(false);
                                  navigate('/audit-log');
                                }}
                              >
                                Audit Logs
                              </Button>
                            </>
                          ) : null}
                          {isModuleVisible('console', 'midjourney') ? (
                            <Button
                              fullWidth
                              variant='ghost'
                              className='justify-start'
                              onPress={() => {
                                setMobileNavOpen(false);
                                navigate('/midjourney');
                              }}
                            >
                              Midjourney
                            </Button>
                          ) : null}
                          {isModuleVisible('console', 'task') ? (
                            <Button
                              fullWidth
                              variant='ghost'
                              className='justify-start'
                              onPress={() => {
                                setMobileNavOpen(false);
                                navigate('/task');
                              }}
                            >
                              Tasks
                            </Button>
                          ) : null}
                        </div>
                      ) : null}

                      {user && hasSectionVisibleModules('personal') ? (
                        <div className='space-y-2'>
                          <div className='px-1 text-xs font-semibold uppercase text-muted'>Account</div>
                          {isModuleVisible('personal', 'topup') ? (
                            <Button
                              fullWidth
                              variant='ghost'
                              className='justify-start'
                              onPress={() => {
                                setMobileNavOpen(false);
                                navigate('/billing');
                              }}
                            >
                              Billing
                            </Button>
                          ) : null}
                          {isModuleVisible('personal', 'personal') ? (
                            <Button
                              fullWidth
                              variant='ghost'
                              className='justify-start'
                              onPress={() => {
                                setMobileNavOpen(false);
                                navigate('/personal');
                              }}
                            >
                              Personal
                            </Button>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </Modal.Body>
                  <Modal.Footer>
                    <Button slot='close' variant='secondary'>
                      Close
                    </Button>
                  </Modal.Footer>
                </Modal.Dialog>
              </Modal.Container>
            </Modal.Backdrop>
          </Modal>

          <NoticeCenterButton />
          <Button
            isIconOnly
            aria-label='Toggle theme'
            variant='tertiary'
            onPress={() => {
              const next = mode === 'auto' ? 'light' : mode === 'light' ? 'dark' : 'auto';
              setMode(next);
            }}
          >
            {resolvedTheme === 'dark' ? <Moon size={16} /> : <Sun size={16} />}
          </Button>

          {user ? (
            <div className='flex items-center gap-2'>
              <span className='hidden text-sm md:inline'>{user.display_name || user.username}</span>
              <Button
                isIconOnly
                aria-label='Logout'
                variant='tertiary'
                onPress={() => logout()}
              >
                <LogOut size={16} />
              </Button>
            </div>
          ) : (
            <Button onPress={() => navigate('/auth/signin')}>Sign in</Button>
          )}
        </div>
      </div>
    </header>
  );
}
