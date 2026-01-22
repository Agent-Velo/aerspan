import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchJson } from '@/api/client';
import type { ApiResponse } from '@/api/types';
import { useAuth } from '@/stores/auth/AuthStore';
import { useStatus } from '@/stores/status/StatusStore';
import { Alert, Button, Card } from '@/components/ui/heroui';
import { buildAnnouncementKey, parseJson } from './helpers';
import type { PasskeyStatus, TwoFaStatus, CheckinStatusResponse } from './types';
import { toast } from '@/ui/toast';

type SettingCard = {
  id: string;
  title: string;
  description: string;
  status?: string;
  path: string;
  condition?: boolean;
};

export function PersonalHubPage() {
  const navigate = useNavigate();
  const { user, refreshSelf } = useAuth();
  const { status, refreshStatus } = useStatus();
  const [loading, setLoading] = useState(true);

  const [passkeyStatus, setPasskeyStatus] = useState<PasskeyStatus | null>(null);
  const [twoFaStatus, setTwoFaStatus] = useState<TwoFaStatus | null>(null);
  const [checkinData, setCheckinData] = useState<CheckinStatusResponse | null>(null);

  const announcements = (status?.announcements as any[]) || [];
  const unreadCount = useMemo(() => {
    if (!Array.isArray(announcements) || announcements.length === 0) return 0;
    const readKeys = parseJson<string[]>(localStorage.getItem('notice_read_keys')) || [];
    const readSet = new Set(readKeys);
    return announcements.filter((a) => !readSet.has(buildAnnouncementKey(a))).length;
  }, [announcements]);

  useEffect(() => {
    loadAll().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadAll = async () => {
    setLoading(true);
    try {
      await refreshStatus();
      await refreshSelf();

      const pk = await fetchJson<ApiResponse<PasskeyStatus>>('/api/user/passkey', {
        skipErrorHandler: true,
      });
      setPasskeyStatus(pk.data);

      const twofa = await fetchJson<ApiResponse<TwoFaStatus>>('/api/user/2fa/status', {
        skipErrorHandler: true,
      });
      setTwoFaStatus(twofa.data);

      if (status?.checkin_enabled) {
        const checkin = await fetchJson<ApiResponse<CheckinStatusResponse>>('/api/user/checkin', {
          skipErrorHandler: true,
        });
        setCheckinData(checkin.data);
      }
    } finally {
      setLoading(false);
    }
  };

  const markAnnouncementsRead = () => {
    const keys = announcements.map(buildAnnouncementKey);
    const existing = parseJson<string[]>(localStorage.getItem('notice_read_keys')) || [];
    localStorage.setItem('notice_read_keys', JSON.stringify(Array.from(new Set([...existing, ...keys]))));
    toast.success('Marked as read');
  };

  if (!user) {
    return (
      <Alert status='warning'>
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Title>Not signed in</Alert.Title>
          <Alert.Description>Please sign in to manage your account.</Alert.Description>
        </Alert.Content>
      </Alert>
    );
  }

  const getBindingsCount = () => {
    let count = 0;
    if (user.email) count++;
    if (user.github_id) count++;
    if (user.discord_id) count++;
    if (user.oidc_id) count++;
    if (user.linux_do_id) count++;
    if (user.wechat_id) count++;
    if (user.telegram_id) count++;
    return count;
  };

  const settingCards: SettingCard[] = [
    // Security group
    {
      id: 'passkey',
      title: 'Passkey',
      description: 'Secure passwordless authentication with WebAuthn',
      status: passkeyStatus?.enabled ? 'Enabled' : 'Not enabled',
      path: '/personal/passkey',
    },
    {
      id: '2fa',
      title: 'Two-Factor Authentication',
      description: 'Add an extra layer of security with TOTP',
      status: twoFaStatus?.enabled ? 'Enabled' : 'Not enabled',
      path: '/personal/2fa',
    },
    {
      id: 'password',
      title: 'Password',
      description: 'Change your account password',
      path: '/personal/password',
    },

    // Account group
    {
      id: 'bindings',
      title: 'Account Bindings',
      description: 'Link external accounts to your profile',
      status: `${getBindingsCount()} connected`,
      path: '/personal/bindings',
    },
    {
      id: 'access-token',
      title: 'Access Token',
      description: 'API authentication token for system management',
      path: '/personal/access-token',
    },
    {
      id: 'checkin',
      title: 'Daily Check-in',
      description: 'Earn quota rewards by checking in daily',
      status: checkinData?.stats?.checked_in_today ? 'Checked in today' : 'Not checked in',
      path: '/personal/checkin',
      condition: Boolean(status?.checkin_enabled),
    },

    // Preferences group
    {
      id: 'notifications',
      title: 'Notifications',
      description: 'Configure how you receive notifications',
      path: '/personal/notifications',
    },
  ];

  const visibleCards = settingCards.filter((card) => card.condition !== false);

  return (
    <div className='space-y-4'>
      <div className='flex flex-col justify-between gap-3 md:flex-row md:items-end'>
        <div>
          <div className='text-lg font-semibold'>Personal Settings</div>
          <div className='mt-1 text-sm text-muted'>
            Manage your account, security and preferences
          </div>
        </div>
        <div className='flex flex-wrap gap-2'>
          <Button variant='secondary' isDisabled={loading} onPress={() => loadAll().catch(() => {})}>
            Refresh
          </Button>
          {unreadCount > 0 ? (
            <Button variant='secondary' onPress={markAnnouncementsRead}>
              Mark announcements read ({unreadCount})
            </Button>
          ) : null}
        </div>
      </div>

      <div className='grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3'>
        {visibleCards.map((card) => (
          <Card key={card.id} variant='secondary' className='hover:bg-accent/5 transition-colors'>
            <Card.Header>
              <Card.Title className='text-base'>{card.title}</Card.Title>
            </Card.Header>
            <Card.Content>
              <div className='space-y-3'>
                <div className='text-sm text-muted'>{card.description}</div>
                {card.status ? (
                  <div className='text-xs font-medium text-accent'>{card.status}</div>
                ) : null}
                <Button
                  size='sm'
                  variant='ghost'
                  onPress={() => navigate(card.path)}
                  className='w-full'
                >
                  Manage →
                </Button>
              </div>
            </Card.Content>
          </Card>
        ))}
      </div>
    </div>
  );
}
