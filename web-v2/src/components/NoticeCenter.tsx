import { useEffect, useMemo, useState } from 'react';
import { Bell, Megaphone } from 'lucide-react';
import { fetchJson } from '@/api/client';
import type { ApiResponse } from '@/api/types';
import { MarkdownRenderer } from '@/components/MarkdownRenderer';
import { Button, Card, Chip, Modal, Spinner, Tabs } from '@/components/ui/heroui';
import { useStatus } from '@/stores/status/StatusStore';

type TabKey = 'notice' | 'announcements';

function getAnnouncementKey(item: any): string {
  return `${item?.publishDate || ''}-${String(item?.content || '').slice(0, 30)}`;
}

function loadReadKeys(): string[] {
  try {
    const raw = localStorage.getItem('notice_read_keys');
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as string[]) : [];
  } catch {
    return [];
  }
}

function saveReadKeys(keys: string[]) {
  localStorage.setItem('notice_read_keys', JSON.stringify(keys));
}

function todayString() {
  return new Date().toDateString();
}

export function NoticeCenterButton() {
  const { status } = useStatus();
  const announcements = (status?.announcements as any[]) || [];

  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<TabKey>('notice');
  const [noticeMarkdown, setNoticeMarkdown] = useState('');
  const [loadingNotice, setLoadingNotice] = useState(false);
  const [readKeys, setReadKeys] = useState<string[]>(() => loadReadKeys());

  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === 'notice_read_keys') {
        setReadKeys(loadReadKeys());
      }
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, []);

  const unreadKeys = useMemo(() => {
    if (!announcements.length) return [];
    const readSet = new Set(readKeys);
    return announcements
      .filter((a) => !readSet.has(getAnnouncementKey(a)))
      .map((a) => getAnnouncementKey(a));
  }, [announcements, readKeys]);

  const unreadCount = unreadKeys.length;

  const loadNotice = async () => {
    setLoadingNotice(true);
    try {
      const res = await fetchJson<ApiResponse<string>>('/api/notice', { skipErrorHandler: true });
      setNoticeMarkdown(String(res.data || '').trim());
    } finally {
      setLoadingNotice(false);
    }
  };

  const markAnnouncementsRead = () => {
    if (!announcements.length) return;
    const keys = announcements.map(getAnnouncementKey);
    const merged = Array.from(new Set([...readKeys, ...keys]));
    setReadKeys(merged);
    saveReadKeys(merged);
  };

  const closeForToday = () => {
    localStorage.setItem('notice_close_date', todayString());
  };

  const onOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (nextOpen) {
      setTab('notice');
      loadNotice().catch(() => {});
      return;
    }

    markAnnouncementsRead();
  };

  return (
    <Modal isOpen={open} onOpenChange={onOpenChange}>
      <div className='relative'>
        <Button isIconOnly aria-label='Notifications' variant='tertiary'>
          <Bell size={16} />
        </Button>
        {unreadCount > 0 ? (
          <span className='absolute -right-1 -top-1 min-w-5 rounded-full bg-danger px-1 text-center text-[11px] text-danger-foreground'>
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        ) : null}
      </div>

      <Modal.Backdrop>
        <Modal.Container size='lg'>
          <Modal.Dialog>
            <Modal.CloseTrigger />
            <Modal.Header>
              <Modal.Heading>Notifications</Modal.Heading>
            </Modal.Header>

            <Modal.Body>
              <Tabs
                selectedKey={tab}
                onSelectionChange={(key) => setTab(key as TabKey)}
              >
                <Tabs.ListContainer>
                  <Tabs.List aria-label='Notifications tabs'>
                    <Tabs.Tab id='notice'>
                      <Tabs.Indicator />
                      <span className='inline-flex items-center gap-1'>
                        <Bell size={14} />
                        Notice
                      </span>
                    </Tabs.Tab>
                    <Tabs.Tab id='announcements'>
                      <Tabs.Indicator />
                      <span className='inline-flex items-center gap-2'>
                        <span className='inline-flex items-center gap-1'>
                          <Megaphone size={14} />
                          Announcements
                        </span>
                        {unreadCount > 0 ? (
                          <Chip color='danger' size='sm' variant='primary'>
                            {unreadCount}
                          </Chip>
                        ) : null}
                      </span>
                    </Tabs.Tab>
                  </Tabs.List>
                </Tabs.ListContainer>

                <Tabs.Panel id='notice'>
                  {loadingNotice ? (
                    <div className='flex items-center gap-2 text-sm text-muted'>
                      <Spinner size='sm' />
                      Loading…
                    </div>
                  ) : noticeMarkdown ? (
                    <MarkdownRenderer markdown={noticeMarkdown} />
                  ) : (
                    <div className='text-sm text-muted'>No notice.</div>
                  )}
                </Tabs.Panel>

                <Tabs.Panel id='announcements'>
                  {announcements.length === 0 ? (
                    <div className='text-sm text-muted'>No announcements.</div>
                  ) : (
                    <div className='space-y-3'>
                      {announcements.slice(0, 20).map((a, idx) => {
                        const key = getAnnouncementKey(a);
                        const isUnread = unreadKeys.includes(key);
                        return (
                          <Card key={key || idx} variant='secondary'>
                            <Card.Content className='space-y-2'>
                              <div className='flex items-center justify-between gap-3'>
                                <div className='text-xs text-muted'>
                                  {a?.publishDate || '—'}
                                  {a?.type ? ` · ${a.type}` : ''}
                                </div>
                                {isUnread ? (
                                  <Chip color='danger' size='sm' variant='primary'>
                                    Unread
                                  </Chip>
                                ) : null}
                              </div>
                              <div className='whitespace-pre-wrap break-words text-sm'>
                                {a?.content || ''}
                              </div>
                              {a?.extra ? (
                                <div className='whitespace-pre-wrap break-words text-xs text-muted'>
                                  {a.extra}
                                </div>
                              ) : null}
                            </Card.Content>
                          </Card>
                        );
                      })}
                    </div>
                  )}
                </Tabs.Panel>
              </Tabs>
            </Modal.Body>

            <Modal.Footer>
              <Button slot='close' variant='secondary' onPress={closeForToday}>
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
