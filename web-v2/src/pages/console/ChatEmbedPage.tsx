import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { fetchJson } from '@/api/client';
import type { ApiResponse } from '@/api/types';
import { useStatus } from '@/stores/status/StatusStore';
import { toast } from '@/ui/toast';
import { encodeToBase64 } from '@/lib/base64';
import { formatTokenApiKey } from '@/lib/tokenApiKey';
import { Button, Card, Spinner } from '@/components/ui/heroui';

type Token = { id: number; key: string; status: number };
type PageInfo<T> = { page: number; page_size: number; total: number; items: T };

function getServerAddress(status: any): string {
  return (status?.server_address as string | undefined) || window.location.origin;
}

function parseChats(status: any): Array<{ name: string; url: string }> {
  const raw = status?.chats;
  const chats = Array.isArray(raw) ? raw : [];
  const result: Array<{ name: string; url: string }> = [];
  for (const item of chats) {
    if (!item || typeof item !== 'object') continue;
    const entries = Object.entries(item);
    if (entries.length === 0) continue;
    const [name, url] = entries[0] as any;
    if (!name || typeof url !== 'string') continue;
    result.push({ name, url });
  }
  return result;
}

function buildChatLink(templateUrl: string, tokenKey: string, status: any) {
  const serverAddress = getServerAddress(status);
  if (templateUrl.includes('{cherryConfig}')) {
    const cherryConfig = {
      id: 'new-api',
      baseUrl: serverAddress,
      apiKey: formatTokenApiKey(tokenKey),
    };
    const encodedConfig = encodeURIComponent(encodeToBase64(JSON.stringify(cherryConfig)));
    return templateUrl.replaceAll('{cherryConfig}', encodedConfig);
  }
  const encodedServerAddress = encodeURIComponent(serverAddress);
  return templateUrl
    .replaceAll('{address}', encodedServerAddress)
    .replaceAll('{key}', formatTokenApiKey(tokenKey));
}

export function ChatEmbedPage() {
  const { id } = useParams();
  const chatId = id ? Number(id) : null;
  const { status } = useStatus();
  const navigate = useNavigate();

  const chats = useMemo(() => parseChats(status), [status]);

  const [loading, setLoading] = useState(true);
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (chatId === null || Number.isNaN(chatId)) {
      setLoading(false);
      setUrl(null);
      return;
    }

    const template = chats[chatId];
    if (!template) {
      setLoading(false);
      setUrl(null);
      return;
    }

    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetchJson<ApiResponse<PageInfo<Token[]>>>('/api/token/', { params: { p: 1, size: 10 } });
        const enabled = (res.data.items || []).find((t) => t.status === 1);
        if (!enabled) {
          toast.warning('No enabled token found.');
          navigate('/console/token', { replace: true });
          return;
        }
        const chatUrl = buildChatLink(template.url, enabled.key, status);
        if (!cancelled) setUrl(chatUrl);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [chatId, chats, navigate, status]);

  if (loading) {
    return (
      <div className='flex items-center gap-2 text-sm text-muted'>
        <Spinner size='sm' />
        Loading…
      </div>
    );
  }

  if (chatId === null) {
    return (
      <div className='space-y-3'>
        <div className='text-lg font-semibold'>Chat</div>
        <div className='text-sm text-muted'>Select a chat integration.</div>
        <div className='grid grid-cols-1 gap-2'>
          {chats.map((c, idx) => (
            <Button
              key={idx}
              fullWidth
              variant='secondary'
              className='justify-start'
              onPress={() => navigate(`/console/chat/${idx}`)}
            >
              {c.name}
            </Button>
          ))}
        </div>
      </div>
    );
  }

  if (!url) {
    return (
      <Card>
        <Card.Header>
          <Card.Title>Chat integration not found</Card.Title>
        </Card.Header>
      </Card>
    );
  }

  return (
    <Card className='overflow-hidden p-0'>
      <iframe
        src={url}
        title='chat'
        className='h-[calc(100vh-180px)] w-full'
        allow='camera;microphone'
      />
    </Card>
  );
}
