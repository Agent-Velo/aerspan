import { useEffect, useMemo, useState } from "react";
import { Copy, Eye } from "lucide-react";
import { fetchJson } from "@/api/client";
import type { ApiResponse } from "@/api/types";
import { toast } from "@/ui/toast";
import { copyText } from "@/lib/clipboard";
import {
  formatUnixSeconds,
  fromDateTimeLocalToSeconds,
  toDateTimeLocalValueFromSeconds,
} from "@/lib/time";
import {
  Button,
  Card,
  Input,
  Label,
  ListBox,
  Modal,
  Select,
  TextField,
} from "@/components/ui/heroui";
import { TableActionButton } from "@/components/ui/TableActionButton";

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

function loadPageSize() {
  const raw = localStorage.getItem("page-size");
  const num = raw ? Number(raw) : 20;
  return Number.isFinite(num) && num > 0 ? num : 20;
}

function savePageSize(size: number) {
  localStorage.setItem("page-size", String(size));
}

export function AuditLogsPage() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(() => loadPageSize());
  const [total, setTotal] = useState(0);
  const [items, setItems] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [type, setType] = useState<number>(0);
  const [start, setStart] = useState(() => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    return toDateTimeLocalValueFromSeconds(
      Math.floor(todayStart.getTime() / 1000),
    );
  });
  const [end, setEnd] = useState(() =>
    toDateTimeLocalValueFromSeconds(Math.floor(Date.now() / 1000) + 3600),
  );

  const [detail, setDetail] = useState<LogRow | null>(null);

  const typeLabel = useMemo(() => {
    const map: Record<number, string> = {
      1: "Topup",
      3: "Manage",
      4: "System",
      6: "Refund",
    };
    return (logType: number) => map[logType] || String(logType);
  }, []);

  const load = async (nextPage = page, nextPageSize = pageSize) => {
    const startSec = fromDateTimeLocalToSeconds(start);
    const endSec = fromDateTimeLocalToSeconds(end);
    if (!startSec || !endSec || endSec <= startSec) {
      toast.error("Invalid time range.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetchJson<ApiResponse<PageInfo<LogRow[]>>>(
        "/api/audit_log/self",
        {
          params: {
            p: nextPage,
            page_size: nextPageSize,
            type,
            start_timestamp: startSec,
            end_timestamp: endSec,
          },
        },
      );
      setItems((res.data.items || []) as any);
      setTotal(res.data.total || 0);
      setPage(res.data.page || nextPage);
      setPageSize(res.data.page_size || nextPageSize);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(page, pageSize).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize]);

  return (
    <div className="space-y-4">
      <Modal
        isOpen={Boolean(detail)}
        onOpenChange={(isOpen) => {
          if (!isOpen) setDetail(null);
        }}
      >
        <Button className="sr-only" variant="ghost">
          Open
        </Button>
        <Modal.Backdrop>
          <Modal.Container size="lg">
            <Modal.Dialog>
              <Modal.CloseTrigger />
              <Modal.Header>
                <Modal.Heading>Log detail</Modal.Heading>
              </Modal.Header>
              <Modal.Body>
                <Card variant="secondary">
                  <pre className="max-h-[70vh] overflow-auto text-xs">
                    {detail ? JSON.stringify(detail, null, 2) : ""}
                  </pre>
                </Card>
              </Modal.Body>
              <Modal.Footer>
                <Button slot="close">Close</Button>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>

      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <div className="text-lg font-semibold">Audit logs</div>
          <div className="mt-1 text-sm text-muted">
            Account and system events.
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            onPress={() => load(1, pageSize).catch(() => {})}
            isDisabled={loading}
          >
            Refresh
          </Button>
        </div>
      </div>

      <Card>
        <Card.Content className="space-y-3">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
            <Select
              value={String(type)}
              onChange={(value) => setType(Number(value || 0))}
            >
              <Label>Type</Label>
              <Select.Trigger>
                <Select.Value />
                <Select.Indicator />
              </Select.Trigger>
              <Select.Popover>
                <ListBox>
                  {[
                    { id: "0", label: "All" },
                    { id: "1", label: "Topup" },
                    { id: "3", label: "Manage" },
                    { id: "4", label: "System" },
                    { id: "6", label: "Refund" },
                  ].map((opt) => (
                    <ListBox.Item
                      key={opt.id}
                      id={opt.id}
                      textValue={opt.label}
                    >
                      {opt.label}
                      <ListBox.ItemIndicator />
                    </ListBox.Item>
                  ))}
                </ListBox>
              </Select.Popover>
            </Select>

            <div className="hidden md:block" />

            <TextField name="start" type="datetime-local" onChange={setStart}>
              <Label>Start</Label>
              <Input value={start} />
            </TextField>
            <TextField name="end" type="datetime-local" onChange={setEnd}>
              <Label>End</Label>
              <Input value={end} />
            </TextField>
          </div>
        </Card.Content>
      </Card>

      <Card className="gap-0 overflow-hidden p-0">
        <table className="app-table">
          <thead>
            <tr>
              <th className="px-3 py-2">Time</th>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2">Content</th>
              <th className="px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((row) => (
              <tr key={`${row.id}-${row.created_at}`}>
                <td className="px-3 py-2">
                  {formatUnixSeconds(row.created_at)}
                </td>
                <td className="px-3 py-2">{typeLabel(row.type)}</td>
                <td className="px-3 py-2">
                  <div className="max-w-[520px] truncate" title={row.content}>
                    {row.content}
                  </div>
                </td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-2">
                    <TableActionButton
                      label="View"
                      onPress={() => setDetail(row)}
                    >
                      <Eye size={16} />
                    </TableActionButton>
                    <TableActionButton
                      label="Copy"
                      onPress={() => {
                        copyText(JSON.stringify(row, null, 2)).then((ok) =>
                          ok
                            ? toast.success("Copied")
                            : toast.error("Copy failed"),
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

        <div className="app-table-footer flex items-center justify-between px-4 py-3 text-sm">
          <div>{loading ? "Loading…" : `Total ${total}`}</div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              isDisabled={page <= 1 || loading}
              onPress={() => setPage((p) => Math.max(1, p - 1))}
            >
              Prev
            </Button>
            <span>Page {page}</span>
            <Button
              size="sm"
              variant="secondary"
              isDisabled={page * pageSize >= total || loading}
              onPress={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
            <Select
              placeholder="Page size"
              value={String(pageSize)}
              onChange={(value) => {
                const size = Number(value);
                if (!Number.isFinite(size)) return;
                setPageSize(size);
                savePageSize(size);
                setPage(1);
              }}
            >
              <Select.Trigger className="min-w-[120px]">
                <Select.Value />
                <Select.Indicator />
              </Select.Trigger>
              <Select.Popover>
                <ListBox>
                  {[10, 20, 50, 100].map((s) => (
                    <ListBox.Item
                      key={String(s)}
                      id={String(s)}
                      textValue={`${s} / page`}
                    >
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
