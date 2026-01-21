import { useEffect, useState } from 'react';
import { Eye } from 'lucide-react';
import { fetchJson } from '@/api/client';
import type { ApiResponse } from '@/api/types';
import { toast } from '@/ui/toast';
import { fromDateTimeLocalToSeconds, toDateTimeLocalValueFromSeconds, formatUnixSeconds } from '@/lib/time';
import { useStatus } from '@/stores/status/StatusStore';
import { TableActionButton } from '@/components/ui/TableActionButton';
import {
  Alert,
  Button,
  Card,
  Input,
  Label,
  ListBox,
  Modal,
  Select,
  TextField,
} from '@/components/ui/heroui';

type TaskRow = {
  id: number;
  task_id: string;
  platform: string;
  action: string;
  status: string;
  quota: number;
  submit_time: number;
  finish_time: number;
  progress: string;
  fail_reason: string;
  data: any;
  properties: any;
};

type PageInfo<T> = { page: number; page_size: number; total: number; items: T };

function loadPageSize() {
  const raw = localStorage.getItem('task-page-size');
  const num = raw ? Number(raw) : 20;
  return Number.isFinite(num) && num > 0 ? num : 20;
}

function savePageSize(size: number) {
  localStorage.setItem('task-page-size', String(size));
}

export function TaskLogsPage() {
  const { status } = useStatus();
  const enabled = String(status?.enable_task) === 'true' || status?.enable_task === true;

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(() => loadPageSize());
  const [total, setTotal] = useState(0);
  const [items, setItems] = useState<TaskRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [taskId, setTaskId] = useState('');
  const [start, setStart] = useState(() => toDateTimeLocalValueFromSeconds(Math.floor(Date.now() / 1000) - 7 * 86400));
  const [end, setEnd] = useState(() => toDateTimeLocalValueFromSeconds(Math.floor(Date.now() / 1000)));

  const [detail, setDetail] = useState<TaskRow | null>(null);

  const load = async (nextPage = page, nextPageSize = pageSize) => {
    const startSec = fromDateTimeLocalToSeconds(start);
    const endSec = fromDateTimeLocalToSeconds(end);
    if (!startSec || !endSec || endSec <= startSec) {
      toast.error('Invalid time range.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetchJson<ApiResponse<PageInfo<TaskRow[]>>>('/api/task/self', {
        params: {
          p: nextPage,
          page_size: nextPageSize,
          task_id: taskId.trim(),
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

  useEffect(() => {
    load().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize]);

  if (!enabled) {
    return (
      <Alert status='warning'>
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Title>Task module is disabled</Alert.Title>
          <Alert.Description>Enable it in the server settings to view task logs.</Alert.Description>
        </Alert.Content>
      </Alert>
    );
  }

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
                <Modal.Heading>Task detail</Modal.Heading>
              </Modal.Header>
              <Modal.Body>
                <Card className='overflow-hidden p-0' variant='secondary'>
                  <pre className='m-0 max-h-[70vh] overflow-auto p-3 text-xs'>
                    {detail ? JSON.stringify(detail, null, 2) : ''}
                  </pre>
                </Card>
              </Modal.Body>
              <Modal.Footer>
                <Button slot='close' variant='secondary'>
                  Close
                </Button>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>

      <div className='flex flex-col justify-between gap-3 md:flex-row md:items-end'>
        <div>
          <div className='text-lg font-semibold'>Task logs</div>
          <div className='mt-1 text-sm text-muted'>View your task history.</div>
        </div>
        <Button variant='secondary' isDisabled={loading} onPress={() => load(1, pageSize).catch(() => {})}>
          Refresh
        </Button>
      </div>

      <Card>
        <Card.Content>
          <div className='grid grid-cols-1 gap-3 md:grid-cols-3'>
            <TextField name='taskId' onChange={setTaskId}>
              <Label>Task ID</Label>
              <Input value={taskId} />
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
        </Card.Content>
      </Card>

      <Card className='gap-0 overflow-hidden p-0'>
        <table className='app-table'>
          <thead>
            <tr>
              <th className='px-3 py-2'>Time</th>
              <th className='px-3 py-2'>Task ID</th>
              <th className='px-3 py-2'>Status</th>
              <th className='px-3 py-2'>Quota</th>
              <th className='px-3 py-2'>Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((row) => (
              <tr key={String(row.id)}>
                <td className='px-3 py-2'>{formatUnixSeconds(row.submit_time)}</td>
                <td className='px-3 py-2'>{row.task_id}</td>
                <td className='px-3 py-2'>{row.status || row.progress || '—'}</td>
                <td className='px-3 py-2'>{row.quota}</td>
                <td className='px-3 py-2'>
                  <TableActionButton label='View' onPress={() => setDetail(row)}>
                    <Eye size={16} />
                  </TableActionButton>
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

            <Select
              placeholder='Page size'
              value={String(pageSize)}
              onChange={(value) => {
                const size = Number(value);
                if (!Number.isFinite(size)) return;
                setPageSize(size);
                savePageSize(size);
                setPage(1);
              }}
            >
              <Label>Page size</Label>
              <Select.Trigger className='min-w-[120px]'>
                <Select.Value />
                <Select.Indicator />
              </Select.Trigger>
              <Select.Popover>
                <ListBox>
                  {[10, 20, 50, 100].map((s) => (
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
