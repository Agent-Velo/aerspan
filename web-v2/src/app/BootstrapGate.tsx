import type { PropsWithChildren } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useStatus } from '@/stores/status/StatusStore';
import { useAuth } from '@/stores/auth/AuthStore';
import { AlertModalHost } from '@/ui/AlertModalHost';
import { ConfirmModalHost } from '@/ui/ConfirmModalHost';
import { ToastHost } from '@/ui/ToastHost';
import { Button, Card, Spinner } from '@/components/ui/heroui';

function LoadingScreen({ message }: { message: string }) {
  return (
    <div className='flex min-h-screen items-center justify-center px-4'>
      <Card className='w-full max-w-md'>
        <Card.Content className='flex items-center gap-2'>
          <Spinner size='sm' />
          <div className='text-sm'>{message}</div>
        </Card.Content>
      </Card>
    </div>
  );
}

export function BootstrapGate({ children }: PropsWithChildren) {
  const { loaded: statusLoaded, refreshStatus, status, error: statusError } = useStatus();
  const { loaded: authLoaded, refreshSelf } = useAuth();
  const [booting, setBooting] = useState(true);

  const aff = useMemo(() => {
    const value = new URLSearchParams(window.location.search).get('aff');
    return value && value.trim() ? value.trim() : null;
  }, []);

  useEffect(() => {
    if (aff) {
      localStorage.setItem('aff', aff);
    }
  }, [aff]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await refreshStatus();
        await refreshSelf();
      } finally {
        if (!cancelled) setBooting(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshStatus, refreshSelf]);

  if (booting || !statusLoaded || !authLoaded) {
    return (
      <>
        <LoadingScreen message='Loading…' />
        <AlertModalHost />
        <ConfirmModalHost />
        <ToastHost />
      </>
    );
  }

  if (!status && statusError) {
    return (
      <>
        <div className='flex min-h-screen items-center justify-center px-4'>
          <Card className='w-full max-w-md'>
            <Card.Header>
              <Card.Title>Failed to load service status</Card.Title>
              <Card.Description>{statusError}</Card.Description>
            </Card.Header>
            <Card.Footer>
              <Button
                variant='secondary'
                onPress={() => {
                  setBooting(true);
                  refreshStatus().finally(() => setBooting(false));
                }}
              >
                Retry
              </Button>
            </Card.Footer>
          </Card>
        </div>
        <AlertModalHost />
        <ConfirmModalHost />
        <ToastHost />
      </>
    );
  }

  if (status?.setup === false && window.location.pathname !== '/setup') {
    window.location.href = '/setup';
    return (
      <>
        <LoadingScreen message='Redirecting to setup…' />
        <AlertModalHost />
        <ConfirmModalHost />
        <ToastHost />
      </>
    );
  }

  return (
    <>
      {children}
      <AlertModalHost />
      <ConfirmModalHost />
      <ToastHost />
    </>
  );
}
