/*
Copyright (C) 2025 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/

import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, Card, Divider, Spin, Tag } from '@douyinfe/semi-ui';
import {
  Binary,
  Copy,
  FileText,
  Image as ImageIcon,
  Mic,
  Scale,
  Video,
} from 'lucide-react';
import { API, copy, showError, showSuccess } from '../../helpers';

function splitTags(value) {
  return (value || '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
}

function formatUsd(value) {
  if (!Number.isFinite(value)) return '-';
  const rounded = Math.round(value * 1000000) / 1000000;
  return `$${rounded}`;
}

function normalizeEndpointOrder(all) {
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
  const inKnown = [];
  const others = [];
  for (const name of all) {
    if (knownSet.has(name)) inKnown.push(name);
    else others.push(name);
  }
  inKnown.sort((a, b) => known.indexOf(a) - known.indexOf(b));
  others.sort((a, b) => a.localeCompare(b));
  return [...inKnown, ...others];
}

function buildModelChatUrl(modelName) {
  return `/console/playground?model=${encodeURIComponent(modelName)}`;
}

function buildModelCompareUrl(modelName) {
  return `/pricing/compare?left=${encodeURIComponent(modelName)}`;
}

function getCacheReadPrice(item) {
  return typeof item.cache_read_price === 'number' ? item.cache_read_price : item.input_price;
}

function getCacheWritePrice(item) {
  return typeof item.cache_write_price === 'number' ? item.cache_write_price : item.input_price * 1.25;
}

function MetricTableCard({
  leftLabel,
  rightLabel,
  leftValue,
  rightValue,
  leftHint,
  rightHint,
}) {
  return (
    <Card className='!rounded-2xl overflow-hidden p-0'>
      <table className='w-full border-collapse text-sm'>
        <thead>
          <tr className='border-b border-black/10'>
            <th className='px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500'>
              {leftLabel}
            </th>
            <th className='px-4 py-3 text-right text-xs font-semibold uppercase text-gray-500'>
              {rightLabel}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className='px-4 py-3'>
              <div className='text-base font-semibold'>{leftValue}</div>
              {leftHint ? (
                <div className='mt-0.5 text-xs text-gray-500'>{leftHint}</div>
              ) : null}
            </td>
            <td className='px-4 py-3 text-right'>
              <div className='text-base font-semibold'>{rightValue}</div>
              {rightHint ? (
                <div className='mt-0.5 text-xs text-gray-500'>{rightHint}</div>
              ) : null}
            </td>
          </tr>
        </tbody>
      </table>
    </Card>
  );
}

function CapabilityCard({ title, items }) {
  return (
    <Card className='!rounded-2xl'>
      <div className='px-4 pt-4 text-sm font-semibold'>{title}</div>
      <div className='p-2'>
        <div className='grid grid-cols-1 gap-2 sm:grid-cols-2'>
          {items.map((cap) => (
            <div
              key={cap.key}
              className={
                cap.supported
                  ? 'flex items-center gap-2 rounded-md px-2 py-1.5 text-sm'
                  : 'flex items-center gap-2 rounded-md px-2 py-1.5 text-sm opacity-40'
              }
            >
              <span className='text-gray-500'>{cap.icon}</span>
              <span>{cap.label}</span>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

function buildCapabilities(item) {
  const endpoints = new Set(item.supported_endpoint_types || []);
  const input = [
    { key: 'text', label: 'Text', icon: <FileText size={16} />, supported: true },
    {
      key: 'image',
      label: 'Image',
      icon: <ImageIcon size={16} />,
      supported: typeof item.image_input_price === 'number',
    },
    {
      key: 'audio',
      label: 'Audio',
      icon: <Mic size={16} />,
      supported: typeof item.audio_input_price === 'number',
    },
  ];
  const output = [
    {
      key: 'text',
      label: 'Text',
      icon: <FileText size={16} />,
      supported:
        endpoints.has('openai') ||
        endpoints.has('openai-response') ||
        endpoints.has('anthropic') ||
        endpoints.has('gemini'),
    },
    {
      key: 'image',
      label: 'Image',
      icon: <ImageIcon size={16} />,
      supported: endpoints.has('image-generation'),
    },
    {
      key: 'audio',
      label: 'Audio',
      icon: <Mic size={16} />,
      supported: typeof item.audio_output_price === 'number',
    },
    {
      key: 'video',
      label: 'Video',
      icon: <Video size={16} />,
      supported: endpoints.has('openai-video'),
    },
    {
      key: 'embedding',
      label: 'Embedding',
      icon: <Binary size={16} />,
      supported: endpoints.has('embeddings'),
    },
  ];
  return { input, output };
}

export default function PricingModelDetailsPage() {
  const { modelName } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [item, setItem] = useState(null);
  const [supportedEndpoints, setSupportedEndpoints] = useState({});

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
        const res = await API.get('/api/pricing', { params: { model: name } });
        const first = (res.data?.data || [])[0] || null;
        if (!cancelled) {
          setItem(first);
          setSupportedEndpoints(res.data?.supported_endpoint || {});
        }
      } catch (err) {
        if (!cancelled) {
          showError(err);
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
  const endpointKeys = useMemo(
    () => normalizeEndpointOrder(Object.keys(supportedEndpoints || {})),
    [supportedEndpoints],
  );
  const caps = useMemo(() => (item ? buildCapabilities(item) : { input: [], output: [] }), [item]);

  if (loading) {
    return (
      <div className='mt-[60px] px-4'>
        <div className='flex items-center gap-2 text-sm text-gray-500'>
          <Spin size='small' />
          Loading…
        </div>
      </div>
    );
  }

  if (!item) {
    return (
      <div className='mt-[60px] px-4'>
        <Card className='!rounded-2xl'>
          <div className='p-4'>
            <div className='text-lg font-semibold'>Model not found</div>
            <div className='mt-1 text-sm text-gray-500'>The model may be disabled or unavailable.</div>
            <div className='mt-4'>
              <Button theme='outline' type='primary' onClick={() => navigate('/pricing')}>
                Back to Pricing
              </Button>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  const title = item.display_name?.trim() || item.model_name;

  return (
    <div className='mt-[60px] px-4 pb-10'>
      <div className='space-y-4'>
        <div className='flex flex-col justify-between gap-3 md:flex-row md:items-start'>
          <div className='min-w-0'>
            <div className='truncate text-2xl font-semibold md:text-3xl'>{title}</div>
            <div className='mt-2 flex items-center gap-2 text-sm text-gray-500'>
              <span className='font-mono'>{item.model_name}</span>
              <Button
                size='small'
                theme='outline'
                type='tertiary'
                icon={<Copy size={14} />}
                onClick={async (e) => {
                  e?.stopPropagation?.();
                  if (await copy(item.model_name)) {
                    showSuccess('Copied');
                  }
                }}
              />
            </div>
          </div>

          <div className='flex flex-wrap gap-2 md:justify-end'>
            <Button size='large' theme='solid' type='primary' onClick={() => navigate(buildModelChatUrl(item.model_name))}>
              Chat
            </Button>
            <Button
              size='large'
              theme='outline'
              type='primary'
              icon={<Scale size={16} />}
              onClick={() => navigate(buildModelCompareUrl(item.model_name))}
            >
              Compare
            </Button>
          </div>
        </div>

        <Divider />

        <div className='space-y-3'>
          <div className='text-sm leading-relaxed'>{item.description || '—'}</div>
          <div className='flex flex-wrap gap-1'>
            {tags.length > 0 ? (
              tags.map((t) => (
                <Tag key={t} size='small' shape='circle' color='white'>
                  {t}
                </Tag>
              ))
            ) : (
              <span className='text-sm text-gray-500'>No tags</span>
            )}
          </div>
        </div>

        <Divider />

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
            leftHint={item.quota_type === 1 ? undefined : 'per 1M tokens'}
            rightHint={item.quota_type === 1 ? undefined : 'per 1M tokens'}
          />

          <MetricTableCard
            leftLabel='Cache Read'
            rightLabel='Cache Write'
            leftValue={item.quota_type === 1 ? '—' : formatUsd(getCacheReadPrice(item))}
            rightValue={item.quota_type === 1 ? '—' : formatUsd(getCacheWritePrice(item))}
            leftHint={item.quota_type === 1 ? undefined : 'per 1M tokens'}
            rightHint={item.quota_type === 1 ? undefined : 'per 1M tokens'}
          />
        </div>

        <Divider />

        <div className='space-y-3'>
          <div className='text-sm font-semibold'>Endpoints</div>
          <div className='grid grid-cols-1 gap-3 md:grid-cols-2'>
            {endpointKeys.map((key) => {
              const info = supportedEndpoints[key];
              const isSupported = (item.supported_endpoint_types || []).includes(key);
              return (
                <Card key={key} className={`!rounded-2xl ${isSupported ? '' : 'opacity-45'}`}>
                  <div className='p-4 space-y-1'>
                    <div className='text-sm font-semibold'>{key}</div>
                    <div className='text-xs text-gray-500'>{info ? `${info.method} ${info.path}` : '—'}</div>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>

        <Divider />

        <div className='grid grid-cols-1 gap-3 md:grid-cols-2'>
          <CapabilityCard title='Input' items={caps.input} />
          <CapabilityCard title='Output' items={caps.output} />
        </div>
      </div>
    </div>
  );
}
