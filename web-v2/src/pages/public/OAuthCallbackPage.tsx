import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { fetchJson } from '@/api/client';
import type { ApiResponse, UserBase } from '@/api/types';
import { sleep } from '@/lib/sleep';
import { useAuth } from '@/stores/auth/AuthStore';
import { Card, Spinner } from '@/components/ui/heroui';

type Provider = 'github' | 'discord' | 'oidc' | 'linuxdo';

export function OAuthCallbackPage() {
  const { provider } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { login } = useAuth();

  const code = useMemo(() => searchParams.get('code') || '', [searchParams]);
  const state = useMemo(() => searchParams.get('state') || '', [searchParams]);

  const [status, setStatus] = useState<'idle' | 'working' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState<string>('');

  useEffect(() => {
    if (!provider || !code || !state) {
      setStatus('error');
      setMessage('Missing code or state.');
      return;
    }
    const p = provider as Provider;
    if (!['github', 'discord', 'oidc', 'linuxdo'].includes(p)) {
      setStatus('error');
      setMessage('Unsupported provider.');
      return;
    }

    let cancelled = false;
    setStatus('working');

    (async () => {
      const delays = [2000, 4000, 6000];
      let lastError: string | null = null;

      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          const res = await fetchJson<ApiResponse<UserBase>>(`/api/oauth/${p}`, {
            params: { code, state },
          });
          if (cancelled) return;

          if ((res as any).message === 'bind') {
            setStatus('done');
            setMessage('Bind succeeded. Redirecting…');
            navigate('/personal', { replace: true });
            return;
          }

          login(res.data);
          setStatus('done');
          setMessage('Signed in. Redirecting…');
          navigate('/api-keys', { replace: true });
          return;
        } catch (err: any) {
          lastError = err instanceof Error ? err.message : String(err);
          if (attempt < 2) {
            await sleep(delays[attempt]);
          }
        }
      }

      if (cancelled) return;
      setStatus('error');
      setMessage(lastError || 'OAuth failed.');
    })();

    return () => {
      cancelled = true;
    };
  }, [provider, code, state, login, navigate]);

  return (
    <div className='mx-auto w-full max-w-xl'>
      <Card>
        <Card.Header>
          <Card.Title>OAuth</Card.Title>
        </Card.Header>
        <Card.Content className='flex items-center gap-2 text-sm'>
          {status === 'working' ? <Spinner size='sm' /> : null}
          <div>{status === 'working' ? 'Signing you in…' : message || '—'}</div>
        </Card.Content>
      </Card>
    </div>
  );
}
