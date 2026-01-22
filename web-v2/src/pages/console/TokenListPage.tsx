import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Ban, Check, Copy, Eye, Pencil, RefreshCcw, Trash2 } from 'lucide-react';
import { fetchJson } from '@/api/client';
import type { ApiResponse } from '@/api/types';
import { useStatus } from '@/stores/status/StatusStore';
import { toast } from '@/ui/toast';
import { confirmModal } from '@/ui/confirmModal';
import { copyText } from '@/lib/clipboard';
import { formatTokenApiKey, getTokenApiKeyPrefix } from '@/lib/tokenApiKey';
import { Button, Card, Chip, Label, ListBox, Modal, Select } from '@/components/ui/heroui';
import { TableActionButton } from '@/components/ui/TableActionButton';

type TokenStatus = 1 | 2 | 3 | 4;

export type Token = {
  id: number;
  name: string;
  key: string;
  status: TokenStatus;
  created_time: number;
  used_quota: number;
};

type PageInfo<T> = {
  page: number;
  page_size: number;
  total: number;
  items: T;
};

type UserModelInfo = {
  id: string;
  display_name?: string;
};

type UserModelItem = string | UserModelInfo;

function normalizeUserModels(data: unknown): {
  ids: string[];
  labels: Record<string, string>;
} {
  const ids: string[] = [];
  const labels: Record<string, string> = {};
  const seen = new Set<string>();

  const items = Array.isArray(data) ? (data as UserModelItem[]) : [];
  for (const item of items) {
    if (typeof item === 'string') {
      const id = item;
      if (!id || seen.has(id)) continue;
      seen.add(id);
      ids.push(id);
      labels[id] = id;
      continue;
    }
    if (item && typeof item === 'object') {
      const raw = item as UserModelInfo;
      const id = String(raw.id || '');
      if (!id || seen.has(id)) continue;
      seen.add(id);
      ids.push(id);
      labels[id] = raw.display_name || id;
    }
  }

  return { ids, labels };
}

function tokenStatusLabel(status: TokenStatus) {
  return status === 2 ? 'Disabled' : 'Enabled';
}

function tokenStatusChipColor(status: TokenStatus): 'default' | 'success' | 'warning' | 'danger' {
  return status === 2 ? 'default' : 'success';
}

function getServerAddress(status: any): string {
  return (status?.server_address as string | undefined) || window.location.origin;
}

function FluentPrefillModal({
  open,
  models,
  modelLabels,
  selectedModel,
  setSelectedModel,
  onPrefill,
  onClose,
  showSuppress,
}: {
  open: boolean;
  models: string[];
  modelLabels: Record<string, string>;
  selectedModel: string;
  setSelectedModel: (value: string) => void;
  onPrefill: () => void;
  onClose: () => void;
  showSuppress: boolean;
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
        <Modal.Container size='sm'>
          <Modal.Dialog>
            <Modal.CloseTrigger />
            <Modal.Header>
              <Modal.Heading>FluentRead detected</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              <div className='text-sm text-muted'>Select a model and prefill FluentRead.</div>
              <div className='mt-3'>
                <Select
                  fullWidth
                  placeholder='Select…'
                  value={selectedModel || null}
                  onChange={(value) => setSelectedModel(String(value || ''))}
                >
                  <Label>Model</Label>
                  <Select.Trigger>
                    <Select.Value />
                    <Select.Indicator />
                  </Select.Trigger>
                  <Select.Popover>
                    <ListBox>
                      {models.map((m) => {
                        const label = modelLabels[m] || m;
                        return (
                          <ListBox.Item key={m} id={m} textValue={label}>
                            {label}
                          <ListBox.ItemIndicator />
                          </ListBox.Item>
                        );
                      })}
                    </ListBox>
                  </Select.Popover>
                </Select>
              </div>
            </Modal.Body>
            <Modal.Footer>
              {showSuppress ? (
                <Button
                  slot='close'
                  variant='tertiary'
                  onPress={() => localStorage.setItem('fluent_notify_suppressed', '1')}
                >
                  Don't remind again
                </Button>
              ) : null}
              <Button slot='close' variant='secondary'>
                Close
              </Button>
              <Button isDisabled={!selectedModel} onPress={onPrefill}>
                Prefill
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}

function TokenKeyModal({ token, onClose }: { token: Token | null; onClose: () => void }) {
  const apiKey = token ? formatTokenApiKey(token.key) : '';

  return (
    <Modal
      isOpen={Boolean(token)}
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
    >
      <Button className='sr-only' variant='ghost'>
        Open
      </Button>

      <Modal.Backdrop>
        <Modal.Container size='sm'>
          <Modal.Dialog className='sm:max-w-[520px]'>
            <Modal.CloseTrigger />
            <Modal.Header>
              <Modal.Heading>{token?.name ? `API Key: ${token.name}` : 'API Key'}</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              <div className='space-y-2'>
                <div className='text-sm text-muted'>Keep this key secret. Anyone with it can access your account.</div>
                <Card variant='secondary'>
                  <pre className='overflow-auto p-3 text-xs'>
                    <code className='font-mono'>{apiKey}</code>
                  </pre>
                </Card>
              </div>
            </Modal.Body>
            <Modal.Footer className='flex gap-2'>
              <Button slot='close' variant='secondary'>
                Close
              </Button>
              <Button
                onPress={() => {
                  if (!token) return;
                  copyText(apiKey).then((ok) => (ok ? toast.success('Copied') : toast.error('Copy failed')));
                }}
              >
                Copy
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}

export function TokenListPage() {
  const navigate = useNavigate();
  const { status } = useStatus();
  const [loading, setLoading] = useState(true);

  const [tokens, setTokens] = useState<Token[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);

  const [keyModalToken, setKeyModalToken] = useState<Token | null>(null);

  const refresh = async (nextPage = page, nextSize = pageSize) => {
    setLoading(true);
    try {
      const res = await fetchJson<ApiResponse<PageInfo<Token[]>>>(`/api/token/`, {
        params: { p: nextPage, size: nextSize },
      });
      setTokens(res.data.items || []);
      setTotal(res.data.total || 0);
      setPage(res.data.page || nextPage);
      setPageSize(res.data.page_size || nextSize);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh(1, pageSize).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setStatus = async (token: Token, nextStatus: 1 | 2) => {
    setLoading(true);
    try {
      const res = await fetchJson<ApiResponse<Token>>('/api/token/', {
        method: 'PUT',
        params: { status_only: true },
        body: { id: token.id, status: nextStatus },
      });
      setTokens((prev) => prev.map((t) => (t.id === token.id ? { ...t, status: res.data.status } : t)));
      toast.success('Updated');
    } finally {
      setLoading(false);
    }
  };

  const deleteToken = async (token: Token) => {
    const ok = await confirmModal('Delete this token?', {
      title: 'Delete token',
      confirmText: 'Delete',
      cancelText: 'Cancel',
      confirmVariant: 'danger',
    });
    if (!ok) return;
    setLoading(true);
    try {
      await fetchJson<ApiResponse<any>>(`/api/token/${token.id}`, { method: 'DELETE' });
      toast.success('Deleted');
      await refresh(page, pageSize);
    } finally {
      setLoading(false);
    }
  };

  const rollTokenKey = async (token: Token) => {
    const ok = await confirmModal('Roll this key? The old key will stop working immediately.', {
      title: 'Roll key',
      confirmText: 'Roll',
      cancelText: 'Cancel',
      confirmVariant: 'danger',
    });
    if (!ok) return;
    setLoading(true);
    try {
      const res = await fetchJson<ApiResponse<Token>>(`/api/token/${token.id}/roll`, { method: 'POST' });
      setTokens((prev) => prev.map((t) => (t.id === token.id ? { ...t, key: res.data.key } : t)));
      setKeyModalToken({ ...token, key: res.data.key });
      toast.success('Rolled');
    } finally {
      setLoading(false);
    }
  };

  const [fluentOpen, setFluentOpen] = useState(false);
  const [fluentModels, setFluentModels] = useState<string[]>([]);
  const [fluentModelLabels, setFluentModelLabels] = useState<Record<string, string>>({});
  const [fluentSelectedModel, setFluentSelectedModel] = useState('');
  const [fluentOverrideKey, setFluentOverrideKey] = useState<string | null>(null);
  const fluentContainerRef = useRef<HTMLElement | null>(null);

  const loadUserModels = async () => {
    if (fluentModels.length > 0) return;
    const res = await fetchJson<ApiResponse<UserModelItem[]>>('/api/user/models');
    const { ids, labels } = normalizeUserModels(res.data);
    setFluentModels(ids);
    setFluentModelLabels(labels);
  };

  const openFluentModal = async (overrideKey?: string) => {
    const suppressed = localStorage.getItem('fluent_notify_suppressed') === '1';
    if (!overrideKey && suppressed) return;
    const el = document.getElementById('fluent-new-api-container');
    if (!el) {
      toast.warning('FluentRead container not found.');
      return;
    }
    fluentContainerRef.current = el;
    setFluentOverrideKey(overrideKey || null);
    setFluentOpen(true);
    await loadUserModels();
  };

  const prefillToFluent = () => {
    const container = fluentContainerRef.current;
    if (!container) {
      toast.error('Fluent container not found.');
      return;
    }
    if (!fluentSelectedModel) {
      toast.warning('Please select a model.');
      return;
    }
    const serverAddress = getServerAddress(status);
    const tokenToUse = fluentOverrideKey || (tokens.length > 0 ? tokens[0]?.key : '');
    if (!tokenToUse) {
      toast.warning('No token available.');
      return;
    }

    container.dispatchEvent(
      new CustomEvent('fluent:prefill', {
        detail: {
          id: 'new-api',
          baseUrl: serverAddress,
          apiKey: formatTokenApiKey(tokenToUse),
          model: fluentSelectedModel,
        },
      }),
    );
    toast.success('Sent to FluentRead');
    setFluentOpen(false);
  };

  useEffect(() => {
    const selector = '#fluent-new-api-container';
    const root = document.body || document.documentElement;
    const existing = document.querySelector(selector);
    if (existing) {
      openFluentModal().catch(() => {});
    }

    const isOrContainsTarget = (node: Node) => {
      if (!(node && (node as any).nodeType === 1)) return false;
      const el = node as Element;
      if (el.id === 'fluent-new-api-container') return true;
      return typeof el.querySelector === 'function' && !!el.querySelector(selector);
    };

    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const added of m.addedNodes) {
          if (isOrContainsTarget(added)) {
            openFluentModal().catch(() => {});
            return;
          }
        }
      }
    });
    observer.observe(root, { childList: true, subtree: true });
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokens]);

  return (
    <div className='space-y-4'>
      <FluentPrefillModal
        open={fluentOpen}
        models={fluentModels}
        modelLabels={fluentModelLabels}
        selectedModel={fluentSelectedModel}
        setSelectedModel={setFluentSelectedModel}
        onPrefill={prefillToFluent}
        onClose={() => setFluentOpen(false)}
        showSuppress={!fluentOverrideKey}
      />

      <TokenKeyModal token={keyModalToken} onClose={() => setKeyModalToken(null)} />

      <div className='flex flex-col justify-between gap-3 md:flex-row md:items-end'>
        <div>
          <div className='text-lg font-semibold'>API Keys</div>
          <div className='mt-1 text-sm text-muted'>Manage API keys.</div>
        </div>
        <div className='flex flex-wrap gap-2'>
          <Button onPress={() => navigate('/api-keys/new')}>Create API Key</Button>
        </div>
      </div>

      <Card className='gap-0 overflow-hidden p-0'>
        <table className='app-table'>
          <thead>
            <tr>
              <th>Name</th>
              <th>Status</th>
              <th>Key</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {tokens.map((token) => {
              const muted = token.status === 2;
              return (
                <tr key={token.id} className={muted ? 'app-table-row-muted' : undefined}>
                  <td>{token.name || '(unnamed)'}</td>
                  <td>
                    <Chip size='sm' variant='secondary' color={tokenStatusChipColor(token.status)}>
                      {tokenStatusLabel(token.status)}
                    </Chip>
                  </td>
                  <td>
                    <div className='flex items-center gap-2'>
                      <Chip size='sm' variant='soft'>
                        <span className='font-mono'>
                          {getTokenApiKeyPrefix(token.key)}********
                        </span>
                      </Chip>
                      <TableActionButton label='Show' onPress={() => setKeyModalToken(token)}>
                        <Eye size={16} />
                      </TableActionButton>
                      <TableActionButton
                        label='Copy'
                        onPress={() =>
                          copyText(formatTokenApiKey(token.key)).then((ok) =>
                            ok ? toast.success('Copied') : toast.error('Copy failed'),
                          )
                        }
                      >
                        <Copy size={16} />
                      </TableActionButton>
                      <TableActionButton
                        label='Roll'
                        isDisabled={loading}
                        onPress={() => rollTokenKey(token)}
                      >
                        <RefreshCcw size={16} />
                      </TableActionButton>
                    </div>
                  </td>
                  <td>
                    <div className='flex flex-wrap gap-2'>
                      {token.status === 2 ? (
                        <TableActionButton
                          label='Enable'
                          isDisabled={loading}
                          onPress={() => setStatus(token, 1)}
                        >
                          <Check size={16} />
                        </TableActionButton>
                      ) : (
                        <TableActionButton
                          label='Disable'
                          isDisabled={loading}
                          onPress={() => setStatus(token, 2)}
                        >
                          <Ban size={16} />
                        </TableActionButton>
                      )}
                      <TableActionButton label='Edit' onPress={() => navigate(`/api-keys/${token.id}/edit`)}>
                        <Pencil size={16} />
                      </TableActionButton>
                      <TableActionButton label='Delete' variant='danger-soft' onPress={() => deleteToken(token)}>
                        <Trash2 size={16} />
                      </TableActionButton>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div className='app-table-footer flex items-center justify-between px-4 py-3 text-sm'>
          <div>{loading ? 'Loading…' : `Total ${total}`}</div>
          <div className='flex items-center gap-2'>
            <Button
              size='sm'
              variant='secondary'
              isDisabled={page <= 1 || loading}
              onPress={() => refresh(page - 1, pageSize)}
            >
              Prev
            </Button>
            <span>
              Page {page}
            </span>
            <Button
              size='sm'
              variant='secondary'
              isDisabled={page * pageSize >= total || loading}
              onPress={() => refresh(page + 1, pageSize)}
            >
              Next
            </Button>
            <Select
              placeholder='Page size'
              value={String(pageSize)}
              onChange={(value) => {
                const size = Number(value);
                if (!Number.isFinite(size)) return;
                refresh(1, size).catch(() => {});
              }}
            >
              <Label>Page size</Label>
              <Select.Trigger className='min-w-[120px]'>
                <Select.Value />
                <Select.Indicator />
              </Select.Trigger>
              <Select.Popover>
                <ListBox>
                  {[10, 20, 50].map((s) => (
                    <ListBox.Item key={String(s)} id={String(s)} textValue={`${s} / page`}>
                      {s} / page
                      <ListBox.ItemIndicator />
                    </ListBox.Item>
                  ))}
                </ListBox>
              </Select.Popover>
            </Select>
          </div>
        </div>
      </Card>
    </div>
  );
}
