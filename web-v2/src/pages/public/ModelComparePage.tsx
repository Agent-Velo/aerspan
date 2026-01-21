import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { fetchJson } from '@/api/client';
import { Button, Card, Chip, Label, ListBox, Select, Separator, Spinner } from '@/components/ui/heroui';
import { Check, Shuffle, X } from 'lucide-react';

type PricingItem = {
  model_name: string;
  display_name?: string;
  description?: string;
  tags?: string;
  total_context?: number;
  max_output?: number;
  quota_type: number;
  input_price: number;
  output_price: number;
  input_token_price_multiplier_tiers?: TokenPriceTier[];
  output_token_price_multiplier_tiers?: TokenPriceTier[];
  cache_read_price?: number;
  cache_write_price?: number;
  image_input_price?: number;
  audio_input_price?: number;
  audio_output_price?: number;
  model_price: number;
  supported_endpoint_types?: string[];
};

type TokenPriceTier = {
  min: number;
  max?: number;
  multiplier: number;
};

type SupportedEndpointInfo = {
  path: string;
  method: string;
};

type PricingResponse = {
  success: boolean;
  data: PricingItem[];
  supported_endpoint: Record<string, SupportedEndpointInfo>;
};

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

function formatTierRange(tier: TokenPriceTier) {
  const min = Number.isFinite(tier.min) ? tier.min : 0;
  const max = typeof tier.max === 'number' && Number.isFinite(tier.max) ? tier.max : undefined;
  const lower = min.toLocaleString();
  const upper = max === undefined ? '∞' : max.toLocaleString();
  return `[${lower}, ${upper})`;
}

function formatTierList(tiers: TokenPriceTier[] | undefined, basePrice: number) {
  if (!tiers || tiers.length === 0) return '—';
  const sorted = [...tiers].sort((a, b) => a.min - b.min);
  return sorted
    .map((tier) => {
      const multiplier = Number.isFinite(tier.multiplier) ? tier.multiplier : 1;
      const effective = Number.isFinite(basePrice) ? basePrice * multiplier : NaN;
      return `${formatTierRange(tier)} ×${multiplier} (${formatUsd(effective)} / 1M)`;
    })
    .join('\n');
}

function normalizeEndpointOrder(all: string[]) {
  const known = [
    'openai',
    'openai-response',
    'anthropic',
    'gemini',
    'embeddings',
    'jina-rerank',
    'image-generation',
    'openai-video',
  ];
  const knownSet = new Set(known);
  const inKnown: string[] = [];
  const others: string[] = [];
  for (const name of all) {
    if (knownSet.has(name)) inKnown.push(name);
    else others.push(name);
  }
  inKnown.sort((a, b) => known.indexOf(a) - known.indexOf(b));
  others.sort((a, b) => a.localeCompare(b));
  return [...inKnown, ...others];
}

function getCacheReadPrice(item: PricingItem) {
  return typeof item.cache_read_price === 'number' ? item.cache_read_price : item.input_price;
}

function getCacheWritePrice(item: PricingItem) {
  return typeof item.cache_write_price === 'number' ? item.cache_write_price : item.input_price * 1.25;
}

function buildCapabilitySets(item: PricingItem) {
  const endpoints = new Set(item.supported_endpoint_types || []);
  const input = [
    { key: 'text', label: 'Text', supported: true },
    { key: 'image', label: 'Image', supported: typeof item.image_input_price === 'number' },
    { key: 'audio', label: 'Audio', supported: typeof item.audio_input_price === 'number' },
  ];
  const output = [
    {
      key: 'text',
      label: 'Text',
      supported:
        endpoints.has('openai') || endpoints.has('openai-response') || endpoints.has('anthropic') || endpoints.has('gemini'),
    },
    { key: 'image', label: 'Image', supported: endpoints.has('image-generation') },
    { key: 'audio', label: 'Audio', supported: typeof item.audio_output_price === 'number' },
    { key: 'video', label: 'Video', supported: endpoints.has('openai-video') },
    { key: 'embedding', label: 'Embedding', supported: endpoints.has('embeddings') },
  ];
  return { input, output };
}

function SupportedIcon({ ok }: { ok: boolean }) {
  return ok ? <Check size={16} className='text-success' /> : <X size={16} className='text-muted' />;
}

function PriceValue({
  value,
  hint,
  align = 'left',
}: {
  value: string;
  hint?: string;
  align?: 'left' | 'right';
}) {
  return (
    <div className={align === 'right' ? 'text-right' : ''}>
      <div className='text-sm font-semibold'>{value}</div>
      {hint ? <div className='mt-0.5 text-xs text-muted'>{hint}</div> : null}
    </div>
  );
}

export function ModelComparePage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const left = searchParams.get('left') || '';
  const right = searchParams.get('right') || '';

  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<PricingItem[]>([]);
  const [supportedEndpoints, setSupportedEndpoints] = useState<Record<string, SupportedEndpointInfo>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetchJson<PricingResponse>('/api/pricing');
        if (!cancelled) {
          setItems(res.data || []);
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

  const itemMap = useMemo(() => {
    const map = new Map<string, PricingItem>();
    for (const item of items) map.set(item.model_name, item);
    return map;
  }, [items]);

  const endpointKeys = useMemo(
    () => normalizeEndpointOrder(Object.keys(supportedEndpoints || {})),
    [supportedEndpoints],
  );

  const leftItem = left ? itemMap.get(left) || null : null;
  const rightItem = right ? itemMap.get(right) || null : null;

  const leftCaps = useMemo(() => (leftItem ? buildCapabilitySets(leftItem) : null), [leftItem]);
  const rightCaps = useMemo(() => (rightItem ? buildCapabilitySets(rightItem) : null), [rightItem]);

  const options = useMemo(() => {
    return [...items]
      .sort((a, b) => (a.display_name || a.model_name).localeCompare(b.display_name || b.model_name))
      .map((m) => ({ id: m.model_name, label: m.display_name?.trim() || m.model_name }));
  }, [items]);

  const updateParam = (key: 'left' | 'right', value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    setSearchParams(next, { replace: true });
  };

  return (
    <div className='space-y-4 px-6 md:px-12 lg:px-20 xl:px-32'>
      <div className='flex flex-col justify-between gap-3 md:flex-row md:items-start'>
        <div>
          <div className='text-2xl font-semibold'>Compare</div>
          <div className='mt-1 text-sm text-muted'>Pick two models to compare pricing and capabilities.</div>
        </div>
        <div className='flex flex-wrap gap-2'>
          <Button variant='secondary' onPress={() => navigate('/models')}>
            Back
          </Button>
        </div>
      </div>

      <Card>
        <Card.Content className='space-y-3'>
          <div className='grid grid-cols-1 gap-3 md:grid-cols-[1fr_auto_1fr] md:items-end'>
            <Select
              placeholder='Select model'
              value={left || null}
              onChange={(value) => updateParam('left', String(value || ''))}
            >
              <Label>Left</Label>
              <Select.Trigger>
                <Select.Value />
                <Select.Indicator />
              </Select.Trigger>
              <Select.Popover>
                <ListBox>
                  {options.map((o) => (
                    <ListBox.Item key={o.id} id={o.id} textValue={o.label}>
                      {o.label}
                      <ListBox.ItemIndicator />
                    </ListBox.Item>
                  ))}
                </ListBox>
              </Select.Popover>
            </Select>

            <div className='flex items-end justify-center'>
              <Button
                variant='secondary'
                isIconOnly
                aria-label='Swap'
                onPress={() => {
                  const next = new URLSearchParams(searchParams);
                  if (left) next.set('right', left);
                  else next.delete('right');
                  if (right) next.set('left', right);
                  else next.delete('left');
                  setSearchParams(next, { replace: true });
                }}
                isDisabled={!left && !right}
              >
                <Shuffle size={18} />
              </Button>
            </div>

            <Select
              placeholder='Select model'
              value={right || null}
              onChange={(value) => updateParam('right', String(value || ''))}
            >
              <Label>Right</Label>
              <Select.Trigger>
                <Select.Value />
                <Select.Indicator />
              </Select.Trigger>
              <Select.Popover>
                <ListBox>
                  {options.map((o) => (
                    <ListBox.Item key={o.id} id={o.id} textValue={o.label}>
                      {o.label}
                      <ListBox.ItemIndicator />
                    </ListBox.Item>
                  ))}
                </ListBox>
              </Select.Popover>
            </Select>
          </div>

          <div className='grid grid-cols-1 gap-2 md:grid-cols-2'>
            <div className='space-y-1'>
              <div className='text-sm font-semibold'>{leftItem?.display_name || leftItem?.model_name || '—'}</div>
              <div className='text-xs text-muted font-mono'>{leftItem?.model_name || ''}</div>
              <div className='flex flex-wrap gap-1'>
                {splitTags(leftItem?.tags)
                  .slice(0, 6)
                  .map((t) => (
                    <Chip key={t} size='sm' variant='secondary'>
                      {t}
                    </Chip>
                  ))}
              </div>
            </div>
            <div className='space-y-1 md:text-right'>
              <div className='text-sm font-semibold'>{rightItem?.display_name || rightItem?.model_name || '—'}</div>
              <div className='text-xs text-muted font-mono'>{rightItem?.model_name || ''}</div>
              <div className='flex flex-wrap gap-1 md:justify-end'>
                {splitTags(rightItem?.tags)
                  .slice(0, 6)
                  .map((t) => (
                    <Chip key={t} size='sm' variant='secondary'>
                      {t}
                    </Chip>
                  ))}
              </div>
            </div>
          </div>
        </Card.Content>
      </Card>

      {loading ? (
        <div className='flex items-center gap-2 text-sm text-muted'>
          <Spinner size='sm' />
          Loading…
        </div>
      ) : null}

      {leftItem && rightItem ? (
        <>
          <Separator />

          <Card variant='secondary' className='overflow-hidden p-0'>
            <table className='app-table'>
              <thead>
                <tr>
                  <th>Metric</th>
                  <th className='text-right'>Left</th>
                  <th className='text-right'>Right</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Total Context</td>
                  <td className='text-right'>{leftItem.total_context ? leftItem.total_context : '—'}</td>
                  <td className='text-right'>{rightItem.total_context ? rightItem.total_context : '—'}</td>
                </tr>
                <tr>
                  <td>Max Output</td>
                  <td className='text-right'>{leftItem.max_output ? leftItem.max_output : '—'}</td>
                  <td className='text-right'>{rightItem.max_output ? rightItem.max_output : '—'}</td>
                </tr>
                <tr>
                  <td>Input Price</td>
                  <td className='align-top'>
                    {leftItem.quota_type === 1 ? (
                      <PriceValue value='—' align='right' />
                    ) : (
                      <PriceValue value={formatUsd(leftItem.input_price)} hint='per 1M tokens' align='right' />
                    )}
                  </td>
                  <td className='align-top'>
                    {rightItem.quota_type === 1 ? (
                      <PriceValue value='—' align='right' />
                    ) : (
                      <PriceValue value={formatUsd(rightItem.input_price)} hint='per 1M tokens' align='right' />
                    )}
                  </td>
                </tr>
                <tr>
                  <td>Input Tiers</td>
                  <td className='text-right align-top'>
                    <div className='whitespace-pre-wrap text-xs text-muted'>
                      {leftItem.quota_type === 1
                        ? '—'
                        : formatTierList(leftItem.input_token_price_multiplier_tiers, leftItem.input_price)}
                    </div>
                  </td>
                  <td className='text-right align-top'>
                    <div className='whitespace-pre-wrap text-xs text-muted'>
                      {rightItem.quota_type === 1
                        ? '—'
                        : formatTierList(rightItem.input_token_price_multiplier_tiers, rightItem.input_price)}
                    </div>
                  </td>
                </tr>
                <tr>
                  <td>Output Price</td>
                  <td className='align-top'>
                    {leftItem.quota_type === 1 ? (
                      <PriceValue value='—' align='right' />
                    ) : (
                      <PriceValue value={formatUsd(leftItem.output_price)} hint='per 1M tokens' align='right' />
                    )}
                  </td>
                  <td className='align-top'>
                    {rightItem.quota_type === 1 ? (
                      <PriceValue value='—' align='right' />
                    ) : (
                      <PriceValue value={formatUsd(rightItem.output_price)} hint='per 1M tokens' align='right' />
                    )}
                  </td>
                </tr>
                <tr>
                  <td>Output Tiers</td>
                  <td className='text-right align-top'>
                    <div className='whitespace-pre-wrap text-xs text-muted'>
                      {leftItem.quota_type === 1
                        ? '—'
                        : formatTierList(leftItem.output_token_price_multiplier_tiers, leftItem.output_price)}
                    </div>
                  </td>
                  <td className='text-right align-top'>
                    <div className='whitespace-pre-wrap text-xs text-muted'>
                      {rightItem.quota_type === 1
                        ? '—'
                        : formatTierList(rightItem.output_token_price_multiplier_tiers, rightItem.output_price)}
                    </div>
                  </td>
                </tr>
                <tr>
                  <td>Cache Read</td>
                  <td className='align-top'>
                    {leftItem.quota_type === 1 ? (
                      <PriceValue value='—' align='right' />
                    ) : (
                      <PriceValue value={formatUsd(getCacheReadPrice(leftItem))} hint='per 1M tokens' align='right' />
                    )}
                  </td>
                  <td className='align-top'>
                    {rightItem.quota_type === 1 ? (
                      <PriceValue value='—' align='right' />
                    ) : (
                      <PriceValue value={formatUsd(getCacheReadPrice(rightItem))} hint='per 1M tokens' align='right' />
                    )}
                  </td>
                </tr>
                <tr>
                  <td>Cache Write</td>
                  <td className='align-top'>
                    {leftItem.quota_type === 1 ? (
                      <PriceValue value='—' align='right' />
                    ) : (
                      <PriceValue value={formatUsd(getCacheWritePrice(leftItem))} hint='per 1M tokens' align='right' />
                    )}
                  </td>
                  <td className='align-top'>
                    {rightItem.quota_type === 1 ? (
                      <PriceValue value='—' align='right' />
                    ) : (
                      <PriceValue value={formatUsd(getCacheWritePrice(rightItem))} hint='per 1M tokens' align='right' />
                    )}
                  </td>
                </tr>
              </tbody>
            </table>
          </Card>

          <Separator />

          <Card variant='secondary' className='overflow-hidden p-0'>
            <table className='app-table'>
              <thead>
                <tr>
                  <th>Endpoint</th>
                  <th className='text-right'>Left</th>
                  <th className='text-right'>Right</th>
                </tr>
              </thead>
              <tbody>
                {endpointKeys.map((key) => {
                  const info = supportedEndpoints[key];
                  const leftOk = (leftItem.supported_endpoint_types || []).includes(key);
                  const rightOk = (rightItem.supported_endpoint_types || []).includes(key);
                  return (
                    <tr key={key}>
                      <td>
                        <div className='text-sm font-semibold'>{key}</div>
                        <div className='text-xs text-muted'>{info ? `${info.method} ${info.path}` : '—'}</div>
                      </td>
                      <td className='text-right'>
                        <div className='inline-flex justify-end'>
                          <SupportedIcon ok={leftOk} />
                        </div>
                      </td>
                      <td className='text-right'>
                        <div className='inline-flex justify-end'>
                          <SupportedIcon ok={rightOk} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>

          <Separator />

          <div className='grid grid-cols-1 gap-3 md:grid-cols-2'>
            <Card variant='secondary' className='overflow-hidden p-0'>
              <table className='app-table'>
                <thead>
                  <tr>
                    <th>Input</th>
                    <th className='text-right'>Left</th>
                    <th className='text-right'>Right</th>
                  </tr>
                </thead>
                <tbody>
                  {(leftCaps?.input || []).map((cap) => {
                    const leftOk = cap.supported;
                    const rightOk = Boolean(rightCaps?.input.find((c) => c.key === cap.key)?.supported);
                    return (
                      <tr key={cap.key}>
                        <td>{cap.label}</td>
                        <td className='text-right'>
                          <div className='inline-flex justify-end'>
                            <SupportedIcon ok={leftOk} />
                          </div>
                        </td>
                        <td className='text-right'>
                          <div className='inline-flex justify-end'>
                            <SupportedIcon ok={rightOk} />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Card>

            <Card variant='secondary' className='overflow-hidden p-0'>
              <table className='app-table'>
                <thead>
                  <tr>
                    <th>Output</th>
                    <th className='text-right'>Left</th>
                    <th className='text-right'>Right</th>
                  </tr>
                </thead>
                <tbody>
                  {(leftCaps?.output || []).map((cap) => {
                    const leftOk = cap.supported;
                    const rightOk = Boolean(rightCaps?.output.find((c) => c.key === cap.key)?.supported);
                    return (
                      <tr key={cap.key}>
                        <td>{cap.label}</td>
                        <td className='text-right'>
                          <div className='inline-flex justify-end'>
                            <SupportedIcon ok={leftOk} />
                          </div>
                        </td>
                        <td className='text-right'>
                          <div className='inline-flex justify-end'>
                            <SupportedIcon ok={rightOk} />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Card>
          </div>
        </>
      ) : (
        <Card>
          <Card.Content className='text-sm text-muted'>Select two models to start comparing.</Card.Content>
        </Card>
      )}
    </div>
  );
}
