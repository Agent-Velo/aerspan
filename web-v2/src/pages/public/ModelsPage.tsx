import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, Navigate } from 'react-router-dom';
import { fetchJson } from '@/api/client';
import { useAuth } from '@/stores/auth/AuthStore';
import { useStatus } from '@/stores/status/StatusStore';
import { Button, Card, Chip, Input, Label, ListBox, Select, Spinner, TextField } from '@/components/ui/heroui';

type PricingItem = {
  model_name: string;
  display_name?: string;
  description?: string;
  icon?: string;
  tags?: string;
  vendor_id?: number;
  total_context?: number;
  max_output?: number;
  quota_type: number;
  input_price: number;
  output_price: number;
  input_token_price_multiplier_tiers?: TokenPriceTier[];
  output_token_price_multiplier_tiers?: TokenPriceTier[];
  cache_read_price?: number;
  image_input_price?: number;
  audio_input_price?: number;
  audio_output_price?: number;
  model_price: number;
  owner_by?: string;
  supported_endpoint_types?: string[];
};

type TokenPriceTier = {
  min: number;
  max?: number;
  multiplier: number;
};

type Vendor = {
  id: number;
  name: string;
  description?: string;
  icon?: string;
};

type PricingResponse = {
  success: boolean;
  data: PricingItem[];
  vendors: Vendor[];
  supported_endpoint: Record<string, { path: string; method: string }>;
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

function normalizeMultiSelectValue(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((v) => String(v)).filter(Boolean);
  if (value === null || value === undefined) return [];
  const asString = String(value).trim();
  return asString ? [asString] : [];
}

function formatMultiSelectLabel({
  placeholder,
  isPlaceholder,
  selectedItems,
  selectedText,
}: {
  placeholder: string;
  isPlaceholder: boolean;
  selectedItems: unknown[];
  selectedText: string;
}) {
  if (isPlaceholder) return placeholder;
  const count = selectedItems.filter(Boolean).length;
  if (count <= 1) return selectedText;
  return `${count} selected`;
}

function ModelsFilters({
  loading,
  query,
  setQuery,
  quotaTypes,
  setQuotaTypes,
  endpointTypes,
  setEndpointTypes,
  vendorIds,
  setVendorIds,
  tags,
  setTags,
  vendors,
  allEndpointTypes,
  allTags,
  onReset,
  resetDisabled,
}: {
  loading: boolean;
  query: string;
  setQuery: (value: string) => void;
  quotaTypes: string[];
  setQuotaTypes: (value: string[]) => void;
  endpointTypes: string[];
  setEndpointTypes: (value: string[]) => void;
  vendorIds: string[];
  setVendorIds: (value: string[]) => void;
  tags: string[];
  setTags: (value: string[]) => void;
  vendors: Vendor[];
  allEndpointTypes: string[];
  allTags: string[];
  onReset: () => void;
  resetDisabled: boolean;
}) {
  return (
    <Card>
      <Card.Header>
        <div className='flex w-full items-start justify-between gap-3'>
          <div>
            <Card.Title>Filters</Card.Title>
            <Card.Description>Refine the models list.</Card.Description>
          </div>
          <Button size='sm' variant='secondary' onPress={onReset} isDisabled={resetDisabled || loading}>
            Reset
          </Button>
        </div>
      </Card.Header>
      <Card.Content className='space-y-3'>
        <TextField name='query' onChange={setQuery} className='w-full'>
          <Label>Search</Label>
          <Input value={query} placeholder='Search…' />
        </TextField>

        <Select
          placeholder='Quota type'
          selectionMode='multiple'
          value={quotaTypes}
          onChange={(value) => setQuotaTypes(normalizeMultiSelectValue(value))}
        >
          <Label>Quota type</Label>
          <Select.Trigger>
            <Select.Value>
              {({ isPlaceholder, selectedItems, selectedText }) =>
                formatMultiSelectLabel({
                  placeholder: 'Quota type',
                  isPlaceholder,
                  selectedItems,
                  selectedText,
                })
              }
            </Select.Value>
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
          selectionMode='multiple'
          value={endpointTypes}
          onChange={(value) => setEndpointTypes(normalizeMultiSelectValue(value))}
        >
          <Label>Endpoint</Label>
          <Select.Trigger>
            <Select.Value>
              {({ isPlaceholder, selectedItems, selectedText }) =>
                formatMultiSelectLabel({
                  placeholder: 'Endpoint',
                  isPlaceholder,
                  selectedItems,
                  selectedText,
                })
              }
            </Select.Value>
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
          selectionMode='multiple'
          value={vendorIds}
          onChange={(value) => setVendorIds(normalizeMultiSelectValue(value))}
        >
          <Label>Vendor</Label>
          <Select.Trigger>
            <Select.Value>
              {({ isPlaceholder, selectedItems, selectedText }) =>
                formatMultiSelectLabel({
                  placeholder: 'Vendor',
                  isPlaceholder,
                  selectedItems,
                  selectedText,
                })
              }
            </Select.Value>
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
          selectionMode='multiple'
          value={tags}
          onChange={(value) => setTags(normalizeMultiSelectValue(value))}
        >
          <Label>Tag</Label>
          <Select.Trigger>
            <Select.Value>
              {({ isPlaceholder, selectedItems, selectedText }) =>
                formatMultiSelectLabel({
                  placeholder: 'Tag',
                  isPlaceholder,
                  selectedItems,
                  selectedText,
                })
              }
            </Select.Value>
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
      </Card.Content>
    </Card>
  );
}

export function ModelsPage() {
  const { user } = useAuth();
  const { status } = useStatus();
  const location = useLocation();
  const navigate = useNavigate();
  const pricingGate = useMemo(() => parseHeaderNavModules(status?.HeaderNavModules), [status?.HeaderNavModules]);

  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<PricingItem[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);

  const [query, setQuery] = useState('');
  const [quotaTypes, setQuotaTypes] = useState<string[]>([]);
  const [endpointTypes, setEndpointTypes] = useState<string[]>([]);
  const [vendorIds, setVendorIds] = useState<string[]>([]);
  const [tags, setTags] = useState<string[]>([]);

  const resetFilters = () => {
    setQuery('');
    setQuotaTypes([]);
    setEndpointTypes([]);
    setVendorIds([]);
    setTags([]);
  };

  const hasActiveFilters = Boolean(
    query.trim() || quotaTypes.length || endpointTypes.length || vendorIds.length || tags.length,
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetchJson<PricingResponse>('/api/pricing');
        if (!cancelled) {
          setItems(res.data || []);
          setVendors(res.vendors || []);
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
      if (quotaTypes.length) {
        if (!quotaTypes.includes(String(item.quota_type))) return false;
      }
      if (endpointTypes.length) {
        const supported = item.supported_endpoint_types || [];
        if (!endpointTypes.some((et) => supported.includes(et))) return false;
      }
      if (vendorIds.length) {
        if (!vendorIds.includes(String(item.vendor_id || ''))) return false;
      }
      if (tags.length) {
        const itemTags = splitTags(item.tags);
        if (!tags.some((t) => itemTags.includes(t))) return false;
      }
      return true;
    });
  }, [items, query, quotaTypes, endpointTypes, vendorIds, tags, vendorMap]);

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
    return <Navigate to='/auth/signin' state={{ from: location }} replace />;
  }

  return (
    <div className='space-y-4'>
      <div>
        <div className='text-lg font-semibold'>Models</div>
        <div className='mt-1 text-sm text-muted'>Pricing is displayed in USD.</div>
      </div>

      <div className='grid grid-cols-1 gap-4 md:grid-cols-[16rem_1fr] md:items-start md:gap-6 lg:grid-cols-[18rem_1fr]'>
        <aside className='md:sticky md:top-16 md:max-h-[calc(100vh-5rem)] md:overflow-auto'>
          <ModelsFilters
            loading={loading}
            query={query}
            setQuery={setQuery}
            quotaTypes={quotaTypes}
            setQuotaTypes={setQuotaTypes}
            endpointTypes={endpointTypes}
            setEndpointTypes={setEndpointTypes}
            vendorIds={vendorIds}
            setVendorIds={setVendorIds}
            tags={tags}
            setTags={setTags}
            vendors={vendors}
            allEndpointTypes={allEndpointTypes}
            allTags={allTags}
            onReset={resetFilters}
            resetDisabled={!hasActiveFilters}
          />
        </aside>

        <div className='min-w-0'>
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
                const modelName = item.display_name?.trim() || item.model_name;
                const displayName = vendorName ? `${vendorName}: ${modelName}` : modelName;
                const hasTierPricing =
                  (item.input_token_price_multiplier_tiers?.length || 0) > 0 ||
                  (item.output_token_price_multiplier_tiers?.length || 0) > 0;

                return (
                  <button
                    key={item.model_name}
                    className='w-full px-4 py-3 text-left'
                    onClick={() => navigate(`/models/${encodeURIComponent(item.model_name)}`)}
                  >
                    <div className='flex flex-col gap-1 md:flex-row md:items-center md:justify-between'>
                      <div className='min-w-0'>
                        <div className='flex items-center gap-2'>
                          <div className='truncate text-base font-semibold'>{displayName}</div>
                        </div>
                        {item.description ? (
                          <div className='mt-1 max-h-10 overflow-hidden text-sm text-muted'>
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
                            {hasTierPricing ? <div className='mt-1'>Tiered multipliers apply</div> : null}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className='mt-2 flex flex-wrap gap-1'>
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
        </div>
      </div>
    </div>
  );
}
