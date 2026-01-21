import type { PropsWithChildren } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/stores/auth/AuthStore';
import { useStatus } from '@/stores/status/StatusStore';

function getPricingRequireAuth(headerNavModules?: unknown): boolean {
  if (!headerNavModules) return false;
  if (typeof headerNavModules !== 'string') return false;

  try {
    const modules = JSON.parse(headerNavModules);
    const pricing = (modules as any)?.pricing;

    if (typeof pricing === 'boolean') return false;
    if (pricing && typeof pricing === 'object') {
      return (pricing as any).requireAuth === true;
    }
  } catch {
    // ignore
  }

  return false;
}

export function RequireAuth({ children }: PropsWithChildren) {
  const { user } = useAuth();
  const location = useLocation();

  if (!user) {
    return <Navigate to='/auth/signin' state={{ from: location }} replace />;
  }
  return children;
}

export function AuthRedirect({ children }: PropsWithChildren) {
  const { user } = useAuth();
  if (user) {
    return <Navigate to='/dashboard' replace />;
  }
  return children;
}

export function RequirePricingAuth({ children }: PropsWithChildren) {
  const { user } = useAuth();
  const { status } = useStatus();
  const location = useLocation();

  const requireAuth = getPricingRequireAuth(status?.HeaderNavModules);
  if (requireAuth && !user) {
    return <Navigate to='/auth/signin' state={{ from: location }} replace />;
  }

  return children;
}
