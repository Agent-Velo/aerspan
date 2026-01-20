import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { fetchJson } from '@/api/client';
import type { ApiResponse } from '@/api/types';
import { toast } from '@/ui/toast';
import { Button, Card, Input, Label, Spinner, TextField } from '@/components/ui/heroui';

type TokenStatus = 1 | 2 | 3 | 4;

type Token = {
  id: number;
  name: string;
  key: string;
  status: TokenStatus;
  created_time: number;
};

export function TokenEditPage() {
  const navigate = useNavigate();
  const params = useParams();
  const id = Number(params.id);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [token, setToken] = useState<Token | null>(null);

  const [name, setName] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetchJson<ApiResponse<Token>>(`/api/token/${id}`);
        if (cancelled) return;
        setToken(res.data);
        setName(res.data.name || '');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const save = async () => {
    if (!token) return;
    if (!name.trim()) {
      toast.warning('Name is required.');
      return;
    }
    setSaving(true);
    try {
      await fetchJson<ApiResponse<any>>('/api/token/', {
        method: 'PUT',
        body: {
          id: token.id,
          name: name.trim(),
        },
      });
      toast.success('Saved');
      navigate('/console/token', { replace: true });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className='flex items-center gap-2 text-sm text-muted'>
        <Spinner size='sm' />
        Loading…
      </div>
    );
  }

  if (!token) {
    return (
      <Card>
        <Card.Header>
          <Card.Title>API Key not found</Card.Title>
        </Card.Header>
      </Card>
    );
  }

  return (
    <div className='space-y-4'>
      <div className='flex items-center justify-between gap-3'>
        <div>
          <div className='text-lg font-semibold'>Edit API Key</div>
          <div className='mt-1 text-sm text-muted'>Update API key settings.</div>
        </div>
        <div className='flex gap-2'>
          <Button variant='secondary' onPress={() => navigate('/console/token')}>
            Cancel
          </Button>
          <Button onPress={save} isDisabled={saving}>
            Save
          </Button>
        </div>
      </div>

      <Card>
        <Card.Content>
          <div className='grid grid-cols-1 gap-4 md:grid-cols-2'>
            <TextField fullWidth name='name' className='md:col-span-2' onChange={setName}>
              <Label>Name</Label>
              <Input value={name} />
            </TextField>
          </div>
        </Card.Content>
      </Card>
    </div>
  );
}
