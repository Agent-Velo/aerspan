import { useEffect, useState } from 'react';
import Turnstile from 'react-turnstile';
import { fetchJson } from '@/api/client';
import type { ApiResponse } from '@/api/types';
import { toast } from '@/ui/toast';
import { useAuth } from '@/stores/auth/AuthStore';
import { useStatus } from '@/stores/status/StatusStore';
import { Button, Card, Input, Label, TextField } from '@/components/ui/heroui';
import { PageHeader } from './components/PageHeader';
import { getCurrentMonth } from './helpers';
import type { CheckinStatusResponse } from './types';

export function CheckinPage() {
  const { refreshSelf } = useAuth();
  const { status } = useStatus();

  const [checkinMonth, setCheckinMonth] = useState(() => getCurrentMonth());
  const [checkinData, setCheckinData] = useState<CheckinStatusResponse | null>(null);
  const [checkinTurnstileOpen, setCheckinTurnstileOpen] = useState(false);
  const [checkinTurnstileToken, setCheckinTurnstileToken] = useState('');

  const turnstileEnabled = Boolean(status?.turnstile_check);
  const turnstileSiteKey = (status?.turnstile_site_key as string | undefined) || '';

  useEffect(() => {
    loadCheckin().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkinMonth]);

  const loadCheckin = async () => {
    const res = await fetchJson<ApiResponse<CheckinStatusResponse>>('/api/user/checkin', {
      params: { month: checkinMonth },
    });
    setCheckinData(res.data);
  };

  const doCheckin = async (turnstile?: string) => {
    try {
      const res = await fetchJson<ApiResponse<any>>('/api/user/checkin', {
        method: 'POST',
        params: turnstile ? { turnstile } : undefined,
        skipErrorHandler: true,
      });
      toast.success(res.message || 'Checked in');
      await refreshSelf();
      await loadCheckin();
      setCheckinTurnstileOpen(false);
      setCheckinTurnstileToken('');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.toLowerCase().includes('turnstile')) {
        setCheckinTurnstileOpen(true);
        return;
      }
      toast.error(message);
    }
  };

  return (
    <div className='space-y-4'>
      <PageHeader
        title='Daily Check-in'
        description='Earn quota rewards by checking in daily'
        actions={
          <Button variant='secondary' onPress={() => loadCheckin().catch(() => {})}>
            Refresh
          </Button>
        }
      />

      <Card>
        <Card.Content>
          <div className='space-y-4'>
            {checkinTurnstileOpen && turnstileEnabled && turnstileSiteKey ? (
              <Card variant='secondary'>
                <Card.Content className='space-y-2'>
                  <div className='text-xs text-muted'>Turnstile required</div>
                  <Turnstile sitekey={turnstileSiteKey} onVerify={setCheckinTurnstileToken} />
                  <Button
                    onPress={() => doCheckin(checkinTurnstileToken).catch(() => {})}
                    isDisabled={!checkinTurnstileToken}
                  >
                    Continue
                  </Button>
                </Card.Content>
              </Card>
            ) : null}

            <div className='flex flex-wrap items-end gap-2'>
              <TextField className='w-40' name='checkinMonth' onChange={setCheckinMonth}>
                <Label>Month</Label>
                <Input value={checkinMonth} placeholder='YYYY-MM' />
              </TextField>
              <Button
                onPress={() => doCheckin().catch(() => {})}
                isDisabled={Boolean(checkinData?.stats?.checked_in_today)}
              >
                Check in
              </Button>
            </div>

            {checkinData ? (
              <Card variant='secondary'>
                <Card.Content className='space-y-2 text-sm'>
                  <div>Total check-ins: {checkinData.stats.total_checkins}</div>
                  <div>Total quota earned: {checkinData.stats.total_quota}</div>
                  <div>This month: {checkinData.stats.checkin_count}</div>
                  <div>Checked in today: {checkinData.stats.checked_in_today ? 'Yes' : 'No'}</div>
                  <div>Quota range: {checkinData.min_quota} - {checkinData.max_quota}</div>

                  {checkinData.stats.records?.length > 0 ? (
                    <div className='mt-3'>
                      <div className='text-xs font-semibold uppercase text-muted mb-2'>
                        Recent check-ins
                      </div>
                      <div className='space-y-1'>
                        {checkinData.stats.records.slice(0, 10).map((record, idx) => (
                          <div key={idx} className='flex justify-between text-xs'>
                            <span>{record.checkin_date}</span>
                            <span>+{record.quota_awarded}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </Card.Content>
              </Card>
            ) : null}
          </div>
        </Card.Content>
      </Card>
    </div>
  );
}
