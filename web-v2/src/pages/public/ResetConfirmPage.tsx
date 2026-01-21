import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { fetchJson } from '@/api/client';
import type { ApiResponse } from '@/api/types';
import { copyText } from '@/lib/clipboard';
import { toast } from '@/ui/toast';
import { Button, Card, Input, Label, TextField } from '@/components/ui/heroui';

export function ResetConfirmPage() {
  const [searchParams] = useSearchParams();
  const email = useMemo(() => searchParams.get('email') || '', [searchParams]);
  const token = useMemo(() => searchParams.get('token') || '', [searchParams]);

  const [submitting, setSubmitting] = useState(false);
  const [newPassword, setNewPassword] = useState<string | null>(null);

  const reset = async () => {
    if (!email || !token) {
      toast.error('Missing email or token.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetchJson<ApiResponse<string>>('/api/user/reset', {
        method: 'POST',
        body: { email, token },
      });
      setNewPassword(res.data);
      const ok = await copyText(res.data);
      if (ok) toast.success('Copied');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className='mx-auto w-full max-w-xl'>
      <Card>
        <Card.Header>
          <Card.Title>Confirm reset</Card.Title>
          <Card.Description>This will generate a new password.</Card.Description>
        </Card.Header>

        <Card.Content className='space-y-2 text-sm'>
          <div>
            <span className='text-muted'>Email: </span>
            <span>{email || '—'}</span>
          </div>
          <div>
            <span className='text-muted'>Token: </span>
            <span className='break-all'>{token || '—'}</span>
          </div>

          <div className='flex flex-wrap gap-2 pt-2'>
            <Button onPress={reset} isDisabled={submitting}>
              Reset now
            </Button>
          </div>

          {newPassword ? (
            <Card variant='secondary'>
              <Card.Content className='space-y-2'>
                <TextField fullWidth name='newPassword' isReadOnly>
                  <Label>New password</Label>
                  <Input readOnly value={newPassword} />
                </TextField>
                <Button
                  variant='secondary'
                  onPress={() => {
                    copyText(newPassword).then((ok) =>
                      ok ? toast.success('Copied') : toast.error('Copy failed'),
                    );
                  }}
                >
                  Copy
                </Button>
              </Card.Content>
            </Card>
          ) : null}
        </Card.Content>
      </Card>
    </div>
  );
}
