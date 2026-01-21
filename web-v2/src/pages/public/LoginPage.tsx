import { useEffect, useMemo, useState } from 'react';
import Turnstile from 'react-turnstile';
import { Link as RouterLink, useLocation, useNavigate } from 'react-router-dom';
import { fetchJson } from '@/api/client';
import type { ApiResponse, UserBase } from '@/api/types';
import { toast } from '@/ui/toast';
import { useAuth } from '@/stores/auth/AuthStore';
import { useStatus } from '@/stores/status/StatusStore';
import { buildAssertionResult, isPasskeySupported, prepareCredentialRequestOptions } from '@/lib/passkey';
import { Button, Card, Checkbox, Input, Label, TextField } from '@/components/ui/heroui';

type LoginResponse =
  | ApiResponse<UserBase>
  | ApiResponse<{
      require_2fa: true;
    }>;

function getInviteCode(): string | null {
  const raw = localStorage.getItem('via') || localStorage.getItem('aff');
  return raw && raw.trim() ? raw.trim() : null;
}

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
  const { status } = useStatus();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [twoFactorCode, setTwoFactorCode] = useState('');

  const [wechatCode, setWechatCode] = useState('');

  const [turnstileToken, setTurnstileToken] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);

  const [step, setStep] = useState<'password' | '2fa'>('password');
  const [submitting, setSubmitting] = useState(false);
  const [passkeyAvailable, setPasskeyAvailable] = useState(false);

  const turnstileEnabled = Boolean(status?.turnstile_check);
  const turnstileSiteKey = (status?.turnstile_site_key as string | undefined) || '';

  const needsTerms = Boolean(status?.user_agreement_enabled || status?.privacy_policy_enabled);

  useEffect(() => {
    isPasskeySupported()
      .then(setPasskeyAvailable)
      .catch(() => setPasskeyAvailable(false));
  }, []);

  const redirectTo = useMemo(() => {
    const from = (location.state as any)?.from?.pathname as string | undefined;
    return from || '/dashboard';
  }, [location.state]);

  const ensureTerms = () => {
    if (!needsTerms) return true;
    if (termsAccepted) return true;
    toast.warning('Please accept the Terms and Privacy Policy.');
    return false;
  };

  const ensureTurnstile = () => {
    if (!turnstileEnabled) return true;
    if (turnstileToken) return true;
    toast.info('Please complete Turnstile verification.');
    return false;
  };

  const completeLogin = (user: UserBase) => {
    login(user);
    navigate(redirectTo, { replace: true });
  };

  const handlePasswordLogin = async () => {
    if (!ensureTerms()) return;
    if (!ensureTurnstile()) return;
    if (!username.trim() || !password) {
      toast.warning('Please enter username/email and password.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetchJson<LoginResponse>('/api/user/login', {
        method: 'POST',
        params: turnstileEnabled ? { turnstile: turnstileToken } : undefined,
        body: { username: username.trim(), password },
      });

      if ((res.data as any)?.require_2fa) {
        setStep('2fa');
        toast.info('2FA required.');
        return;
      }

      completeLogin(res.data as UserBase);
    } finally {
      setSubmitting(false);
    }
  };

  const handle2faLogin = async () => {
    if (!ensureTerms()) return;
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
      completeLogin(res.data);
    } finally {
      setSubmitting(false);
    }
  };

  const getOAuthState = async () => {
    const aff = getInviteCode();
    const res = await fetchJson<ApiResponse<string>>('/api/oauth/state', {
      params: aff ? { via: aff } : undefined,
    });
    return res.data;
  };

  const startOAuth = async (provider: 'github' | 'discord' | 'linuxdo' | 'oidc') => {
    if (!ensureTerms()) return;
    const state = await getOAuthState();
    if (!state) return;

    const origin = window.location.origin;
    if (provider === 'github') {
      const clientId = status?.github_client_id as string | undefined;
      if (!clientId) return toast.error('GitHub OAuth is not configured.');
      window.open(
        `https://github.com/login/oauth/authorize?client_id=${encodeURIComponent(clientId)}&state=${encodeURIComponent(state)}&scope=user:email`,
        '_blank',
      );
      return;
    }
    if (provider === 'discord') {
      const clientId = status?.discord_client_id as string | undefined;
      if (!clientId) return toast.error('Discord OAuth is not configured.');
      const redirectUri = `${origin}/auth/callback/discord`;
      const scope = 'identify+openid';
      window.open(
        `https://discord.com/oauth2/authorize?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scope)}&state=${encodeURIComponent(state)}`,
        '_blank',
      );
      return;
    }
    if (provider === 'linuxdo') {
      const clientId = status?.linuxdo_client_id as string | undefined;
      if (!clientId) return toast.error('LinuxDO OAuth is not configured.');
      window.open(
        `https://connect.linux.do/oauth2/authorize?response_type=code&client_id=${encodeURIComponent(clientId)}&state=${encodeURIComponent(state)}`,
        '_blank',
      );
      return;
    }

    const authUrl = status?.oidc_authorization_endpoint as string | undefined;
    const clientId = status?.oidc_client_id as string | undefined;
    if (!authUrl || !clientId) return toast.error('OIDC is not configured.');

    const url = new URL(authUrl);
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('redirect_uri', `${origin}/auth/callback/oidc`);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', 'openid profile email');
    url.searchParams.set('state', state);
    window.open(url.toString(), '_blank');
  };

  const loginWithWeChat = async () => {
    if (!ensureTerms()) return;
    if (!wechatCode.trim()) {
      toast.warning('Please enter the WeChat verification code.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetchJson<ApiResponse<UserBase>>('/api/oauth/wechat', {
        params: { code: wechatCode.trim() },
      });
      completeLogin(res.data);
    } finally {
      setSubmitting(false);
    }
  };

  const loginWithPasskey = async () => {
    if (!ensureTerms()) return;
    if (!passkeyAvailable || !window.PublicKeyCredential) {
      toast.info('Passkey is not supported on this device.');
      return;
    }
    setSubmitting(true);
    try {
      const begin = await fetchJson<ApiResponse<any>>('/api/user/passkey/login/begin', { method: 'POST' });
      const publicKey = prepareCredentialRequestOptions(begin.data?.options || begin.data);
      const assertion = (await navigator.credentials.get({ publicKey })) as PublicKeyCredential;
      const payload = buildAssertionResult(assertion);
      const finish = await fetchJson<ApiResponse<UserBase>>('/api/user/passkey/login/finish', {
        method: 'POST',
        body: payload,
      });
      completeLogin(finish.data);
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        toast.info('Passkey login cancelled.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    if (!status?.telegram_oauth || !status?.telegram_bot_name) return;

    const containerId = 'telegram-login-container';
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';

    (window as any).onTelegramAuth = async (user: any) => {
      try {
        const res = await fetchJson<ApiResponse<UserBase>>('/api/oauth/telegram/login', {
          params: {
            id: user.id,
            first_name: user.first_name,
            last_name: user.last_name,
            username: user.username,
            photo_url: user.photo_url,
            auth_date: user.auth_date,
            hash: user.hash,
          },
        });
        completeLogin(res.data);
      } catch {
        // handled globally
      }
    };

    const script = document.createElement('script');
    script.async = true;
    script.src = 'https://telegram.org/js/telegram-widget.js?22';
    script.setAttribute('data-telegram-login', String(status.telegram_bot_name));
    script.setAttribute('data-size', 'large');
    script.setAttribute('data-userpic', 'false');
    script.setAttribute('data-request-access', 'write');
    script.setAttribute('data-onauth', 'onTelegramAuth(user)');
    container.appendChild(script);

    return () => {
      delete (window as any).onTelegramAuth;
      container.innerHTML = '';
    };
  }, [status?.telegram_oauth, status?.telegram_bot_name]);

  return (
    <div className='mx-auto w-full max-w-xl space-y-4'>
      <Card>
        <Card.Header>
          <Card.Title>Sign in</Card.Title>
          <Card.Description>Use your password, 2FA, OAuth, or Passkey.</Card.Description>
        </Card.Header>

        <Card.Content className='space-y-3'>
          {step === 'password' ? (
            <>
              <TextField fullWidth name='username' onChange={setUsername}>
                <Label>Username / Email</Label>
                <Input value={username} autoComplete='username' />
              </TextField>
              <TextField fullWidth name='password' type='password' onChange={setPassword}>
                <Label>Password</Label>
                <Input value={password} autoComplete='current-password' />
              </TextField>
            </>
          ) : (
            <>
              <TextField fullWidth name='twoFactorCode' onChange={setTwoFactorCode}>
                <Label>2FA code</Label>
                <Input
                  value={twoFactorCode}
                  placeholder='6-digit code or backup code'
                  autoComplete='one-time-code'
                />
              </TextField>
            </>
          )}

          {turnstileEnabled && turnstileSiteKey ? (
            <Card variant='secondary'>
              <Turnstile sitekey={turnstileSiteKey} onVerify={setTurnstileToken} />
            </Card>
          ) : null}

          {needsTerms ? (
            <Checkbox id='login-terms' isSelected={termsAccepted} onChange={setTermsAccepted}>
              <Checkbox.Control>
                <Checkbox.Indicator />
              </Checkbox.Control>
              <Checkbox.Content>
                <Label htmlFor='login-terms'>
                  I agree to the <RouterLink to='/terms'>Terms</RouterLink> and{' '}
                  <RouterLink to='/privacy-policy'>Privacy Policy</RouterLink>.
                </Label>
              </Checkbox.Content>
            </Checkbox>
          ) : null}

          <div className='flex flex-wrap gap-2'>
            <Button
              isDisabled={submitting}
              onPress={step === 'password' ? handlePasswordLogin : handle2faLogin}
            >
              {step === 'password' ? 'Sign in' : 'Verify'}
            </Button>
            {step === '2fa' ? (
              <Button variant='secondary' isDisabled={submitting} onPress={() => setStep('password')}>
                Back
              </Button>
            ) : null}
            <Button variant='secondary' onPress={() => navigate('/auth/recover')}>
              Forgot password
            </Button>
          </div>
        </Card.Content>
      </Card>

      <Card>
        <Card.Header>
          <Card.Title>Other sign-in methods</Card.Title>
        </Card.Header>
        <Card.Content className='flex flex-wrap gap-2'>
          {status?.github_oauth ? (
            <Button variant='secondary' onPress={() => startOAuth('github')} isDisabled={submitting}>
              GitHub
            </Button>
          ) : null}
          {status?.discord_oauth ? (
            <Button variant='secondary' onPress={() => startOAuth('discord')} isDisabled={submitting}>
              Discord
            </Button>
          ) : null}
          {status?.linuxdo_oauth ? (
            <Button variant='secondary' onPress={() => startOAuth('linuxdo')} isDisabled={submitting}>
              LinuxDO
            </Button>
          ) : null}
          {status?.oidc_enabled ? (
            <Button variant='secondary' onPress={() => startOAuth('oidc')} isDisabled={submitting}>
              OIDC
            </Button>
          ) : null}
          {status?.wechat_login ? (
            <div className='flex flex-wrap items-end gap-2'>
              <TextField name='wechatCode' onChange={setWechatCode}>
                <Label>WeChat code</Label>
                <Input value={wechatCode} placeholder='WeChat code' />
              </TextField>
              <Button variant='secondary' onPress={loginWithWeChat} isDisabled={submitting}>
                WeChat
              </Button>
            </div>
          ) : null}

          {status?.telegram_oauth && status?.telegram_bot_name ? (
            <div id='telegram-login-container' />
          ) : null}

          {status?.passkey_login ? (
            <Button variant='secondary' onPress={loginWithPasskey} isDisabled={submitting}>
              Passkey
            </Button>
          ) : null}
        </Card.Content>

        {!status?.self_use_mode_enabled ? (
          <Card.Footer>
            <div className='text-sm text-muted'>
              Don't have an account? <RouterLink to='/auth/signup'>Register</RouterLink>
            </div>
          </Card.Footer>
        ) : null}
      </Card>
    </div>
  );
}
