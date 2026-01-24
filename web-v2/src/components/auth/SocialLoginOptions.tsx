import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchJson } from '@/api/client';
import type { ApiResponse, UserBase } from '@/api/types';
import {
  buildAssertionResult,
  isPasskeySupported,
  prepareCredentialRequestOptions,
} from '@/lib/passkey';
import { getInviteCode } from '@/lib/inviteCode';
import { useAuth } from '@/stores/auth/AuthStore';
import { useStatus } from '@/stores/status/StatusStore';
import { toast } from '@/ui/toast';
import { Button, Input, Label, Separator, TextField } from '@/components/ui/heroui';

type Provider = 'github' | 'discord' | 'linuxdo' | 'oidc';

type SocialLoginOptionsProps = {
  redirectTo: string;
  ensureTerms: () => boolean;
  isDisabled?: boolean;
  showPasskey?: boolean;
};

export function SocialLoginOptions({
  redirectTo,
  ensureTerms,
  isDisabled,
  showPasskey = true,
}: SocialLoginOptionsProps) {
  const navigate = useNavigate();
  const { login } = useAuth();
  const { status } = useStatus();

  const [working, setWorking] = useState(false);
  const [wechatCode, setWechatCode] = useState('');
  const [passkeyAvailable, setPasskeyAvailable] = useState(false);
  const telegramContainerRef = useRef<HTMLDivElement | null>(null);

  const completeLogin = (user: UserBase) => {
    login(user);
    navigate(redirectTo, { replace: true });
  };

  const hasTelegramLogin = Boolean(status?.telegram_oauth && status?.telegram_bot_name);
  const passkeyEnabled = Boolean(showPasskey && status?.passkey_login);
  const hasOtherMethods = Boolean(
    status?.github_oauth ||
      status?.discord_oauth ||
      status?.linuxdo_oauth ||
      status?.oidc_enabled ||
      status?.wechat_login ||
      passkeyEnabled ||
      hasTelegramLogin,
  );

  useEffect(() => {
    if (!passkeyEnabled) {
      setPasskeyAvailable(false);
      return;
    }

    isPasskeySupported()
      .then(setPasskeyAvailable)
      .catch(() => setPasskeyAvailable(false));
  }, [passkeyEnabled]);

  const disabled = Boolean(isDisabled || working);

  const getOAuthState = async () => {
    const aff = getInviteCode();
    const res = await fetchJson<ApiResponse<string>>('/api/oauth/state', {
      params: aff ? { via: aff } : undefined,
    });
    return res.data;
  };

  const startOAuth = async (provider: Provider) => {
    if (!ensureTerms()) return;

    setWorking(true);
    try {
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
    } finally {
      setWorking(false);
    }
  };

  const loginWithWeChat = async () => {
    if (!ensureTerms()) return;
    if (!wechatCode.trim()) {
      toast.warning('Please enter the WeChat verification code.');
      return;
    }
    setWorking(true);
    try {
      const res = await fetchJson<ApiResponse<UserBase>>('/api/oauth/wechat', {
        params: { code: wechatCode.trim() },
      });
      completeLogin(res.data);
    } finally {
      setWorking(false);
    }
  };

  const loginWithPasskey = async () => {
    if (!ensureTerms()) return;
    if (!passkeyAvailable || !window.PublicKeyCredential) {
      toast.info('Passkey is not supported on this device.');
      return;
    }

    setWorking(true);
    try {
      const begin = await fetchJson<ApiResponse<any>>('/api/user/passkey/login/begin', {
        method: 'POST',
      });
      const publicKey = prepareCredentialRequestOptions(begin.data?.options || begin.data);
      const assertion = (await navigator.credentials.get({
        publicKey,
      })) as PublicKeyCredential;
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
      setWorking(false);
    }
  };

  const telegramEnabled = Boolean(status?.telegram_oauth && status?.telegram_bot_name);
  const telegramBotName = useMemo(
    () => (status?.telegram_bot_name as string | undefined) || '',
    [status?.telegram_bot_name],
  );

  useEffect(() => {
    if (!telegramEnabled || !telegramBotName) return;
    const container = telegramContainerRef.current;
    if (!container) return;

    container.innerHTML = '';
    (window as any).onTelegramAuth = async (user: any) => {
      setWorking(true);
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
      } finally {
        setWorking(false);
      }
    };

    const script = document.createElement('script');
    script.async = true;
    script.src = 'https://telegram.org/js/telegram-widget.js?22';
    script.setAttribute('data-telegram-login', telegramBotName);
    script.setAttribute('data-size', 'large');
    script.setAttribute('data-userpic', 'false');
    script.setAttribute('data-request-access', 'write');
    script.setAttribute('data-onauth', 'onTelegramAuth(user)');
    container.appendChild(script);

    return () => {
      delete (window as any).onTelegramAuth;
      container.innerHTML = '';
    };
  }, [telegramEnabled, telegramBotName, redirectTo]);

  if (!status || !hasOtherMethods) return null;

  return (
    <div className='space-y-3 pt-2'>
      <div className='flex items-center gap-3'>
        <Separator className='flex-1' />
        <div className='text-xs font-semibold uppercase text-muted'>or</div>
        <Separator className='flex-1' />
      </div>

      <div className='grid grid-cols-1 gap-2'>
        {status.github_oauth ? (
          <Button
            fullWidth
            variant='secondary'
            onPress={() => startOAuth('github')}
            isDisabled={disabled}
          >
            Continue with GitHub
          </Button>
        ) : null}
        {status.discord_oauth ? (
          <Button
            fullWidth
            variant='secondary'
            onPress={() => startOAuth('discord')}
            isDisabled={disabled}
          >
            Continue with Discord
          </Button>
        ) : null}
        {status.linuxdo_oauth ? (
          <Button
            fullWidth
            variant='secondary'
            onPress={() => startOAuth('linuxdo')}
            isDisabled={disabled}
          >
            Continue with LinuxDO
          </Button>
        ) : null}
        {status.oidc_enabled ? (
          <Button
            fullWidth
            variant='secondary'
            onPress={() => startOAuth('oidc')}
            isDisabled={disabled}
          >
            Continue with OIDC
          </Button>
        ) : null}
        {passkeyEnabled ? (
          <Button
            fullWidth
            variant='secondary'
            onPress={loginWithPasskey}
            isDisabled={disabled || !passkeyAvailable}
          >
            Continue with passkey
          </Button>
        ) : null}
      </div>

      {status.wechat_login ? (
        <div className='flex flex-col gap-2 sm:flex-row sm:items-end'>
          <TextField fullWidth name='wechatCode' onChange={setWechatCode}>
            <Label>WeChat code</Label>
            <Input value={wechatCode} placeholder='WeChat code' />
          </TextField>
          <Button
            className='sm:w-auto'
            variant='secondary'
            onPress={loginWithWeChat}
            isDisabled={disabled}
          >
            WeChat
          </Button>
        </div>
      ) : null}

      {hasTelegramLogin ? <div ref={telegramContainerRef} /> : null}
    </div>
  );
}

