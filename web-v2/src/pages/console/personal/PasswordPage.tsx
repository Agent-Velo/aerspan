import { useState } from 'react';
import { fetchJson } from '@/api/client';
import type { ApiResponse } from '@/api/types';
import { toast } from '@/ui/toast';
import { Button, Card, Input, Label, TextField } from '@/components/ui/heroui';
import { PageHeader } from './components/PageHeader';

export function PasswordPage() {
  const [passwordOriginal, setPasswordOriginal] = useState('');
  const [passwordNext, setPasswordNext] = useState('');

  const changePassword = async () => {
    if (!passwordOriginal || !passwordNext) {
      return toast.warning('Enter current and new password.');
    }
    await fetchJson<ApiResponse<any>>('/api/user/self', {
      method: 'PUT',
      body: { original_password: passwordOriginal, password: passwordNext },
    });
    toast.success('Password updated');
    setPasswordOriginal('');
    setPasswordNext('');
  };

  return (
    <div className='space-y-4'>
      <PageHeader
        title='Password'
        description='Change your account password'
      />

      <Card>
        <Card.Content>
          <div className='grid grid-cols-1 gap-4 md:grid-cols-3'>
            <TextField name='passwordOriginal' type='password' onChange={setPasswordOriginal}>
              <Label>Current password</Label>
              <Input value={passwordOriginal} autoComplete='current-password' />
            </TextField>
            <TextField name='passwordNext' type='password' onChange={setPasswordNext}>
              <Label>New password</Label>
              <Input value={passwordNext} autoComplete='new-password' />
            </TextField>
            <div className='flex items-end'>
              <Button className='w-full' onPress={() => changePassword().catch(() => {})}>
                Update
              </Button>
            </div>
          </div>
        </Card.Content>
      </Card>
    </div>
  );
}
