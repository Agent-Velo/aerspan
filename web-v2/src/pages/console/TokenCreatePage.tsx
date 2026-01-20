import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchJson } from '@/api/client';
import type { ApiResponse } from '@/api/types';
import { toast } from '@/ui/toast';
import { Button, Card, Input, Label, TextField } from '@/components/ui/heroui';

function randomSuffix(length: number) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

export function TokenCreatePage() {
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [tokenCount, setTokenCount] = useState(1);

  const [submitting, setSubmitting] = useState(false);

  const create = async () => {
    const baseName = name.trim() ? name.trim() : 'default';
    const count = Math.max(1, Math.min(50, tokenCount));

    setSubmitting(true);
    try {
      for (let i = 0; i < count; i += 1) {
        const tokenName = count === 1 && name.trim() ? baseName : `${baseName}-${randomSuffix(6)}`;
        await fetchJson<ApiResponse<any>>('/api/token/', {
          method: 'POST',
          body: {
            name: tokenName,
          },
        });
      }

      toast.success('Created');
      navigate('/console/token', { replace: true });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className='space-y-4'>
      <div className='flex items-center justify-between gap-3'>
        <div>
          <div className='text-lg font-semibold'>Create API Key</div>
          <div className='mt-1 text-sm text-muted'>Create one or more API keys.</div>
        </div>
        <div className='flex gap-2'>
          <Button variant='secondary' onPress={() => navigate('/console/token')}>
            Cancel
          </Button>
          <Button onPress={create} isDisabled={submitting}>
            Save
          </Button>
        </div>
      </div>

      <Card>
        <Card.Content>
          <div className='grid grid-cols-1 gap-4 md:grid-cols-2'>
            <TextField fullWidth name='name' onChange={setName}>
              <Label>Name</Label>
              <Input value={name} placeholder='Optional' />
            </TextField>

            <TextField
              fullWidth
              name='tokenCount'
              type='number'
              onChange={(value) => setTokenCount(Number(value))}
            >
              <Label>API Key count</Label>
              <Input value={String(tokenCount)} min={1} max={50} />
            </TextField>
          </div>
        </Card.Content>
      </Card>
    </div>
  );
}
