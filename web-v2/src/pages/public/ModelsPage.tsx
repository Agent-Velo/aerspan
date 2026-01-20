import { useEffect, useMemo, useState } from 'react';
import { useLocation, Navigate } from 'react-router-dom';
import { fetchJson } from '@/api/client';
import { toast } from '@/ui/toast';
import { copyText } from '@/lib/clipboard';
import { useAuth } from '@/stores/auth/AuthStore';
import { useStatus } from '@/stores/status/StatusStore';
import { Button, Card, Chip, Input, Label, ListBox, Modal, Select, Spinner, TextField } from '@/components/ui/heroui';

type PricingItem = {
  model_name: string;
  description?: string;
  icon?: string;
  tags?: string;
  vendor_id?: number;
  total_context?: number;
  max_output?: number;
  quota_type: number;
  input_price: number;
  output_price: number;
  cache_read_price?: number;
  image_input_price?: number;
  audio_input_price?: number;
  audio_output_price?: number;
  model_price: number;
  owner_by?: string;
  supported_endpoint_types?: string[];
};

type Vendor = {
  id: number;
  name: string;
  description?: string;
  icon?: string;
};

type SupportedEndpointInfo = {
  path: string;
  method: string;
};

type PricingResponse = {
  success: boolean;
  data: PricingItem[];
  vendors: Vendor[];
  supported_endpoint: Record<string, SupportedEndpointInfo>;
};

function parseHeaderNavModules(raw?: string): { enabled: boolean; requireAuth: boolean } {
  if (!raw) return { enabled: true, requireAuth: false };
  try {
    const modules = JSON.parse(raw);
    const pricing = modules?.pricing;
    if (typeof pricing === 'boolean') {
      return { enabled: pricing, requireAuth: false };
    }
    if (pricing && typeof pricing === 'object') {
      return {
        enabled: pricing.enabled !== false,
        requireAuth: pricing.requireAuth === true,
      };
    }
  } catch {
    // ignore
  }
  return { enabled: true, requireAuth: false };
}

function splitTags(value?: string) {
  return (value || '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
}

function formatUsd(value: number) {
  if (!Number.isFinite(value)) return '-';
  const rounded = Math.round(value * 1000000) / 1000000;
  return `$${rounded}`;
}

export function ModelsPage() {
  const { user } = useAuth();
  const { status } = useStatus();
  const location = useLocation();
  const pricingGate = useMemo(() => parseHeaderNavModules(status?.HeaderNavModules), [status?.HeaderNavModules]);

  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<PricingItem[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [supportedEndpoints, setSupportedEndpoints] = useState<Record<string, SupportedEndpointInfo>>({});

  const [query, setQuery] = useState('');
  const [quotaType, setQuotaType] = useState<string>('');
  const [endpointType, setEndpointType] = useState<string>('');
  const [vendorId, setVendorId] = useState<string>('');
  const [tag, setTag] = useState<string>('');

  const [selected, setSelected] = useState<PricingItem | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetchJson<PricingResponse>('/api/pricing');
        if (!cancelled) {
          setItems(res.data || []);
          setVendors(res.vendors || []);
          setSupportedEndpoints(res.supported_endpoint || {});
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const vendorMap = useMemo(() => {
    const map = new Map<number, Vendor>();
    for (const v of vendors) map.set(v.id, v);
    return map;
  }, [vendors]);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const item of items) {
      for (const t of splitTags(item.tags)) set.add(t);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [items]);

  const allEndpointTypes = useMemo(() => {
    const set = new Set<string>();
    for (const item of items) {
      for (const et of item.supported_endpoint_types || []) set.add(et);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [items]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((item) => {
      if (q) {
        const vendorName = item.vendor_id ? vendorMap.get(item.vendor_id)?.name || '' : '';
        const haystack = `${item.model_name} ${item.description || ''} ${item.tags || ''} ${vendorName}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      if (quotaType) {
        if (String(item.quota_type) !== quotaType) return false;
      }
      if (endpointType) {
        if (!(item.supported_endpoint_types || []).includes(endpointType)) return false;
      }
      if (vendorId) {
        if (String(item.vendor_id || '') !== vendorId) return false;
      }
      if (tag) {
        if (!splitTags(item.tags).includes(tag)) return false;
      }
      return true;
    });
  }, [items, query, quotaType, endpointType, vendorId, tag, vendorMap]);

  if (!pricingGate.enabled) {
    return (
      <Card>
        <Card.Header>
          <Card.Title>Models</Card.Title>
          <Card.Description>This section is disabled.</Card.Description>
        </Card.Header>
      </Card>
    );
  }

  if (pricingGate.requireAuth && !user) {
    return <Navigate to='/login' state={{ from: location }} replace />;
  }

  return (
    <div className='space-y-4'>
      <div className='flex flex-col justify-between gap-3 md:flex-row md:items-end'>
        <div>
          <div className='text-lg font-semibold'>Models</div>
          <div className='mt-1 text-sm text-muted'>Pricing is displayed in USD.</div>
        </div>
        <div className='flex flex-wrap gap-2'>
          <TextField name='query' onChange={setQuery} className='w-full md:w-64'>
            <Label>Search</Label>
            <Input value={query} placeholder='Search…' />
          </TextField>

          <Select
            placeholder='Quota type'
            value={quotaType || null}
            onChange={(value) => setQuotaType(String(value || ''))}
          >
            <Label>Quota type</Label>
            <Select.Trigger>
              <Select.Value />
              <Select.Indicator />
            </Select.Trigger>
            <Select.Popover>
              <ListBox>
                <ListBox.Item id='1' textValue='Per request'>
                  Per request
                  <ListBox.ItemIndicator />
                </ListBox.Item>
                <ListBox.Item id='2' textValue='Tokens'>
                  Tokens
                  <ListBox.ItemIndicator />
                </ListBox.Item>
              </ListBox>
            </Select.Popover>
          </Select>

          <Select
            placeholder='Endpoint'
            value={endpointType || null}
            onChange={(value) => setEndpointType(String(value || ''))}
          >
            <Label>Endpoint</Label>
            <Select.Trigger>
              <Select.Value />
              <Select.Indicator />
            </Select.Trigger>
            <Select.Popover>
              <ListBox>
                {allEndpointTypes.map((et) => (
                  <ListBox.Item key={et} id={et} textValue={et}>
                    {et}
                    <ListBox.ItemIndicator />
                  </ListBox.Item>
                ))}
              </ListBox>
            </Select.Popover>
          </Select>

          <Select
            placeholder='Vendor'
            value={vendorId || null}
            onChange={(value) => setVendorId(String(value || ''))}
          >
            <Label>Vendor</Label>
            <Select.Trigger>
              <Select.Value />
              <Select.Indicator />
            </Select.Trigger>
            <Select.Popover>
              <ListBox>
                {vendors.map((v) => (
                  <ListBox.Item key={v.id} id={String(v.id)} textValue={v.name}>
                    {v.name}
                    <ListBox.ItemIndicator />
                  </ListBox.Item>
                ))}
              </ListBox>
            </Select.Popover>
          </Select>

          <Select
            placeholder='Tag'
            value={tag || null}
            onChange={(value) => setTag(String(value || ''))}
          >
            <Label>Tag</Label>
            <Select.Trigger>
              <Select.Value />
              <Select.Indicator />
            </Select.Trigger>
            <Select.Popover>
              <ListBox>
                {allTags.map((t) => (
                  <ListBox.Item key={t} id={t} textValue={t}>
                    {t}
                    <ListBox.ItemIndicator />
                  </ListBox.Item>
                ))}
              </ListBox>
            </Select.Popover>
          </Select>

          <Button
            variant='secondary'
            onPress={() => {
              setQuery('');
              setQuotaType('');
              setEndpointType('');
              setVendorId('');
              setTag('');
            }}
          >
            Reset
          </Button>
        </div>
      </div>

      <Card className='gap-0 overflow-hidden p-0'>
        <div className='app-table-footer flex items-center justify-between px-4 py-3 text-sm'>
          <div className='flex items-center gap-2'>
            {loading ? <Spinner size='sm' /> : null}
            <span>{loading ? 'Loading…' : `${filtered.length} models`}</span>
          </div>
        </div>
        <div className='app-divider-y'>
          {filtered.map((item) => {
            const vendorName = item.vendor_id ? vendorMap.get(item.vendor_id)?.name : undefined;
            const tags = splitTags(item.tags);
            const endpoints = (item.supported_endpoint_types || []).slice(0, 4);

            return (
              <button
                key={item.model_name}
                className='w-full px-4 py-3 text-left'
                onClick={() => setSelected(item)}
              >
                <div className='flex flex-col gap-1 md:flex-row md:items-center md:justify-between'>
                  <div className='min-w-0'>
                    <div className='flex items-center gap-2'>
                      <div className='truncate text-sm font-semibold'>{item.model_name}</div>
                      {vendorName ? (
                        <Chip size='sm' variant='secondary'>
                          {vendorName}
                        </Chip>
                      ) : null}
                    </div>
                    {item.description ? (
                      <div className='mt-1 max-h-10 overflow-hidden text-xs text-muted'>
                        {item.description}
                      </div>
                    ) : null}
                  </div>
                  <div className='mt-2 shrink-0 text-xs text-muted md:mt-0 md:text-right'>
                    {item.quota_type === 1 ? (
                      <div>{formatUsd(item.model_price)} / request</div>
                    ) : (
                      <div>
                        {formatUsd(item.input_price)} / 1M input · {formatUsd(item.output_price)} / 1M output
                      </div>
                    )}
                  </div>
                </div>

                <div className='mt-2 flex flex-wrap gap-1'>
                  {endpoints.map((et) => (
                    <Chip key={et} size='sm' variant='secondary' color='accent'>
                      {et}
                    </Chip>
                  ))}
                  {tags.slice(0, 4).map((t) => (
                    <Chip key={t} size='sm' variant='tertiary'>
                      {t}
                    </Chip>
                  ))}
                </div>
              </button>
            );
          })}
        </div>
      </Card>

      <Modal
        isOpen={Boolean(selected)}
        onOpenChange={(isOpen) => {
          if (!isOpen) setSelected(null);
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
                <div className='min-w-0'>
                  <Modal.Heading>{selected?.model_name || 'Model'}</Modal.Heading>
                  <div className='mt-1 text-xs text-muted'>{selected?.description || '—'}</div>
                </div>
              </Modal.Header>

              <Modal.Body>
                <div className='grid grid-cols-1 gap-3 md:grid-cols-2'>
                  <Card variant='secondary'>
                    <Card.Header>
                      <Card.Title>Pricing</Card.Title>
                    </Card.Header>
                    <Card.Content className='text-sm'>
                      {selected?.quota_type === 1 ? (
                        <div>{formatUsd(selected.model_price)} / request</div>
                      ) : (
                        <div className='space-y-1'>
                          <div>Input: {formatUsd(selected?.input_price || 0)} / 1M tokens</div>
                          <div>Output: {formatUsd(selected?.output_price || 0)} / 1M tokens</div>
                          {selected?.cache_read_price ? (
                            <div>Cache: {formatUsd(selected.cache_read_price)} / 1M tokens</div>
                          ) : null}
                          {selected?.image_input_price ? (
                            <div>Image input: {formatUsd(selected.image_input_price)} / 1M tokens</div>
                          ) : null}
                          {selected?.audio_input_price ? (
                            <div>Audio input: {formatUsd(selected.audio_input_price)} / 1M tokens</div>
                          ) : null}
                          {selected?.audio_output_price ? (
                            <div>Audio output: {formatUsd(selected.audio_output_price)} / 1M tokens</div>
                          ) : null}
                        </div>
                      )}
                    </Card.Content>
                  </Card>

                  <Card variant='secondary'>
                    <Card.Header>
                      <Card.Title>Capabilities</Card.Title>
                    </Card.Header>
                    <Card.Content className='space-y-2 text-xs'>
                      <div>
                        <span className='text-muted'>Tags: </span>
                        {splitTags(selected?.tags).join(', ') || '—'}
                      </div>
                      <div>
                        <span className='text-muted'>Endpoint types: </span>
                        {(selected?.supported_endpoint_types || []).join(', ') || '—'}
                      </div>
                      <div>
                        <span className='text-muted'>Supported endpoints: </span>
                        {Object.entries(supportedEndpoints)
                          .map(([k, v]) => `${k}: ${v.method} ${v.path}`)
                          .join(' · ') || '—'}
                      </div>
                    </Card.Content>
                  </Card>
                </div>
              </Modal.Body>

              <Modal.Footer>
                <Button
                  variant='secondary'
                  onPress={() => {
                    if (!selected?.model_name) return;
                    copyText(selected.model_name).then((ok) =>
                      ok ? toast.success('Copied') : toast.error('Copy failed'),
                    );
                  }}
                >
                  Copy name
                </Button>
                <Button slot='close'>Close</Button>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>
    </div>
  );
}
