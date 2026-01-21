import { useState } from 'react';
import { fetchJson } from '@/api/client';
import type { ApiResponse } from '@/api/types';
import { toast } from '@/ui/toast';
import { copyText } from '@/lib/clipboard';
import { Button, Card, Input, Label, TextField } from '@/components/ui/heroui';
import { PageHeader } from './components/PageHeader';

export function AccessTokenPage() {
  const [accessToken, setAccessToken] = useState<string>('');

  const regenerateAccessToken = async () => {
    const res = await fetchJson<ApiResponse<string>>('/api/user/token');
    setAccessToken(res.data || '');
    toast.success('Generated');
  };

  const loadAccessTokenFromUser = () => {
    toast.info('Click "Regenerate" to generate a new token.');
  };

  return (
    <div className='space-y-4'>
      <PageHeader
        title='System Access Token'
        description='Generate and manage your API authentication token'
      />

      <Card>
        <Card.Content>
          <div className='space-y-3'>
            <div className='text-sm text-muted'>
              Used for system management API authentication.
            </div>
            <div className='flex flex-col gap-2 sm:flex-row sm:items-end'>
              <TextField fullWidth name='accessToken' isReadOnly>
                <Label>Token</Label>
                <Input
                  readOnly
                  value={accessToken}
                  placeholder='Click regenerate…'
                  className='font-mono text-xs'
                />
              </TextField>
              <div className='flex gap-2'>
                <Button
                  variant='secondary'
                  onPress={() =>
                    copyText(accessToken).then((ok) =>
                      ok ? toast.success('Copied') : toast.error('Copy failed'),
                    )
                  }
                  isDisabled={!accessToken}
                >
                  Copy
                </Button>
                <Button onPress={() => regenerateAccessToken().catch(() => {})}>
                  Regenerate
                </Button>
              </div>
            </div>
            <Button size='sm' variant='ghost' onPress={loadAccessTokenFromUser}>
              Why is it blank?
            </Button>
          </div>
        </Card.Content>
      </Card>
    </div>
  );
}
