import { useEffect, useMemo, useState } from 'react';
import Turnstile from 'react-turnstile';
import { Link as RouterLink, useNavigate, useSearchParams } from 'react-router-dom';
import { fetchJson } from '@/api/client';
import type { ApiResponse } from '@/api/types';
import { toast } from '@/ui/toast';
import { useStatus } from '@/stores/status/StatusStore';
import { Alert, Button, Card, Checkbox, Input, Label, TextField } from '@/components/ui/heroui';

function getInviteCode(): string | null {
  const raw = localStorage.getItem('via') || localStorage.getItem('aff');
  return raw && raw.trim() ? raw.trim() : null;
}

export function RegisterPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { status } = useStatus();

  const [mode, setMode] = useState<'magic' | 'password'>('magic');

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');

  const [email, setEmail] = useState('');
  const [verificationCode, setVerificationCode] = useState('');

  const [turnstileToken, setTurnstileToken] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [magicLinkSent, setMagicLinkSent] = useState(false);

  const emailVerificationEnabled = Boolean(status?.email_verification);
  const selfUseMode = Boolean(status?.self_use_mode_enabled);

  const turnstileEnabled = Boolean(status?.turnstile_check);
  const turnstileSiteKey = (status?.turnstile_site_key as string | undefined) || '';

  const needsTerms = Boolean(status?.user_agreement_enabled || status?.privacy_policy_enabled);

  const signupVerificationStorageKey = 'aerspan:signup_email_verification';

  useEffect(() => {
    const verifiedEmail = (searchParams.get('email') || '').trim();
    const verifiedToken = (searchParams.get('verification_token') || '').trim();
    if (!verifiedEmail || !verifiedToken) return;

    const payload = { email: verifiedEmail, token: verifiedToken, ts: Date.now() };
    localStorage.setItem(signupVerificationStorageKey, JSON.stringify(payload));
    setMode('password');
    setEmail(verifiedEmail);
    setVerificationCode(verifiedToken);
    toast.success('Email verified. You can close this tab.');
    navigate('/auth/signup', { replace: true });
  }, [navigate, searchParams]);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== signupVerificationStorageKey) return;
      if (!event.newValue) return;
      try {
        const parsed = JSON.parse(event.newValue) as any;
        const nextEmail = typeof parsed?.email === 'string' ? parsed.email.trim() : '';
        const nextToken = typeof parsed?.token === 'string' ? parsed.token.trim() : '';
        const ts = typeof parsed?.ts === 'number' ? parsed.ts : 0;
        if (!nextEmail || !nextToken) return;
        if (ts && Date.now() - ts > 15 * 60 * 1000) return;
        setMode('password');
        setEmail(nextEmail);
        setVerificationCode(nextToken);
        toast.success('Email verified.');
      } catch {
        // ignore
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const canSubmit = useMemo(() => {
    if (selfUseMode) return false;

    if (mode === 'magic') {
      if (!email.trim()) return false;
    } else {
      if (!username.trim() || !password || !password2) return false;
      if (password !== password2) return false;
      if (emailVerificationEnabled) {
        if (!email.trim() || !verificationCode.trim()) return false;
      }
    }

    if (turnstileEnabled && !turnstileToken) return false;
    if (needsTerms && !termsAccepted) return false;
    return true;
  }, [
    selfUseMode,
    mode,
    username,
    password,
    password2,
    emailVerificationEnabled,
    email,
    verificationCode,
    turnstileEnabled,
    turnstileToken,
    needsTerms,
    termsAccepted,
  ]);

  const ensureTurnstile = () => {
    if (!turnstileEnabled) return true;
    if (turnstileToken) return true;
    toast.info('Please complete Turnstile verification.');
    return false;
  };

  const ensureTerms = () => {
    if (!needsTerms) return true;
    if (termsAccepted) return true;
    toast.warning('Please accept the Terms and Privacy Policy.');
    return false;
  };

  const sendPasswordRegisterEmailLink = async () => {
    if (!ensureTurnstile()) return;
    if (!email.trim()) {
      toast.warning('Please enter your email.');
      return;
    }
    setSubmitting(true);
    try {
      await fetchJson<ApiResponse<any>>('/api/user/register/magic_link', {
      params: { email: email.trim(), turnstile: turnstileEnabled ? turnstileToken : undefined },
      });
      toast.success('Magic link sent.');
    } finally {
      setSubmitting(false);
    }
  };

  const sendMagicLinkRegister = async () => {
    if (selfUseMode) return;
    if (!ensureTerms()) return;
    if (!ensureTurnstile()) return;
    if (!email.trim()) {
      toast.warning('Please enter your email.');
      return;
    }
    setSubmitting(true);
    try {
      const aff = getInviteCode();
      await fetchJson<ApiResponse<any>>('/api/user/magic_link', {
        params: {
          email: email.trim(),
          action: 'register',
          via: aff || undefined,
          redirect: '/dashboard',
          turnstile: turnstileEnabled ? turnstileToken : undefined,
        },
      });
      setMagicLinkSent(true);
      toast.success('Magic link sent.');
    } finally {
      setSubmitting(false);
    }
  };

  const registerWithPassword = async () => {
    if (selfUseMode) return;
    if (!ensureTerms()) return;
    if (!ensureTurnstile()) return;
    if (password !== password2) {
      toast.warning('Passwords do not match.');
      return;
    }
    if (!username.trim() || !password) {
      toast.warning('Please enter username and password.');
      return;
    }

    setSubmitting(true);
    try {
      const aff = getInviteCode();
      await fetchJson<ApiResponse<any>>('/api/user/register', {
        method: 'POST',
        params: turnstileEnabled ? { turnstile: turnstileToken } : undefined,
        body: {
          username: username.trim(),
          password,
          email: emailVerificationEnabled ? email.trim() : undefined,
          verification_code: emailVerificationEnabled ? verificationCode.trim() : undefined,
          aff_code: aff || undefined,
        },
      });

      toast.success('Registered. Please sign in.');
      navigate('/auth/signin', { replace: true });
    } finally {
      setSubmitting(false);
    }
  };

  if (selfUseMode) {
    return (
      <div className='mx-auto w-full max-w-xl'>
        <Card>
          <Card.Header>
            <Card.Title>Registration is disabled</Card.Title>
          <Card.Description>This service is running in self-use mode.</Card.Description>
          </Card.Header>
          <Card.Footer>
            <Button onPress={() => navigate('/auth/signin')}>Go to login</Button>
          </Card.Footer>
        </Card>
      </div>
    );
  }

  return (
    <div className='mx-auto w-full max-w-xl space-y-4'>
      <Card>
        <Card.Header>
          <Card.Title>Register</Card.Title>
          <Card.Description>Create an account with a magic link (default) or a password.</Card.Description>
        </Card.Header>

        <Card.Content className='space-y-3'>
          {mode === 'magic' ? (
            <>
              {magicLinkSent ? (
                <Alert status='success'>
                  <Alert.Indicator />
                  <Alert.Content>
                    <Alert.Description>
                      Magic link sent. Check your inbox to finish signing up.
                    </Alert.Description>
                  </Alert.Content>
                </Alert>
              ) : null}

              <TextField
                fullWidth
                name='email'
                type='email'
                onChange={(next) => {
                  setEmail(next);
                  setMagicLinkSent(false);
                }}
              >
                <Label>Email</Label>
                <Input value={email} autoComplete='email' />
              </TextField>
            </>
          ) : (
            <>
              <TextField fullWidth name='username' onChange={setUsername}>
                <Label>Username</Label>
                <Input value={username} autoComplete='username' />
              </TextField>

              <TextField fullWidth name='password' type='password' onChange={setPassword}>
                <Label>Password</Label>
                <Input value={password} autoComplete='new-password' />
              </TextField>

              <TextField fullWidth name='password2' type='password' onChange={setPassword2}>
                <Label>Confirm password</Label>
                <Input value={password2} autoComplete='new-password' />
              </TextField>

              {emailVerificationEnabled ? (
                <Card variant='secondary'>
                  <Card.Header>
                    <Card.Title>Email verification</Card.Title>
                    <Card.Description>We'll send a magic link to verify your email.</Card.Description>
                  </Card.Header>
                  <Card.Content className='space-y-2'>
                    <div className='flex flex-col gap-2 md:flex-row md:items-end'>
                      <TextField
                        fullWidth
                        name='email'
                        type='email'
                        onChange={(next) => {
                          setEmail(next);
                          setVerificationCode('');
                        }}
                      >
                        <Label>Email</Label>
                        <Input value={email} autoComplete='email' />
                      </TextField>
                      <Button
                        variant='secondary'
                        onPress={sendPasswordRegisterEmailLink}
                        isDisabled={submitting}
                      >
                        Send link
                      </Button>
                    </div>

                    {verificationCode.trim() ? (
                      <Alert status='success'>
                        <Alert.Indicator />
                        <Alert.Content>
                          <Alert.Description>Email verified.</Alert.Description>
                        </Alert.Content>
                      </Alert>
                    ) : (
                      <div className='text-xs text-muted'>
                        After clicking the link, this page will update automatically.
                      </div>
                    )}
                  </Card.Content>
                </Card>
              ) : null}
            </>
          )}

          {turnstileEnabled && turnstileSiteKey ? (
            <Card variant='secondary'>
              <Turnstile sitekey={turnstileSiteKey} onVerify={setTurnstileToken} />
            </Card>
          ) : null}

          {needsTerms ? (
            <Checkbox id='register-terms' isSelected={termsAccepted} onChange={setTermsAccepted}>
              <Checkbox.Control>
                <Checkbox.Indicator />
              </Checkbox.Control>
              <Checkbox.Content>
                <Label htmlFor='register-terms'>
                  I agree to the <RouterLink to='/terms'>Terms</RouterLink> and{' '}
                  <RouterLink to='/privacy-policy'>Privacy Policy</RouterLink>.
                </Label>
              </Checkbox.Content>
            </Checkbox>
          ) : null}

          <div className='flex flex-wrap gap-2'>
            {mode === 'magic' ? (
              <>
                <Button onPress={sendMagicLinkRegister} isDisabled={!canSubmit || submitting}>
                  Send magic link
                </Button>
                <Button variant='ghost' onPress={() => setMode('password')} isDisabled={submitting}>
                  Use password instead
                </Button>
              </>
            ) : (
              <>
                <Button onPress={registerWithPassword} isDisabled={!canSubmit || submitting}>
                  Register
                </Button>
                <Button variant='ghost' onPress={() => setMode('magic')} isDisabled={submitting}>
                  Use magic link instead
                </Button>
              </>
            )}

            <Button variant='secondary' onPress={() => navigate('/auth/signin')}>
              Back to login
            </Button>
          </div>
        </Card.Content>
      </Card>
    </div>
  );
}
