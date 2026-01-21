import { useEffect, useState } from 'react';
import { Eye } from 'lucide-react';
import { fetchJson } from '@/api/client';
import type { ApiResponse } from '@/api/types';
import { formatUnixSeconds } from '@/lib/time';
import { copyText } from '@/lib/clipboard';
import { toast } from '@/ui/toast';
import { Button, Card, Modal } from '@/components/ui/heroui';
import { TableActionButton } from '@/components/ui/TableActionButton';

type TopUpRow = {
  id: number;
  amount: number;
  money: number;
  trade_no: string;
  payment_method: string;
  create_time: number;
  complete_time: number;
  status: string;
};

type PageInfo<T> = { page: number; page_size: number; total: number; items: T };

function TopUpDetailModal({
  topUp,
  onClose,
}: {
  topUp: TopUpRow | null;
  onClose: () => void;
}) {
  const tradeNo = topUp?.trade_no || '';

  return (
    <Modal
      isOpen={Boolean(topUp)}
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
    >
      <Button className='sr-only' variant='ghost'>
        Open
      </Button>

      <Modal.Backdrop>
        <Modal.Container size='sm'>
          <Modal.Dialog className='sm:max-w-[680px]'>
            <Modal.CloseTrigger />
            <Modal.Header>
              <Modal.Heading>Invoice detail</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              {topUp ? (
                <div className='space-y-4'>
                  <div className='grid grid-cols-1 gap-3 text-sm sm:grid-cols-2'>
                    <div>
                      <div className='text-muted'>Order</div>
                      <div className='mt-1 break-all font-mono'>{topUp.trade_no}</div>
                    </div>
                    <div>
                      <div className='text-muted'>Payment method</div>
                      <div className='mt-1'>{topUp.payment_method}</div>
                    </div>
                    <div>
                      <div className='text-muted'>Amount</div>
                      <div className='mt-1'>{topUp.amount}</div>
                    </div>
                    <div>
                      <div className='text-muted'>Credited</div>
                      <div className='mt-1'>{topUp.money}</div>
                    </div>
                    <div>
                      <div className='text-muted'>Created</div>
                      <div className='mt-1'>{formatUnixSeconds(topUp.create_time)}</div>
                    </div>
                    <div>
                      <div className='text-muted'>Completed</div>
                      <div className='mt-1'>
                        {topUp.complete_time ? formatUnixSeconds(topUp.complete_time) : '—'}
                      </div>
                    </div>
                    <div>
                      <div className='text-muted'>Status</div>
                      <div className='mt-1'>{topUp.status}</div>
                    </div>
                  </div>

                  <Card variant='secondary'>
                    <Card.Content className='space-y-2'>
                      <div className='text-sm text-muted'>Order number (Stripe: cs_*)</div>
                      <pre className='overflow-auto p-3 text-xs'>
                        <code className='font-mono'>{tradeNo}</code>
                      </pre>
                    </Card.Content>
                  </Card>
                </div>
              ) : null}
            </Modal.Body>
            <Modal.Footer className='flex gap-2'>
              <Button slot='close' variant='secondary'>
                Close
              </Button>
              <Button
                isDisabled={!tradeNo}
                onPress={() =>
                  copyText(tradeNo).then((ok) => (ok ? toast.success('Copied') : toast.error('Copy failed')))
                }
              >
                Copy order
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}

export function TopUpHistoryPage() {
  const [history, setHistory] = useState<TopUpRow[]>([]);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyPageSize] = useState(20);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [detailTopUp, setDetailTopUp] = useState<TopUpRow | null>(null);

  const loadHistory = async (page = historyPage) => {
    setHistoryLoading(true);
    try {
      const res = await fetchJson<ApiResponse<PageInfo<TopUpRow[]>>>('/api/user/topup/self', {
        params: { p: page, page_size: historyPageSize },
      });
      setHistory((res.data.items || []) as any);
      setHistoryTotal(res.data.total || 0);
      setHistoryPage(res.data.page || page);
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    loadHistory(1).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className='space-y-4'>
      <div className='text-lg font-semibold'>Invoices</div>

      <Card>
        <Card.Header>
          <div className='flex items-center justify-between gap-2'>
            <Card.Title>Invoice records</Card.Title>
            <Button
              size='sm'
              variant='secondary'
              onPress={() => loadHistory(historyPage).catch(() => {})}
            >
              Refresh
            </Button>
          </div>
        </Card.Header>
        <Card.Content className='space-y-3'>
          <Card className='gap-0 overflow-hidden p-0' variant='secondary'>
            <table className='app-table'>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Amount</th>
                  <th>Method</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {history.map((row) => (
                  <tr key={row.id}>
                    <td>{formatUnixSeconds(row.create_time)}</td>
                    <td>{row.amount}</td>
                    <td>{row.payment_method}</td>
                    <td>{row.status}</td>
                    <td className='text-right'>
                      <TableActionButton label='Details' onPress={() => setDetailTopUp(row)}>
                        <Eye size={16} />
                      </TableActionButton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <div className='flex items-center justify-between text-sm text-muted'>
            <div>{historyLoading ? 'Loading…' : `Total ${historyTotal}`}</div>
            <div className='flex items-center gap-2'>
              <Button
                size='sm'
                variant='secondary'
                isDisabled={historyPage <= 1 || historyLoading}
                onPress={() => loadHistory(historyPage - 1).catch(() => {})}
              >
                Prev
              </Button>
              <span>Page {historyPage}</span>
              <Button
                size='sm'
                variant='secondary'
                isDisabled={historyPage * historyPageSize >= historyTotal || historyLoading}
                onPress={() => loadHistory(historyPage + 1).catch(() => {})}
              >
                Next
              </Button>
            </div>
          </div>
        </Card.Content>
      </Card>

      <TopUpDetailModal topUp={detailTopUp} onClose={() => setDetailTopUp(null)} />
    </div>
  );
}
