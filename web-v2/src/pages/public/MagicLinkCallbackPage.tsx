import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { fetchJson } from '@/api/client';
import type { ApiResponse, UserBase } from '@/api/types';
import { toast } from '@/ui/toast';
import { useAuth } from '@/stores/auth/AuthStore';
import { Button, Card, Input, Label, Spinner, TextField } from '@/components/ui/heroui';

type MagicLinkVerifyResponse =
  | ApiResponse<UserBase>
  | ApiResponse<{
      require_2fa: true;
    }>;

function isSafeRedirectPath(raw: string | null): raw is string {
  if (!raw) return false;
  if (!raw.startsWith('/')) return false;
  if (raw.startsWith('//')) return false;
  if (raw.includes('\\')) return false;
  return true;
}

export function MagicLinkCallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { login } = useAuth();

  const email = useMemo(() => searchParams.get('email') || '', [searchParams]);
  const token = useMemo(() => searchParams.get('token') || '', [searchParams]);
  const action = useMemo(() => searchParams.get('action') || 'login', [searchParams]);
  const via = useMemo(() => searchParams.get('via') || '', [searchParams]);
  const redirect = useMemo(() => searchParams.get('redirect'), [searchParams]);

  const redirectTo = useMemo(() => {
    if (isSafeRedirectPath(redirect)) return redirect;
    return '/dashboard';
  }, [redirect]);

  const [step, setStep] = useState<'working' | '2fa' | 'done' | 'error'>('working');
  const [message, setMessage] = useState<string>('');
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!email || !token) {
      setStep('error');
      setMessage('Missing email or token.');
      return;
    }

    let cancelled = false;
    setStep('working');

    (async () => {
      try {
        const res = await fetchJson<MagicLinkVerifyResponse>('/api/user/magic_link/verify', {
          method: 'POST',
          body: {
            email,
            token,
            action,
            via: via || undefined,
          },
        });
        if (cancelled) return;

        if ((res.data as any)?.require_2fa) {
          setStep('2fa');
          setMessage('2FA required.');
          return;
        }

        login(res.data as UserBase);
        setStep('done');
        setMessage('Signed in. Redirecting…');
        navigate(redirectTo, { replace: true });
      } catch (err: any) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err);
        setStep('error');
        setMessage(msg || 'Magic link verification failed.');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [email, token, action, via, login, navigate, redirectTo]);

  const verify2fa = async () => {
    if (!twoFactorCode.trim()) {
      toast.warning('Please enter your 2FA code.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetchJson<ApiResponse<UserBase>>('/api/user/login/2fa', {
        method: 'POST',
        body: { code: twoFactorCode.trim() },
      });
      login(res.data);
      setStep('done');
      setMessage('Signed in. Redirecting…');
      navigate(redirectTo, { replace: true });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className='mx-auto w-full max-w-xl'>
      <Card>
        <Card.Header>
          <Card.Title>Magic Link</Card.Title>
          <Card.Description>Verifying your sign-in link.</Card.Description>
        </Card.Header>
        <Card.Content className='space-y-3 text-sm'>
          {step === 'working' ? (
            <div className='flex items-center gap-2'>
              <Spinner size='sm' />
              <div>Verifying…</div>
            </div>
          ) : null}

          {step === '2fa' ? (
            <>
              <div className='text-muted'>{message || '2FA required.'}</div>
              <TextField fullWidth name='twoFactorCode' onChange={setTwoFactorCode}>
                <Label>2FA code</Label>
                <Input
                  value={twoFactorCode}
                  placeholder='6-digit code or backup code'
                  autoComplete='one-time-code'
                />
              </TextField>
              <div className='flex flex-wrap gap-2'>
                <Button isDisabled={submitting} onPress={verify2fa}>
                  Verify
                </Button>
              </div>
            </>
          ) : null}

          {step === 'done' || step === 'error' ? <div>{message || '—'}</div> : null}
        </Card.Content>
      </Card>
    </div>
  );
}

