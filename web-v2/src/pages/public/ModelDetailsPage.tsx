import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { fetchJson } from '@/api/client';
import { toast } from '@/ui/toast';
import { copyText } from '@/lib/clipboard';
import { Button, Card, Chip, Separator, Spinner } from '@/components/ui/heroui';
import { TableActionButton } from '@/components/ui/TableActionButton';
import {
  Copy,
  FileText,
  Image as ImageIcon,
  Mic,
  Scale,
  Video,
} from 'lucide-react';

type PricingItem = {
  model_name: string;
  display_name?: string;
  description?: string;
  tags?: string;
  vendor_id?: number;
  total_context?: number;
  max_output?: number;
  input_types?: string[];
  output_types?: string[];
  endpoint_support?: { name: string; uri: string }[];
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

function TierPricingTable({
  title,
  basePrice,
  tiers,
}: {
  title: string;
  basePrice: number;
  tiers?: TokenPriceTier[];
}) {
  const sorted = useMemo(() => {
    if (!tiers) return [];
    return [...tiers]
      .filter((t) => Number.isFinite(t.min) && Number.isFinite(t.multiplier))
      .sort((a, b) => a.min - b.min);
  }, [tiers]);

  const hasTiers = sorted.length > 0;

  return (
    <Card variant='secondary' className='overflow-hidden p-0'>
      <div className='px-4 py-3 text-sm font-semibold'>{title}</div>
      {hasTiers ? (
        <table className='app-table'>
          <thead>
            <tr>
              <th>Range</th>
              <th className='text-right'>Multiplier</th>
              <th className='text-right'>Effective Price</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((tier, index) => (
              <tr key={`${tier.min}:${tier.max ?? 'inf'}:${index}`}>
                <td className='font-mono text-xs'>{formatTierRange(tier)}</td>
                <td className='text-right text-sm'>×{tier.multiplier}</td>
                <td className='text-right text-sm'>{formatUsd(basePrice * tier.multiplier)} / 1M</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className='px-4 pb-4 text-sm text-muted'>Not configured</div>
      )}
      <div className='px-4 pb-3 text-xs text-muted'>Token range uses [min, max) (max is exclusive).</div>
    </Card>
  );
}

function buildModelChatUrl(modelName: string) {
  return `/playground?model=${encodeURIComponent(modelName)}`;
}

function buildModelCompareUrl(modelName: string) {
  return `/models/compare?left=${encodeURIComponent(modelName)}`;
}

type Capability = {
  key: string;
  label: string;
  icon: ReactNode;
  supported: boolean;
};

function normalizeDetailType(value: string) {
  return value.trim().toLowerCase();
}

function buildCapabilities(item: PricingItem) {
  const inputTypes = new Set((item.input_types || []).map(normalizeDetailType));
  const outputTypes = new Set((item.output_types || []).map(normalizeDetailType));

  const build = (supported: Set<string>): Capability[] => [
    { key: 'text', label: 'Text', icon: <FileText size={16} />, supported: supported.has('text') },
    { key: 'image', label: 'Image', icon: <ImageIcon size={16} />, supported: supported.has('image') },
    { key: 'video', label: 'Video', icon: <Video size={16} />, supported: supported.has('video') },
    { key: 'audio', label: 'Audio', icon: <Mic size={16} />, supported: supported.has('audio') },
  ];

  return { input: build(inputTypes), output: build(outputTypes) };
}

function MetricTableCard({
  leftLabel,
  rightLabel,
  leftValue,
  rightValue,
  leftHint,
  rightHint,
}: {
  leftLabel: string;
  rightLabel: string;
  leftValue: string;
  rightValue: string;
  leftHint?: string;
  rightHint?: string;
}) {
  return (
    <Card variant='secondary' className='overflow-hidden p-0'>
      <table className='app-table'>
        <thead>
          <tr>
            <th>{leftLabel}</th>
            <th className='w-1/2'>{rightLabel}</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <div className='text-base font-semibold'>{leftValue}</div>
              {leftHint ? <div className='mt-0.5 text-xs text-muted'>{leftHint}</div> : null}
            </td>
            <td className='w-1/2'>
              <div className='text-base font-semibold'>{rightValue}</div>
              {rightHint ? <div className='mt-0.5 text-xs text-muted'>{rightHint}</div> : null}
            </td>
          </tr>
        </tbody>
      </table>
    </Card>
  );
}

function CapabilityCard({ title, items }: { title: string; items: Capability[] }) {
  const isConfigured = items.some((cap) => cap.supported);
  return (
    <Card variant='secondary'>
      <Card.Header>
        <Card.Title>{title}</Card.Title>
      </Card.Header>
      <Card.Content>
        <div className='grid grid-cols-1 gap-2 sm:grid-cols-2'>
          {items.map((cap) => (
            <div
              key={cap.key}
              className={
                cap.supported
                  ? 'flex items-center gap-2 rounded-md border border-transparent bg-transparent px-2 py-1.5 text-sm'
                  : 'flex items-center gap-2 rounded-md border border-transparent bg-transparent px-2 py-1.5 text-sm opacity-40'
              }
            >
              <span className='text-muted'>{cap.icon}</span>
              <span>{cap.label}</span>
            </div>
          ))}
        </div>
        {!isConfigured ? (
          <div className='mt-2 text-xs text-muted'>Not configured</div>
        ) : null}
      </Card.Content>
    </Card>
  );
}

export function ModelDetailsPage() {
  const { modelName } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [item, setItem] = useState<PricingItem | null>(null);

  useEffect(() => {
    const name = modelName || '';
    if (!name) {
      setLoading(false);
      setItem(null);
      return;
    }

    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetchJson<PricingResponse>('/api/pricing', { params: { model: name } });
        const first = (res.data || [])[0] || null;
        if (!cancelled) {
          setItem(first);
        }
      } catch (err) {
        if (!cancelled) {
          toast.error(err instanceof Error ? err.message : 'Failed to load model');
          setItem(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [modelName]);

  const tags = useMemo(() => splitTags(item?.tags), [item?.tags]);
  const caps = useMemo(() => (item ? buildCapabilities(item) : { input: [], output: [] }), [item]);

  if (loading) {
    return (
      <div className='flex items-center gap-2 text-sm text-muted'>
        <Spinner size='sm' />
        Loading…
      </div>
    );
  }

  if (!item) {
    return (
      <Card>
        <Card.Header>
          <Card.Title>Model not found</Card.Title>
          <Card.Description>The model may be disabled or unavailable.</Card.Description>
        </Card.Header>
        <Card.Footer>
          <Button variant='secondary' onPress={() => navigate('/models')}>
            Back to Models
          </Button>
        </Card.Footer>
      </Card>
    );
  }

  const title = item.display_name?.trim() || item.model_name;
  const cacheRead = typeof item.cache_read_price === 'number' ? item.cache_read_price : item.input_price;
  const cacheWrite = typeof item.cache_write_price === 'number' ? item.cache_write_price : item.input_price * 1.25;
  const hasTierPricing =
    (item.input_token_price_multiplier_tiers?.length || 0) > 0 ||
    (item.output_token_price_multiplier_tiers?.length || 0) > 0;

  return (
    <div className='space-y-4 px-6 md:px-12 lg:px-20 xl:px-32'>
      <div className='flex flex-col justify-between gap-3 md:flex-row md:items-start'>
        <div className='min-w-0'>
          <div className='truncate text-2xl font-semibold md:text-3xl'>{title}</div>

          <div className='mt-2 flex items-center gap-2 text-sm text-muted'>
            <span className='font-mono'>{item.model_name}</span>
            <TableActionButton
              label='Copy model id'
              tooltip='Copy model id'
              onPress={() => {
                copyText(item.model_name).then((ok) =>
                  ok ? toast.success('Copied') : toast.error('Copy failed'),
                );
              }}
            >
              <Copy size={16} />
            </TableActionButton>
          </div>
        </div>

        <div className='flex flex-wrap gap-2 md:justify-end'>
          <Button size='lg' onPress={() => navigate(buildModelChatUrl(item.model_name))}>
            Chat
          </Button>
          <Button
            size='lg'
            variant='secondary'
            onPress={() => navigate(buildModelCompareUrl(item.model_name))}
          >
            <span className='inline-flex items-center gap-2'>
              <Scale size={18} />
              Compare
            </span>
          </Button>
        </div>
      </div>

      <Separator />

      <div className='space-y-3'>
        <div className='text-sm leading-relaxed'>{item.description || '—'}</div>
        <div className='flex flex-wrap gap-1'>
          {tags.length > 0 ? (
            tags.map((t) => (
              <Chip key={t} size='sm' variant='secondary'>
                {t}
              </Chip>
            ))
          ) : (
            <span className='text-sm text-muted'>No tags</span>
          )}
        </div>
      </div>

      <Separator />

      <div className='space-y-3'>
        <MetricTableCard
          leftLabel='Total Context'
          rightLabel='Max Output'
          leftValue={item.total_context ? String(item.total_context) : '—'}
          rightValue={item.max_output ? String(item.max_output) : '—'}
        />

        <MetricTableCard
          leftLabel='Input Price'
          rightLabel='Output Price'
          leftValue={item.quota_type === 1 ? '—' : formatUsd(item.input_price)}
          rightValue={item.quota_type === 1 ? '—' : formatUsd(item.output_price)}
          leftHint={item.quota_type === 1 ? undefined : hasTierPricing ? 'per 1M tokens (base)' : 'per 1M tokens'}
          rightHint={item.quota_type === 1 ? undefined : hasTierPricing ? 'per 1M tokens (base)' : 'per 1M tokens'}
        />

        {item.quota_type !== 1 && hasTierPricing ? (
          <div className='grid grid-cols-1 gap-3 md:grid-cols-2'>
            <TierPricingTable
              title='Input Tier Multipliers'
              basePrice={item.input_price}
              tiers={item.input_token_price_multiplier_tiers}
            />
            <TierPricingTable
              title='Output Tier Multipliers'
              basePrice={item.output_price}
              tiers={item.output_token_price_multiplier_tiers}
            />
          </div>
        ) : null}

        <MetricTableCard
          leftLabel='Cache Read'
          rightLabel='Cache Write'
          leftValue={item.quota_type === 1 ? '—' : formatUsd(cacheRead)}
          rightValue={item.quota_type === 1 ? '—' : formatUsd(cacheWrite)}
          leftHint={item.quota_type === 1 ? undefined : 'per 1M tokens'}
          rightHint={item.quota_type === 1 ? undefined : 'per 1M tokens'}
        />
      </div>

      <Separator />

      <div className='space-y-3'>
        <div className='text-sm font-semibold'>Endpoints</div>
        {item.endpoint_support && item.endpoint_support.length > 0 ? (
          <div className='grid grid-cols-1 gap-3 md:grid-cols-2'>
            {item.endpoint_support.map((ep) => (
              <Card key={`${ep.name}:${ep.uri}`} variant='secondary'>
                <Card.Content className='space-y-1'>
                  <div className='text-sm font-semibold'>{ep.name}</div>
                  <div className='text-xs text-muted'>{ep.uri || '—'}</div>
                </Card.Content>
              </Card>
            ))}
          </div>
        ) : (
          <div className='text-sm text-muted'>Not configured</div>
        )}
      </div>

      <Separator />

      <div className='grid grid-cols-1 gap-3 md:grid-cols-2'>
        <CapabilityCard title='Input' items={caps.input} />
        <CapabilityCard title='Output' items={caps.output} />
      </div>
    </div>
  );
}
