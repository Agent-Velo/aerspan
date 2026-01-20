import { useMemo, useState } from 'react';
import Turnstile from 'react-turnstile';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { fetchJson } from '@/api/client';
import type { ApiResponse } from '@/api/types';
import { toast } from '@/ui/toast';
import { useStatus } from '@/stores/status/StatusStore';
import { Button, Card, Checkbox, Input, Label, TextField } from '@/components/ui/heroui';

function getAff(): string | null {
  const raw = localStorage.getItem('aff');
  return raw && raw.trim() ? raw.trim() : null;
}

export function RegisterPage() {
  const navigate = useNavigate();
  const { status } = useStatus();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');

  const [email, setEmail] = useState('');
  const [verificationCode, setVerificationCode] = useState('');

  const [turnstileToken, setTurnstileToken] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const emailVerificationEnabled = Boolean(status?.email_verification);
  const selfUseMode = Boolean(status?.self_use_mode_enabled);

  const turnstileEnabled = Boolean(status?.turnstile_check);
  const turnstileSiteKey = (status?.turnstile_site_key as string | undefined) || '';

  const needsTerms = Boolean(status?.user_agreement_enabled || status?.privacy_policy_enabled);

  const canSubmit = useMemo(() => {
    if (selfUseMode) return false;
    if (!username.trim() || !password || !password2) return false;
    if (password !== password2) return false;
    if (emailVerificationEnabled) {
      if (!email.trim() || !verificationCode.trim()) return false;
    }
    if (turnstileEnabled && !turnstileToken) return false;
    if (needsTerms && !termsAccepted) return false;
    return true;
  }, [
    selfUseMode,
    username,
    password,
    password2,
    emailVerificationEnabled,
    email,
    verificationCode,
    turnstileEnabled,
    turnstileToken,
    needsTerms,
    termsAccepted,
  ]);

  const ensureTurnstile = () => {
    if (!turnstileEnabled) return true;
    if (turnstileToken) return true;
    toast.info('Please complete Turnstile verification.');
    return false;
  };

  const ensureTerms = () => {
    if (!needsTerms) return true;
    if (termsAccepted) return true;
    toast.warning('Please accept the Terms and Privacy Policy.');
    return false;
  };

  const sendEmailCode = async () => {
    if (!ensureTurnstile()) return;
    if (!email.trim()) {
      toast.warning('Please enter your email.');
      return;
    }
    await fetchJson<ApiResponse<any>>('/api/verification', {
      params: { email: email.trim(), turnstile: turnstileEnabled ? turnstileToken : undefined },
    });
    toast.success('Verification code sent.');
  };

  const register = async () => {
    if (selfUseMode) return;
    if (!ensureTerms()) return;
    if (!ensureTurnstile()) return;
    if (password !== password2) {
      toast.warning('Passwords do not match.');
      return;
    }
    if (!username.trim() || !password) {
      toast.warning('Please enter username and password.');
      return;
    }

    setSubmitting(true);
    try {
      const aff = getAff();
      await fetchJson<ApiResponse<any>>('/api/user/register', {
        method: 'POST',
        params: turnstileEnabled ? { turnstile: turnstileToken } : undefined,
        body: {
          username: username.trim(),
          password,
          email: emailVerificationEnabled ? email.trim() : undefined,
          verification_code: emailVerificationEnabled ? verificationCode.trim() : undefined,
          aff_code: aff || undefined,
        },
      });

      toast.success('Registered. Please sign in.');
      navigate('/login', { replace: true });
    } finally {
      setSubmitting(false);
    }
  };

  if (selfUseMode) {
    return (
      <div className='mx-auto w-full max-w-xl'>
        <Card>
          <Card.Header>
            <Card.Title>Registration is disabled</Card.Title>
            <Card.Description>This service is running in self-use mode.</Card.Description>
          </Card.Header>
          <Card.Footer>
            <Button onPress={() => navigate('/login')}>Go to login</Button>
          </Card.Footer>
        </Card>
      </div>
    );
  }

  return (
    <div className='mx-auto w-full max-w-xl space-y-4'>
      <Card>
        <Card.Header>
          <Card.Title>Register</Card.Title>
          <Card.Description>Create an account.</Card.Description>
        </Card.Header>

        <Card.Content className='space-y-3'>
          <TextField fullWidth name='username' onChange={setUsername}>
            <Label>Username</Label>
            <Input value={username} autoComplete='username' />
          </TextField>

          <TextField fullWidth name='password' type='password' onChange={setPassword}>
            <Label>Password</Label>
            <Input value={password} autoComplete='new-password' />
          </TextField>

          <TextField fullWidth name='password2' type='password' onChange={setPassword2}>
            <Label>Confirm password</Label>
            <Input value={password2} autoComplete='new-password' />
          </TextField>

          {emailVerificationEnabled ? (
            <Card variant='secondary'>
              <Card.Header>
                <Card.Title>Email verification</Card.Title>
              </Card.Header>
              <Card.Content className='space-y-2'>
                <div className='flex flex-col gap-2 md:flex-row md:items-end'>
                  <TextField fullWidth name='email' type='email' onChange={setEmail}>
                    <Label>Email</Label>
                    <Input value={email} autoComplete='email' />
                  </TextField>
                  <Button variant='secondary' onPress={sendEmailCode} isDisabled={submitting}>
                    Send code
                  </Button>
                </div>
                <TextField fullWidth name='verificationCode' onChange={setVerificationCode}>
                  <Label>Verification code</Label>
                  <Input value={verificationCode} />
                </TextField>
              </Card.Content>
            </Card>
          ) : null}

          {turnstileEnabled && turnstileSiteKey ? (
            <Card variant='secondary'>
              <Turnstile sitekey={turnstileSiteKey} onVerify={setTurnstileToken} />
            </Card>
          ) : null}

          {needsTerms ? (
            <Checkbox id='register-terms' isSelected={termsAccepted} onChange={setTermsAccepted}>
              <Checkbox.Control>
                <Checkbox.Indicator />
              </Checkbox.Control>
              <Checkbox.Content>
                <Label htmlFor='register-terms'>
                  I agree to the <RouterLink to='/terms'>Terms</RouterLink> and{' '}
                  <RouterLink to='/privacy-policy'>Privacy Policy</RouterLink>.
                </Label>
              </Checkbox.Content>
            </Checkbox>
          ) : null}

          <div className='flex flex-wrap gap-2'>
            <Button onPress={register} isDisabled={!canSubmit || submitting}>
              Register
            </Button>
            <Button variant='secondary' onPress={() => navigate('/login')}>
              Back to login
            </Button>
          </div>
        </Card.Content>
      </Card>
    </div>
  );
}
