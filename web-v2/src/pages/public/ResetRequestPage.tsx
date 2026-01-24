import { useState } from 'react';
import Turnstile from 'react-turnstile';
import { Link as RouterLink } from 'react-router-dom';
import { fetchJson } from '@/api/client';
import type { ApiResponse } from '@/api/types';
import { toast } from '@/ui/toast';
import { useStatus } from '@/stores/status/StatusStore';
import { Alert, Button, Card, Input, Label, TextField } from '@/components/ui/heroui';

export function ResetRequestPage() {
  const { status } = useStatus();
  const [email, setEmail] = useState('');
  const [turnstileToken, setTurnstileToken] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const turnstileEnabled = Boolean(status?.turnstile_check);
  const turnstileSiteKey = (status?.turnstile_site_key as string | undefined) || '';

  const ensureTurnstile = () => {
    if (!turnstileEnabled) return true;
    if (turnstileToken) return true;
    toast.info('Please complete Turnstile verification.');
    return false;
  };

  const send = async () => {
    if (!ensureTurnstile()) return;
    if (!email.trim()) {
      toast.warning('Please enter your email.');
      return;
    }
    setSubmitting(true);
    try {
      await fetchJson<ApiResponse<any>>('/api/reset_password', {
        params: {
          email: email.trim(),
          turnstile: turnstileEnabled ? turnstileToken : undefined,
        },
      });
      setSent(true);
      toast.success('Email sent.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className='w-full max-w-lg pb-4 flex flex-col items-center'>
      <div className='pb-8'>
        <h1 className='text-3xl font-semibold'>Reset password</h1>
      </div>

      <Card className='pt-6 w-md'>
        <Card.Content className='space-y-4 mr-4.5 ml-4.5'>
          {sent ? (
            <Alert status='success'>
              <Alert.Indicator />
              <Alert.Content>
                <Alert.Description>If the email exists, a reset message has been sent.</Alert.Description>
              </Alert.Content>
            </Alert>
          ) : null}

          <TextField fullWidth name='email' type='email' onChange={setEmail}>
            <Label>Email</Label>
            <Input value={email} autoComplete='email' />
          </TextField>

          {turnstileEnabled && turnstileSiteKey ? (
            <Card variant='secondary'>
              <Turnstile sitekey={turnstileSiteKey} onVerify={setTurnstileToken} />
            </Card>
          ) : null}

          <Button className='w-full' onPress={send} isDisabled={submitting}>
            Send
          </Button>
        </Card.Content>

        <Card.Footer className='mr-4.5 ml-4.5 mt-1.5 mb-1 text-center'>
          <div className='text-sm text-muted w-full text-center'>
            Remember your password?{' '}
            <RouterLink to='/auth/signin'>Sign in</RouterLink>
          </div>
        </Card.Footer>
      </Card>
    </div>
  );
}
