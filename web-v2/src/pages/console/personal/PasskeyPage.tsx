import { useEffect, useState } from 'react';
import { fetchJson } from '@/api/client';
import type { ApiResponse } from '@/api/types';
import { toast } from '@/ui/toast';
import { confirmModal } from '@/ui/confirmModal';
import {
  buildRegistrationResult,
  isPasskeySupported,
  prepareCredentialCreationOptions,
} from '@/lib/passkey';
import { Button, Card } from '@/components/ui/heroui';
import { PageHeader } from './components/PageHeader';
import type { PasskeyStatus } from './types';

export function PasskeyPage() {
  const [passkeyAvailable, setPasskeyAvailable] = useState(false);
  const [passkeyStatus, setPasskeyStatus] = useState<PasskeyStatus | null>(null);

  useEffect(() => {
    isPasskeySupported()
      .then(setPasskeyAvailable)
      .catch(() => setPasskeyAvailable(false));
  }, []);

  useEffect(() => {
    loadPasskeyStatus().catch(() => {});
  }, []);

  const loadPasskeyStatus = async () => {
    const pk = await fetchJson<ApiResponse<PasskeyStatus>>('/api/user/passkey');
    setPasskeyStatus(pk.data);
  };

  const registerPasskey = async () => {
    if (!passkeyAvailable || !window.PublicKeyCredential) {
      toast.info('Passkey is not supported on this device.');
      return;
    }
    const begin = await fetchJson<ApiResponse<any>>('/api/user/passkey/register/begin', {
      method: 'POST',
    });
    const publicKey = prepareCredentialCreationOptions(begin.data?.options || begin.data);
    const credential = (await navigator.credentials.create({ publicKey })) as PublicKeyCredential;
    const payload = buildRegistrationResult(credential);
    await fetchJson<ApiResponse<any>>('/api/user/passkey/register/finish', {
      method: 'POST',
      body: payload,
    });
    toast.success('Passkey registered');
    await loadPasskeyStatus();
  };

  const deletePasskey = async () => {
    const ok = await confirmModal('Unlink passkey?', {
      title: 'Unlink passkey',
      confirmText: 'Unlink',
      cancelText: 'Cancel',
      confirmVariant: 'danger',
    });
    if (!ok) return;
    await fetchJson<ApiResponse<any>>('/api/user/passkey', { method: 'DELETE' });
    toast.success('Unlinked');
    await loadPasskeyStatus();
  };

  return (
    <div className='space-y-4'>
      <PageHeader
        title='Passkey'
        description='Secure passwordless authentication with WebAuthn'
        actions={
          <Button variant='secondary' onPress={() => loadPasskeyStatus().catch(() => {})}>
            Refresh
          </Button>
        }
      />

      <Card>
        <Card.Content>
          <div className='space-y-3 text-sm'>
            <div>Supported: {passkeyAvailable ? 'Yes' : 'No'}</div>
            <div>Enabled: {passkeyStatus?.enabled ? 'Yes' : 'No'}</div>
            {passkeyStatus?.last_used_at ? (
              <div>
                Last used: {new Date(passkeyStatus.last_used_at * 1000).toLocaleString()}
              </div>
            ) : null}
            <div className='flex flex-wrap gap-2'>
              <Button
                onPress={() => registerPasskey().catch(() => {})}
                isDisabled={!passkeyAvailable}
              >
                Register
              </Button>
              <Button
                variant='danger'
                onPress={() => deletePasskey().catch(() => {})}
                isDisabled={!passkeyStatus?.enabled}
              >
                Unlink
              </Button>
            </div>
          </div>
        </Card.Content>
      </Card>
    </div>
  );
}
