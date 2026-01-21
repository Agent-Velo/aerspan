import { useEffect, useState } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { fetchJson } from '@/api/client';
import type { ApiResponse } from '@/api/types';
import { toast } from '@/ui/toast';
import { copyText } from '@/lib/clipboard';
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Input,
  Label,
  TextField,
} from '@/components/ui/heroui';
import { PageHeader } from './components/PageHeader';
import type { TwoFaStatus, TwoFaSetup } from './types';

export function TwoFactorAuthPage() {
  const [twoFaStatus, setTwoFaStatus] = useState<TwoFaStatus | null>(null);
  const [twoFaSetup, setTwoFaSetup] = useState<TwoFaSetup | null>(null);
  const [twoFaCode, setTwoFaCode] = useState('');
  const [twoFaDisableConfirmed, setTwoFaDisableConfirmed] = useState(false);

  useEffect(() => {
    loadTwoFaStatus().catch(() => {});
  }, []);

  const loadTwoFaStatus = async () => {
    const res = await fetchJson<ApiResponse<TwoFaStatus>>('/api/user/2fa/status');
    setTwoFaStatus(res.data);
  };

  const startTwoFaSetup = async () => {
    const res = await fetchJson<ApiResponse<TwoFaSetup>>('/api/user/2fa/setup', {
      method: 'POST',
    });
    setTwoFaSetup(res.data);
    toast.info('Scan the QR code and then enable 2FA.');
  };

  const enableTwoFa = async () => {
    if (!twoFaCode.trim()) return toast.warning('Enter a 2FA code.');
    await fetchJson<ApiResponse<any>>('/api/user/2fa/enable', {
      method: 'POST',
      body: { code: twoFaCode.trim() },
    });
    toast.success('2FA enabled');
    setTwoFaSetup(null);
    setTwoFaCode('');
    await loadTwoFaStatus();
  };

  const disableTwoFa = async () => {
    if (!twoFaDisableConfirmed) {
      return toast.warning('Please confirm before disabling 2FA.');
    }
    if (!twoFaCode.trim()) return toast.warning('Enter a 2FA or backup code.');
    await fetchJson<ApiResponse<any>>('/api/user/2fa/disable', {
      method: 'POST',
      body: { code: twoFaCode.trim() },
    });
    toast.success('2FA disabled');
    setTwoFaDisableConfirmed(false);
    setTwoFaCode('');
    await loadTwoFaStatus();
  };

  const regenerateBackupCodes = async () => {
    if (!twoFaCode.trim()) return toast.warning('Enter a 2FA code.');
    const res = await fetchJson<ApiResponse<{ backup_codes: string[] }>>('/api/user/2fa/backup_codes', {
      method: 'POST',
      body: { code: twoFaCode.trim() },
    });
    const codes = res.data?.backup_codes || [];
    setTwoFaSetup((prev) =>
      prev
        ? { ...prev, backup_codes: codes }
        : { secret: '', qr_code_data: '', backup_codes: codes },
    );
    toast.success('Backup codes regenerated');
    await loadTwoFaStatus();
  };

  return (
    <div className='space-y-4'>
      <PageHeader
        title='Two-Factor Authentication'
        description='Add an extra layer of security with TOTP'
        actions={
          <Button variant='secondary' onPress={() => loadTwoFaStatus().catch(() => {})}>
            Refresh
          </Button>
        }
      />

      <Card>
        <Card.Content>
          <div className='space-y-4'>
            <div className='text-sm'>
              Enabled: {twoFaStatus?.enabled ? 'Yes' : 'No'} · Locked:{' '}
              {twoFaStatus?.locked ? 'Yes' : 'No'}
              {twoFaStatus?.enabled
                ? ` · Backup codes remaining: ${twoFaStatus.backup_codes_remaining ?? '—'}`
                : ''}
            </div>

            <div className='flex flex-wrap gap-2'>
              <Button
                variant='secondary'
                onPress={() => startTwoFaSetup().catch(() => {})}
                isDisabled={Boolean(twoFaStatus?.enabled)}
              >
                Setup
              </Button>
            </div>

            {twoFaSetup?.qr_code_data ? (
              <Card variant='secondary'>
                <Card.Content className='space-y-2'>
                  <div className='text-xs font-semibold uppercase text-muted'>Scan QR code</div>
                  <div className='flex justify-center'>
                    <QRCodeCanvas value={twoFaSetup.qr_code_data} size={180} />
                  </div>
                </Card.Content>
              </Card>
            ) : null}

            {twoFaSetup?.backup_codes?.length ? (
              <Card variant='secondary'>
                <Card.Content className='space-y-2'>
                  <div className='flex items-center justify-between gap-2'>
                    <div className='text-xs font-semibold uppercase text-muted'>Backup codes</div>
                    <Button
                      size='sm'
                      variant='secondary'
                      onPress={() =>
                        copyText(twoFaSetup.backup_codes.join('\n')).then((ok) =>
                          ok ? toast.success('Copied') : toast.error('Copy failed'),
                        )
                      }
                    >
                      Copy
                    </Button>
                  </div>
                  <pre className='overflow-auto whitespace-pre-wrap text-xs'>
                    {twoFaSetup.backup_codes.join('\n')}
                  </pre>
                </Card.Content>
              </Card>
            ) : null}

            <div className='grid grid-cols-1 gap-2 md:grid-cols-3'>
              <TextField name='twoFaCode' onChange={setTwoFaCode}>
                <Label>2FA / backup code</Label>
                <Input value={twoFaCode} placeholder='6-digit code or backup code' />
              </TextField>
              <div className='flex items-end'>
                <Button
                  className='w-full'
                  onPress={() => enableTwoFa().catch(() => {})}
                  isDisabled={Boolean(twoFaStatus?.enabled)}
                >
                  Enable
                </Button>
              </div>
              <div className='flex items-end'>
                <Button
                  className='w-full'
                  variant='secondary'
                  onPress={() => regenerateBackupCodes().catch(() => {})}
                  isDisabled={!twoFaStatus?.enabled}
                >
                  Regenerate backup codes
                </Button>
              </div>
            </div>

            <Alert status='danger'>
              <Alert.Indicator />
              <Alert.Content>
                <Alert.Title>Disable 2FA</Alert.Title>
                <Alert.Description>
                  <div className='space-y-2'>
                    <div className='flex items-center gap-3'>
                      <Checkbox
                        id='twofa-disable-confirm'
                        isSelected={twoFaDisableConfirmed}
                        onChange={setTwoFaDisableConfirmed}
                      >
                        <Checkbox.Control>
                          <Checkbox.Indicator />
                        </Checkbox.Control>
                      </Checkbox>
                      <Label htmlFor='twofa-disable-confirm'>
                        I understand disabling 2FA reduces account security.
                      </Label>
                    </div>
                    <Button
                      variant='danger'
                      onPress={() => disableTwoFa().catch(() => {})}
                      isDisabled={!twoFaStatus?.enabled}
                    >
                      Disable 2FA
                    </Button>
                  </div>
                </Alert.Description>
              </Alert.Content>
            </Alert>
          </div>
        </Card.Content>
      </Card>
    </div>
  );
}
