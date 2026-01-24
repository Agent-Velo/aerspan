import { useEffect, useState } from "react";
import { Eye } from "lucide-react";
import { fetchJson } from "@/api/client";
import type { ApiResponse } from "@/api/types";
import { toast } from "@/ui/toast";
import {
  fromDateTimeLocalToMillis,
  toDateTimeLocalValueFromMillis,
  formatUnixMillis,
} from "@/lib/time";
import { useStatus } from "@/stores/status/StatusStore";
import { TableActionButton } from "@/components/ui/TableActionButton";
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
} from "@/components/ui/heroui";

type MidjourneyRow = {
  id: number;
  mj_id: string;
  action: string;
  prompt: string;
  status: string;
  progress: string;
  submit_time: number;
  finish_time: number;
  image_url: string;
  quota: number;
};

type PageInfo<T> = { page: number; page_size: number; total: number; items: T };

function loadPageSize() {
  const raw = localStorage.getItem("mj-page-size");
  const num = raw ? Number(raw) : 20;
  return Number.isFinite(num) && num > 0 ? num : 20;
}

function savePageSize(size: number) {
  localStorage.setItem("mj-page-size", String(size));
}

export function MidjourneyLogsPage() {
  const { status } = useStatus();
  const enabled =
    String(status?.enable_drawing) === "true" ||
    status?.enable_drawing === true;

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(() => loadPageSize());
  const [total, setTotal] = useState(0);
  const [items, setItems] = useState<MidjourneyRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [mjId, setMjId] = useState("");
  const [start, setStart] = useState(() =>
    toDateTimeLocalValueFromMillis(Date.now() - 7 * 86400 * 1000),
  );
  const [end, setEnd] = useState(() =>
    toDateTimeLocalValueFromMillis(Date.now()),
  );

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const load = async (nextPage = page, nextPageSize = pageSize) => {
    const startMs = fromDateTimeLocalToMillis(start);
    const endMs = fromDateTimeLocalToMillis(end);
    if (!startMs || !endMs || endMs <= startMs) {
      toast.error("Invalid time range.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetchJson<ApiResponse<PageInfo<MidjourneyRow[]>>>(
        "/api/mj/self",
        {
          params: {
            p: nextPage,
            page_size: nextPageSize,
            mj_id: mjId.trim(),
            start_timestamp: startMs,
            end_timestamp: endMs,
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
    load().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize]);

  const mjNotifyEnabled = localStorage.getItem("mj_notify_enabled");

  if (!enabled) {
    return (
      <Alert status="warning">
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Title>Drawing module is disabled</Alert.Title>
          <Alert.Description>
            Enable it in the server settings to view Midjourney logs.
          </Alert.Description>
        </Alert.Content>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      <Modal
        isOpen={Boolean(previewUrl)}
        onOpenChange={(isOpen) => {
          if (!isOpen) setPreviewUrl(null);
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
                <Modal.Heading>Preview</Modal.Heading>
              </Modal.Header>
              <Modal.Body>
                {previewUrl ? (
                  <Card className="overflow-hidden p-0" variant="secondary">
                    <img
                      src={previewUrl}
                      alt="preview"
                      className="max-h-[70vh] w-full object-contain"
                    />
                  </Card>
                ) : null}
              </Modal.Body>
              <Modal.Footer>
                <Button slot="close" variant="secondary">
                  Close
                </Button>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>

      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <div className="text-lg font-semibold">Midjourney logs</div>
          <div className="mt-1 text-sm text-muted">
            View your drawing history.
          </div>
        </div>
        <Button
          variant="secondary"
          isDisabled={loading}
          onPress={() => load(1, pageSize).catch(() => {})}
        >
          Refresh
        </Button>
      </div>

      {mjNotifyEnabled !== "true" ? (
        <Alert status="warning">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>Notifications are not enabled</Alert.Title>
            <Alert.Description>
              Midjourney notifications are not enabled on this device.
            </Alert.Description>
          </Alert.Content>
        </Alert>
      ) : null}

      <Card>
        <Card.Content>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <TextField name="mjId" onChange={setMjId}>
              <Label>MJ ID</Label>
              <Input value={mjId} />
            </TextField>
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
        <div className="overflow-x-auto">
          <table className="app-table min-w-max">
          <thead>
            <tr>
              <th className="px-3 py-2">Time</th>
              <th className="px-3 py-2">MJ ID</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Quota</th>
              <th className="px-3 py-2">Image</th>
            </tr>
          </thead>
          <tbody>
            {items.map((row) => (
              <tr key={row.id}>
                <td className="px-3 py-2">
                  {formatUnixMillis(row.submit_time)}
                </td>
                <td className="px-3 py-2">{row.mj_id}</td>
                <td className="px-3 py-2">{row.status || row.progress}</td>
                <td className="px-3 py-2">{row.quota}</td>
                <td className="px-3 py-2">
                  {row.image_url ? (
                    <TableActionButton
                      label="Preview"
                      onPress={() => setPreviewUrl(row.image_url)}
                    >
                      <Eye size={16} />
                    </TableActionButton>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          </table>
        </div>

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
