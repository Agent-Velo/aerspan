import { NavLink, useMatch, useNavigate, useResolvedPath } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useMemo } from 'react';
import { LogOut, Moon, Sun } from 'lucide-react';
import { getDocsLink, getLogoUrl, getSystemName } from '@/lib/branding';
import { useAuth } from '@/stores/auth/AuthStore';
import { useStatus } from '@/stores/status/StatusStore';
import { NoticeCenterButton } from '@/components/NoticeCenter';
import { ThemeContext } from '@/theme/ThemeProvider';
import { useContext } from 'react';
import { Button, Link as HeroLink } from '@/components/ui/heroui';

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
  const { mode, setMode, resolvedTheme } = useContext(ThemeContext);
  const navigate = useNavigate();

  const showModels = isPricingEnabled(status?.HeaderNavModules);

  const docsLink = useMemo(() => {
    return (status?.docs_link as string | undefined) || getDocsLink();
  }, [status?.docs_link]);

  return (
    <header className='app-header'>
      <div className='mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3'>
        <div className='flex items-center gap-3'>
          <NavLink to='/' className='flex items-center gap-2'>
            <img src={getLogoUrl()} alt='logo' className='h-7 w-7 rounded' />
            <span className='text-sm font-semibold'>{getSystemName()}</span>
          </NavLink>
          <nav className='hidden items-center gap-1 md:flex'>
            <HeaderNavButton to='/' end>
              Home
            </HeaderNavButton>
            <HeaderNavButton to='/dashboard'>
              Dashboard
            </HeaderNavButton>
            {showModels ? (
              <HeaderNavButton to='/models' end>
                Models
              </HeaderNavButton>
            ) : null}
            {docsLink ? (
              <HeroLink href={docsLink} target='_blank' rel='noreferrer'>
                Docs
                <HeroLink.Icon />
              </HeroLink>
            ) : null}
            <HeaderNavButton to='/about' end>
              About
            </HeaderNavButton>
          </nav>
        </div>

        <div className='flex items-center gap-2'>
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
