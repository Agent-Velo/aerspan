import { useEffect, useState } from 'react';
import Turnstile from 'react-turnstile';
import { fetchJson } from '@/api/client';
import type { ApiResponse } from '@/api/types';
import { toast } from '@/ui/toast';
import { useAuth } from '@/stores/auth/AuthStore';
import { useStatus } from '@/stores/status/StatusStore';
import { Button, Card, Input, Label, TextField } from '@/components/ui/heroui';
import { PageHeader } from './components/PageHeader';

export function AccountBindingsPage() {
  const { user, refreshSelf } = useAuth();
  const { status } = useStatus();

  const [emailToBind, setEmailToBind] = useState('');
  const [emailCode, setEmailCode] = useState('');
  const [turnstileToken, setTurnstileToken] = useState('');
  const [wechatCode, setWechatCode] = useState('');

  const turnstileEnabled = Boolean(status?.turnstile_check);
  const turnstileSiteKey = (status?.turnstile_site_key as string | undefined) || '';

  useEffect(() => {
    if (!status?.telegram_oauth || !status?.telegram_bot_name) return;
    if (user?.telegram_id) return;

    const container = document.getElementById('telegram-bind-container');
    if (!container) return;
    container.innerHTML = '';

    const script = document.createElement('script');
    script.async = true;
    script.src = 'https://telegram.org/js/telegram-widget.js?22';
    script.setAttribute('data-telegram-login', String(status.telegram_bot_name));
    script.setAttribute('data-size', 'large');
    script.setAttribute('data-userpic', 'false');
    script.setAttribute('data-request-access', 'write');
    script.setAttribute('data-auth-url', '/api/oauth/telegram/bind');
    container.appendChild(script);

    return () => {
      container.innerHTML = '';
    };
  }, [status?.telegram_oauth, status?.telegram_bot_name, user?.telegram_id]);

  const getOAuthState = async () => {
    const res = await fetchJson<ApiResponse<string>>('/api/oauth/state');
    return res.data;
  };

  const startOAuth = async (provider: 'github' | 'discord' | 'linuxdo' | 'oidc') => {
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
      const redirectUri = `${origin}/oauth/discord`;
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
    url.searchParams.set('redirect_uri', `${origin}/oauth/oidc`);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', 'openid profile email');
    url.searchParams.set('state', state);
    window.open(url.toString(), '_blank');
  };

  const sendEmailCode = async () => {
    if (!emailToBind.trim()) return toast.warning('Enter an email.');
    if (turnstileEnabled && !turnstileToken) return toast.info('Please complete Turnstile.');

    await fetchJson<ApiResponse<any>>('/api/verification', {
      params: { email: emailToBind.trim(), turnstile: turnstileEnabled ? turnstileToken : undefined },
    });
    toast.success('Verification code sent');
  };

  const bindEmail = async () => {
    if (!emailToBind.trim() || !emailCode.trim()) {
      return toast.warning('Enter email and code.');
    }
    await fetchJson<ApiResponse<any>>('/api/oauth/email/bind', {
      params: { email: emailToBind.trim(), code: emailCode.trim() },
    });
    toast.success('Email bound');
    await refreshSelf();
  };

  const bindWeChat = async () => {
    if (!wechatCode.trim()) return toast.warning('Enter WeChat code.');
    await fetchJson<ApiResponse<any>>('/api/oauth/wechat/bind', {
      params: { code: wechatCode.trim() },
    });
    toast.success('WeChat bound');
    setWechatCode('');
    await refreshSelf();
  };

  return (
    <div className='space-y-4'>
      <PageHeader
        title='Account Bindings'
        description='Link external accounts to your profile'
        actions={
          <Button variant='secondary' onPress={() => refreshSelf().catch(() => {})}>
            Refresh
          </Button>
        }
      />

      {(() => {
        const bindings = [
          { label: 'Email', value: user?.email },
          { label: 'GitHub', value: user?.github_id },
          { label: 'Discord', value: user?.discord_id },
          { label: 'OIDC', value: user?.oidc_id },
          { label: 'LinuxDO', value: user?.linux_do_id },
          { label: 'WeChat', value: user?.wechat_id },
          { label: 'Telegram', value: user?.telegram_id },
        ].filter((b) => b.value);

        if (bindings.length === 0) {
          return (
            <Card variant='secondary'>
              <Card.Content>
                <div className='text-sm text-muted'>No accounts currently bound.</div>
              </Card.Content>
            </Card>
          );
        }

        return (
          <Card variant='secondary'>
            <Card.Content>
              <div className='text-xs font-semibold uppercase text-muted mb-2'>
                Current bindings
              </div>
              <div className='grid grid-cols-1 gap-2 text-sm md:grid-cols-2'>
                {bindings.map((binding) => (
                  <div key={binding.label}>
                    {binding.label}: {binding.value}
                  </div>
                ))}
              </div>
            </Card.Content>
          </Card>
        );
      })()}

      <Card variant='secondary'>
        <Card.Content>
          <div className='text-xs font-semibold uppercase text-muted mb-2'>Bind OAuth</div>
          <div className='flex flex-wrap gap-2 mb-2'>
            {status?.github_oauth ? (
              <Button
                variant='secondary'
                onPress={() => startOAuth('github').catch(() => {})}
                isDisabled={Boolean(user?.github_id)}
              >
                Bind GitHub
              </Button>
            ) : null}
            {status?.discord_oauth ? (
              <Button
                variant='secondary'
                onPress={() => startOAuth('discord').catch(() => {})}
                isDisabled={Boolean(user?.discord_id)}
              >
                Bind Discord
              </Button>
            ) : null}
            {status?.linuxdo_oauth ? (
              <Button
                variant='secondary'
                onPress={() => startOAuth('linuxdo').catch(() => {})}
                isDisabled={Boolean(user?.linux_do_id)}
              >
                Bind LinuxDO
              </Button>
            ) : null}
            {status?.oidc_enabled ? (
              <Button
                variant='secondary'
                onPress={() => startOAuth('oidc').catch(() => {})}
                isDisabled={Boolean(user?.oidc_id)}
              >
                Bind OIDC
              </Button>
            ) : null}
          </div>
        </Card.Content>
      </Card>

      <Card variant='secondary'>
        <Card.Content className='space-y-3'>
          <div className='text-xs font-semibold uppercase text-muted'>Bind email</div>
          <div className='grid grid-cols-1 gap-2 md:grid-cols-3'>
            <TextField name='emailToBind' onChange={setEmailToBind}>
              <Label>Email</Label>
              <Input value={emailToBind} placeholder='Email' autoComplete='email' />
            </TextField>
            <TextField name='emailCode' onChange={setEmailCode}>
              <Label>Code</Label>
              <Input value={emailCode} placeholder='Code' />
            </TextField>
            <div className='flex items-end gap-2'>
              <Button
                className='flex-1'
                variant='secondary'
                onPress={() => sendEmailCode().catch(() => {})}
              >
                Send
              </Button>
              <Button className='flex-1' onPress={() => bindEmail().catch(() => {})}>
                Bind
              </Button>
            </div>
          </div>
          {turnstileEnabled && turnstileSiteKey ? (
            <Card variant='tertiary'>
              <Card.Content>
                <Turnstile sitekey={turnstileSiteKey} onVerify={setTurnstileToken} />
              </Card.Content>
            </Card>
          ) : null}
        </Card.Content>
      </Card>

      {status?.wechat_login ? (
        <Card variant='secondary'>
          <Card.Content className='space-y-2'>
            <div className='text-xs font-semibold uppercase text-muted'>Bind WeChat</div>
            <div className='flex flex-wrap items-end gap-2'>
              <TextField className='w-64' name='wechatCode' onChange={setWechatCode}>
                <Label>WeChat code</Label>
                <Input value={wechatCode} placeholder='WeChat code' />
              </TextField>
              <Button
                onPress={() => bindWeChat().catch(() => {})}
                isDisabled={Boolean(user?.wechat_id)}
              >
                Bind
              </Button>
            </div>
          </Card.Content>
        </Card>
      ) : null}

      {status?.telegram_oauth && status?.telegram_bot_name ? (
        <Card variant='secondary'>
          <Card.Content className='space-y-2'>
            <div className='text-xs font-semibold uppercase text-muted'>Bind Telegram</div>
            {user?.telegram_id ? (
              <div className='text-sm text-muted'>Already bound.</div>
            ) : (
              <>
                <div className='text-xs text-muted'>Click to bind via Telegram widget.</div>
                <div id='telegram-bind-container' />
              </>
            )}
          </Card.Content>
        </Card>
      ) : null}
    </div>
  );
}
