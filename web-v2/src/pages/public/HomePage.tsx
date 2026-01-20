import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useCachedText } from '@/hooks/useCachedText';
import { useStatus } from '@/stores/status/StatusStore';
import { useAuth } from '@/stores/auth/AuthStore';
import { copyText } from '@/lib/clipboard';
import { toast } from '@/ui/toast';
import { API_ENDPOINT_HINTS } from '@/constants/apiEndpoints';
import { fetchJson } from '@/api/client';
import type { ApiResponse } from '@/api/types';
import { MarkdownRenderer } from '@/components/MarkdownRenderer';
import { ThemeContext } from '@/theme/ThemeProvider';
import { useContext } from 'react';
import { Button, Card, Input, Label, ListBox, Modal, Select, Spinner, TextField } from '@/components/ui/heroui';

function isAbsoluteUrl(value: string) {
  try {
    // eslint-disable-next-line no-new
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

function todayString() {
  return new Date().toDateString();
}

function todayYmd() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function isNoticeClosedToday(value: string | null) {
  // Compatible with old frontend (toDateString) and early web-v2 builds (YYYY-MM-DD).
  return value === todayString() || value === todayYmd();
}

function NoticeModal({
  open,
  markdown,
  onClose,
  onCloseToday,
}: {
  open: boolean;
  markdown: string;
  onClose: () => void;
  onCloseToday: () => void;
}) {
  return (
    <Modal
      isOpen={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
    >
      <Button className='sr-only' variant='ghost'>
        Open
      </Button>
      <Modal.Backdrop>
        <Modal.Container size='lg'>
          <Modal.Dialog>
            <Modal.CloseTrigger />
            <Modal.Header>
              <Modal.Heading>Notice</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              <div className='max-h-[70vh] overflow-auto'>
                <MarkdownRenderer markdown={markdown} />
              </div>
            </Modal.Body>
            <Modal.Footer>
              <Button slot='close' variant='secondary' onPress={onCloseToday}>
                Close for today
              </Button>
              <Button slot='close'>Close</Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}

export function HomePage() {
  const navigate = useNavigate();
  const { i18n } = useTranslation();
  const { status } = useStatus();
  const { user } = useAuth();
  const { resolvedTheme } = useContext(ThemeContext);

  const baseUrl = useMemo(() => {
    return (status?.server_address as string | undefined) || window.location.origin;
  }, [status?.server_address]);

  const docsLink = useMemo(() => {
    const link = status?.docs_link as string | undefined;
    return link && link.trim() ? link : null;
  }, [status?.docs_link]);

  const [endpoint, setEndpoint] = useState<string>(API_ENDPOINT_HINTS[0]);

  const { value: homeContent, loading: homeLoading } = useCachedText(
    'home_page_content',
    '/api/home_page_content',
  );
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const homeIsUrl = useMemo(() => {
    const trimmed = homeContent.trim();
    return trimmed.startsWith('https://') || isAbsoluteUrl(trimmed);
  }, [homeContent]);

  const [noticeOpen, setNoticeOpen] = useState(false);
  const [noticeMarkdown, setNoticeMarkdown] = useState('');

  useEffect(() => {
    if (!homeIsUrl) return;
    const win = iframeRef.current?.contentWindow;
    if (!win) return;

    win.postMessage({ themeMode: resolvedTheme }, '*');
    win.postMessage({ lang: i18n.language || 'en' }, '*');
  }, [homeIsUrl, resolvedTheme, i18n.language]);

  useEffect(() => {
    const closeDate = localStorage.getItem('notice_close_date');
    if (isNoticeClosedToday(closeDate)) return;

    let cancelled = false;
    (async () => {
      const res = await fetchJson<ApiResponse<string>>('/api/notice', { skipErrorHandler: true });
      const markdown = (res.data || '').trim();
      if (!markdown) return;
      if (cancelled) return;
      setNoticeMarkdown(markdown);
      setNoticeOpen(true);
    })().catch(() => {
      // ignore
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className='space-y-6'>
      <NoticeModal
        open={noticeOpen}
        markdown={noticeMarkdown}
        onClose={() => setNoticeOpen(false)}
        onCloseToday={() => {
          localStorage.setItem('notice_close_date', todayString());
          setNoticeOpen(false);
        }}
      />

      <Card>
        <Card.Content className='space-y-4'>
          <div className='text-2xl font-bold'>{status?.system_name || 'Aerspan'}</div>

          <div className='grid grid-cols-1 gap-4 md:grid-cols-2'>
            <div className='space-y-4'>
              <div className='flex items-end gap-2'>
                <TextField fullWidth name='baseUrl' isReadOnly>
                  <Label>Base URL</Label>
                  <Input readOnly value={baseUrl} />
                </TextField>
                <Button
                  onPress={() => {
                    copyText(baseUrl).then((ok) =>
                      ok ? toast.success('Copied') : toast.error('Copy failed'),
                    );
                  }}
                >
                  Copy
                </Button>
              </div>

              <div className='flex items-end gap-2'>
                <Select
                  fullWidth
                  aria-label='Endpoint hint'
                  value={endpoint}
                  onChange={(value) => setEndpoint(String(value || API_ENDPOINT_HINTS[0]))}
                >
                  <Label>Endpoint hint</Label>
                  <Select.Trigger>
                    <Select.Value />
                    <Select.Indicator />
                  </Select.Trigger>
                  <Select.Popover>
                    <ListBox>
                      {API_ENDPOINT_HINTS.map((p) => (
                        <ListBox.Item key={p} id={p} textValue={p}>
                          {p}
                          <ListBox.ItemIndicator />
                        </ListBox.Item>
                      ))}
                    </ListBox>
                  </Select.Popover>
                </Select>

                <Button
                  variant='secondary'
                  onPress={() => {
                    copyText(`${baseUrl}${endpoint}`).then((ok) =>
                      ok ? toast.success('Copied') : toast.error('Copy failed'),
                    );
                  }}
                >
                  Copy
                </Button>
              </div>
            </div>

            <div className='flex flex-col justify-between gap-3'>
              <div className='text-sm text-muted'>
                {user ? 'You are signed in.' : 'Sign in to access the console.'}
              </div>
              <div className='flex flex-wrap gap-2'>
                <Button onPress={() => navigate('/console')}>Go to Console</Button>
                {docsLink ? (
                  <Button
                    variant='secondary'
                    onPress={() => window.open(docsLink, '_blank')}
                  >
                    Docs
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
        </Card.Content>
      </Card>

      <section>
        {homeLoading && !homeContent ? (
          <div className='flex items-center gap-2 text-sm text-muted'>
            <Spinner size='sm' />
            Loading…
          </div>
        ) : homeIsUrl ? (
          <Card className='overflow-hidden p-0'>
            <iframe
              ref={iframeRef}
              src={homeContent.trim()}
              title='home'
              className='h-[min(80vh,900px)] w-full'
            />
          </Card>
        ) : (
          <Card>
            <Card.Content>
              <MarkdownRenderer markdown={homeContent || ''} />
            </Card.Content>
          </Card>
        )}
      </section>
    </div>
  );
}
