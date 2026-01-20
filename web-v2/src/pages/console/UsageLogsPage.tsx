import { useEffect, useState } from 'react';
import { Copy, Eye } from 'lucide-react';
import { fetchJson } from '@/api/client';
import type { ApiResponse } from '@/api/types';
import { toast } from '@/ui/toast';
import { copyText } from '@/lib/clipboard';
import { formatUnixSeconds, fromDateTimeLocalToSeconds, toDateTimeLocalValueFromSeconds } from '@/lib/time';
import { Button, Card, Input, Label, ListBox, Modal, Select, TextField } from '@/components/ui/heroui';
import { TableActionButton } from '@/components/ui/TableActionButton';

type LogRow = {
  id: number;
  created_at: number;
  type: number;
  content: string;
  token_name: string;
  model_name: string;
  quota: number;
  prompt_tokens: number;
  completion_tokens: number;
  use_time: number;
  is_stream: boolean;
  ip: string;
  other: string;
};

type PageInfo<T> = { page: number; page_size: number; total: number; items: T };

const DEFAULT_COLUMNS = [
  'created_at',
  'model_name',
  'token_name',
  'quota',
  'prompt_tokens',
  'completion_tokens',
  'use_time',
] as const;

type ColumnKey = (typeof DEFAULT_COLUMNS)[number] | 'is_stream' | 'ip';

function loadColumns(): ColumnKey[] {
  try {
    const raw = localStorage.getItem('logs-table-columns-user');
    if (!raw) return [...DEFAULT_COLUMNS];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [...DEFAULT_COLUMNS];
    return parsed as ColumnKey[];
  } catch {
    return [...DEFAULT_COLUMNS];
  }
}

function saveColumns(keys: ColumnKey[]) {
  localStorage.setItem('logs-table-columns-user', JSON.stringify(keys));
}

function loadPageSize() {
  const raw = localStorage.getItem('page-size');
  const num = raw ? Number(raw) : 20;
  return Number.isFinite(num) && num > 0 ? num : 20;
}

function savePageSize(size: number) {
  localStorage.setItem('page-size', String(size));
}

export function UsageLogsPage() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(() => loadPageSize());
  const [total, setTotal] = useState(0);
  const [items, setItems] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [type, setType] = useState<number>(0);
  const [tokenName, setTokenName] = useState('');
  const [modelName, setModelName] = useState('');
  const [start, setStart] = useState(() => toDateTimeLocalValueFromSeconds(Math.floor(Date.now() / 1000) - 86400));
  const [end, setEnd] = useState(() => toDateTimeLocalValueFromSeconds(Math.floor(Date.now() / 1000)));

  const [stat, setStat] = useState<{ quota: number; rpm: number; tpm: number } | null>(null);
  const [columns, setColumns] = useState<ColumnKey[]>(() => loadColumns());

  const [detail, setDetail] = useState<LogRow | null>(null);

  const load = async (nextPage = page, nextPageSize = pageSize) => {
    const startSec = fromDateTimeLocalToSeconds(start);
    const endSec = fromDateTimeLocalToSeconds(end);
    if (!startSec || !endSec || endSec <= startSec) {
      toast.error('Invalid time range.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetchJson<ApiResponse<PageInfo<LogRow[]>>>('/api/log/self', {
        params: {
          p: nextPage,
          page_size: nextPageSize,
          type,
          token_name: tokenName.trim(),
          model_name: modelName.trim(),
          start_timestamp: startSec,
          end_timestamp: endSec,
        },
      });
      setItems((res.data.items || []) as any);
      setTotal(res.data.total || 0);
      setPage(res.data.page || nextPage);
      setPageSize(res.data.page_size || nextPageSize);
    } finally {
      setLoading(false);
    }
  };

  const loadStat = async () => {
    const res = await fetchJson<ApiResponse<{ quota: number; rpm: number; tpm: number }>>('/api/log/self/stat', {
      params: {
        type,
        token_name: tokenName.trim(),
        model_name: modelName.trim(),
        start_timestamp: fromDateTimeLocalToSeconds(start),
        end_timestamp: fromDateTimeLocalToSeconds(end),
      },
    });
    setStat(res.data);
  };

  useEffect(() => {
    load(page, pageSize).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize]);

  const toggleColumn = (key: ColumnKey, checked: boolean) => {
    setColumns((prev) => {
      const next = checked ? (prev.includes(key) ? prev : [...prev, key]) : prev.filter((c) => c !== key);
      saveColumns(next);
      return next;
    });
  };

  return (
    <div className='space-y-4'>
      <Modal
        isOpen={Boolean(detail)}
        onOpenChange={(isOpen) => {
          if (!isOpen) setDetail(null);
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
                <Modal.Heading>Log detail</Modal.Heading>
              </Modal.Header>
              <Modal.Body>
                <Card variant='secondary'>
                  <pre className='max-h-[70vh] overflow-auto text-xs'>
                    {detail ? JSON.stringify(detail, null, 2) : ''}
                  </pre>
                </Card>
              </Modal.Body>
              <Modal.Footer>
                <Button slot='close'>Close</Button>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>

      <div className='flex flex-col justify-between gap-3 md:flex-row md:items-end'>
        <div>
          <div className='text-lg font-semibold'>Usage logs</div>
          <div className='mt-1 text-sm text-muted'>Filter and inspect your requests.</div>
        </div>
        <div className='flex flex-wrap gap-2'>
          <Button onPress={() => load(1, pageSize).catch(() => {})} isDisabled={loading}>
            Refresh
          </Button>
          <Button variant='secondary' onPress={() => loadStat().catch(() => {})}>
            Stats
          </Button>
        </div>
      </div>

      {stat ? (
        <Card variant='secondary'>
          <Card.Content className='text-sm'>Quota: {stat.quota} · RPM: {stat.rpm} · TPM: {stat.tpm}</Card.Content>
        </Card>
      ) : null}

      <Card>
        <Card.Content className='space-y-3'>
          <div className='grid grid-cols-1 gap-3 md:grid-cols-5'>
            <Select value={String(type)} onChange={(value) => setType(Number(value || 0))}>
              <Label>Type</Label>
              <Select.Trigger>
                <Select.Value />
                <Select.Indicator />
              </Select.Trigger>
              <Select.Popover>
                <ListBox>
                  {[
                    { id: '0', label: 'All' },
                    { id: '1', label: 'Topup' },
                    { id: '2', label: 'Consume' },
                    { id: '3', label: 'Manage' },
                    { id: '4', label: 'System' },
                    { id: '5', label: 'Error' },
                    { id: '6', label: 'Refund' },
                  ].map((opt) => (
                    <ListBox.Item key={opt.id} id={opt.id} textValue={opt.label}>
                      {opt.label}
                      <ListBox.ItemIndicator />
                    </ListBox.Item>
                  ))}
                </ListBox>
              </Select.Popover>
            </Select>

            <TextField name='tokenName' onChange={setTokenName}>
              <Label>Token name</Label>
              <Input value={tokenName} />
            </TextField>
            <TextField name='modelName' onChange={setModelName}>
              <Label>Model</Label>
              <Input value={modelName} />
            </TextField>
            <TextField name='start' type='datetime-local' onChange={setStart}>
              <Label>Start</Label>
              <Input value={start} />
            </TextField>
            <TextField name='end' type='datetime-local' onChange={setEnd}>
              <Label>End</Label>
              <Input value={end} />
            </TextField>
          </div>

          <div className='flex flex-wrap items-center gap-2'>
            <div className='text-xs font-semibold uppercase text-muted'>Columns</div>
            {([
              'created_at',
              'model_name',
              'token_name',
              'quota',
              'prompt_tokens',
              'completion_tokens',
              'use_time',
              'is_stream',
              'ip',
            ] as ColumnKey[]).map((c) => (
              <label key={c} className='flex items-center gap-1 text-sm'>
                <input
                  type='checkbox'
                  checked={columns.includes(c)}
                  onChange={(e) => toggleColumn(c, e.target.checked)}
                />
                {c}
              </label>
            ))}
          </div>
        </Card.Content>
      </Card>

      <Card className='gap-0 overflow-hidden p-0'>
        <table className='app-table'>
          <thead>
            <tr>
              {columns.includes('created_at') ? <th className='px-3 py-2'>Time</th> : null}
              {columns.includes('model_name') ? <th className='px-3 py-2'>Model</th> : null}
              {columns.includes('token_name') ? <th className='px-3 py-2'>Token</th> : null}
              {columns.includes('quota') ? <th className='px-3 py-2'>Quota</th> : null}
              {columns.includes('prompt_tokens') ? <th className='px-3 py-2'>Prompt</th> : null}
              {columns.includes('completion_tokens') ? <th className='px-3 py-2'>Completion</th> : null}
              {columns.includes('use_time') ? <th className='px-3 py-2'>Time(ms)</th> : null}
              {columns.includes('is_stream') ? <th className='px-3 py-2'>Stream</th> : null}
              {columns.includes('ip') ? <th className='px-3 py-2'>IP</th> : null}
              <th className='px-3 py-2'>Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((row) => (
              <tr key={`${row.id}-${row.created_at}`}>
                {columns.includes('created_at') ? <td className='px-3 py-2'>{formatUnixSeconds(row.created_at)}</td> : null}
                {columns.includes('model_name') ? <td className='px-3 py-2'>{row.model_name}</td> : null}
                {columns.includes('token_name') ? <td className='px-3 py-2'>{row.token_name}</td> : null}
                {columns.includes('quota') ? <td className='px-3 py-2'>{row.quota}</td> : null}
                {columns.includes('prompt_tokens') ? <td className='px-3 py-2'>{row.prompt_tokens}</td> : null}
                {columns.includes('completion_tokens') ? <td className='px-3 py-2'>{row.completion_tokens}</td> : null}
                {columns.includes('use_time') ? <td className='px-3 py-2'>{row.use_time}</td> : null}
                {columns.includes('is_stream') ? <td className='px-3 py-2'>{row.is_stream ? 'Yes' : 'No'}</td> : null}
                {columns.includes('ip') ? <td className='px-3 py-2'>{row.ip}</td> : null}
                <td className='px-3 py-2'>
                  <div className='flex flex-wrap gap-2'>
                    <TableActionButton label='View' onPress={() => setDetail(row)}>
                      <Eye size={16} />
                    </TableActionButton>
                    <TableActionButton
                      label='Copy'
                      onPress={() => {
                        copyText(JSON.stringify(row, null, 2)).then((ok) =>
                          ok ? toast.success('Copied') : toast.error('Copy failed'),
                        );
                      }}
                    >
                      <Copy size={16} />
                    </TableActionButton>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className='app-table-footer flex items-center justify-between px-4 py-3 text-sm'>
          <div>{loading ? 'Loading…' : `Total ${total}`}</div>
          <div className='flex items-center gap-2'>
            <Button
              size='sm'
              variant='secondary'
              isDisabled={page <= 1 || loading}
              onPress={() => setPage((p) => Math.max(1, p - 1))}
            >
              Prev
            </Button>
            <span>Page {page}</span>
            <Button
              size='sm'
              variant='secondary'
              isDisabled={page * pageSize >= total || loading}
              onPress={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
            <select
              value={String(pageSize)}
              onChange={(e) => {
                const size = Number(e.target.value);
                setPageSize(size);
                savePageSize(size);
                setPage(1);
              }}
              className='rounded-md'
            >
              {[10, 20, 50, 100].map((s) => (
                <option key={s} value={String(s)}>
                  {s} / page
                </option>
              ))}
            </select>
          </div>
        </div>
      </Card>
    </div>
  );
}
