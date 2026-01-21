import { useState } from 'react';
import Turnstile from 'react-turnstile';
import { useNavigate } from 'react-router-dom';
import { fetchJson } from '@/api/client';
import type { ApiResponse } from '@/api/types';
import { toast } from '@/ui/toast';
import { useStatus } from '@/stores/status/StatusStore';
import { Alert, Button, Card, Input, Label, TextField } from '@/components/ui/heroui';

export function ResetRequestPage() {
  const { status } = useStatus();
  const navigate = useNavigate();
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
    <div className='mx-auto w-full max-w-xl'>
      <Card>
        <Card.Header>
          <Card.Title>Reset password</Card.Title>
          <Card.Description>Enter your email to receive a reset link.</Card.Description>
        </Card.Header>

        <Card.Content className='space-y-3'>
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

          <div className='flex flex-wrap gap-2'>
            <Button onPress={send} isDisabled={submitting}>
              Send
            </Button>
            <Button variant='secondary' onPress={() => navigate('/auth/signin')}>
              Back to login
            </Button>
          </div>
        </Card.Content>
      </Card>
    </div>
  );
}
