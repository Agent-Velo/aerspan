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
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button, Card, Divider, Select, Spin, Tag } from '@douyinfe/semi-ui';
import { Check, Shuffle, X } from 'lucide-react';
import { API, showError } from '../../helpers';

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

function getCacheReadPrice(item) {
  return typeof item.cache_read_price === 'number' ? item.cache_read_price : item.input_price;
}

function getCacheWritePrice(item) {
  return typeof item.cache_write_price === 'number' ? item.cache_write_price : item.input_price * 1.25;
}

function buildCapabilitySets(item) {
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
        endpoints.has('openai') ||
        endpoints.has('openai-response') ||
        endpoints.has('anthropic') ||
        endpoints.has('gemini'),
    },
    { key: 'image', label: 'Image', supported: endpoints.has('image-generation') },
    { key: 'audio', label: 'Audio', supported: typeof item.audio_output_price === 'number' },
    { key: 'video', label: 'Video', supported: endpoints.has('openai-video') },
    { key: 'embedding', label: 'Embedding', supported: endpoints.has('embeddings') },
  ];
  return { input, output };
}

function SupportedIcon({ ok }) {
  return ok ? (
    <Check size={16} className='text-emerald-600' />
  ) : (
    <X size={16} className='text-gray-400' />
  );
}

function PriceValue({ value, hint }) {
  return (
    <div className='text-right'>
      <div className='text-sm font-semibold'>{value}</div>
      {hint ? <div className='mt-0.5 text-xs text-gray-500'>{hint}</div> : null}
    </div>
  );
}

export default function PricingModelComparePage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const left = searchParams.get('left') || '';
  const right = searchParams.get('right') || '';

  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [supportedEndpoints, setSupportedEndpoints] = useState({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await API.get('/api/pricing');
        if (!cancelled) {
          setItems(res.data?.data || []);
          setSupportedEndpoints(res.data?.supported_endpoint || {});
        }
      } catch (err) {
        if (!cancelled) showError(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const itemMap = useMemo(() => {
    const map = new Map();
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
      .map((m) => ({ value: m.model_name, label: m.display_name?.trim() || m.model_name }));
  }, [items]);

  const updateParam = (key, value) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    setSearchParams(next, { replace: true });
  };

  return (
    <div className='mt-[60px] px-4 pb-10'>
      <div className='space-y-4'>
        <div className='flex flex-col justify-between gap-3 md:flex-row md:items-start'>
          <div>
            <div className='text-2xl font-semibold'>Compare</div>
            <div className='mt-1 text-sm text-gray-500'>Pick two models to compare pricing and capabilities.</div>
          </div>
          <div className='flex flex-wrap gap-2'>
            <Button theme='outline' type='primary' onClick={() => navigate('/pricing')}>
              Back
            </Button>
          </div>
        </div>

        <Card className='!rounded-2xl'>
          <div className='space-y-3 p-4'>
            <div className='grid grid-cols-1 gap-3 md:grid-cols-[1fr_auto_1fr] md:items-end'>
              <div className='space-y-1'>
                <div className='text-xs font-semibold text-gray-500'>Left</div>
                <Select
                  placeholder='Select model'
                  value={left || undefined}
                  optionList={options}
                  filter
                  onChange={(value) => updateParam('left', String(value || ''))}
                />
              </div>

              <div className='flex items-end justify-center'>
                <Button
                  theme='outline'
                  type='primary'
                  icon={<Shuffle size={18} />}
                  aria-label='Swap'
                  onClick={() => {
                    const next = new URLSearchParams(searchParams);
                    if (left) next.set('right', left);
                    else next.delete('right');
                    if (right) next.set('left', right);
                    else next.delete('left');
                    setSearchParams(next, { replace: true });
                  }}
                  disabled={!left && !right}
                />
              </div>

              <div className='space-y-1'>
                <div className='text-xs font-semibold text-gray-500'>Right</div>
                <Select
                  placeholder='Select model'
                  value={right || undefined}
                  optionList={options}
                  filter
                  onChange={(value) => updateParam('right', String(value || ''))}
                />
              </div>
            </div>

            <div className='grid grid-cols-1 gap-2 md:grid-cols-2'>
              <div className='space-y-1'>
                <div className='text-sm font-semibold'>
                  {leftItem?.display_name || leftItem?.model_name || '—'}
                </div>
                <div className='text-xs text-gray-500 font-mono'>{leftItem?.model_name || ''}</div>
                <div className='flex flex-wrap gap-1'>
                  {splitTags(leftItem?.tags)
                    .slice(0, 6)
                    .map((t) => (
                      <Tag key={t} size='small' shape='circle' color='white'>
                        {t}
                      </Tag>
                    ))}
                </div>
              </div>
              <div className='space-y-1 md:text-right'>
                <div className='text-sm font-semibold'>
                  {rightItem?.display_name || rightItem?.model_name || '—'}
                </div>
                <div className='text-xs text-gray-500 font-mono'>{rightItem?.model_name || ''}</div>
                <div className='flex flex-wrap gap-1 md:justify-end'>
                  {splitTags(rightItem?.tags)
                    .slice(0, 6)
                    .map((t) => (
                      <Tag key={t} size='small' shape='circle' color='white'>
                        {t}
                      </Tag>
                    ))}
                </div>
              </div>
            </div>
          </div>
        </Card>

        {loading ? (
          <div className='flex items-center gap-2 text-sm text-gray-500'>
            <Spin size='small' />
            Loading…
          </div>
        ) : null}

        {leftItem && rightItem ? (
          <>
            <Divider />

            <Card className='overflow-hidden p-0'>
              <table className='w-full border-collapse text-sm'>
                <thead>
                  <tr className='border-b border-black/10'>
                    <th className='px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500'>
                      Metric
                    </th>
                    <th className='px-4 py-3 text-right text-xs font-semibold uppercase text-gray-500'>
                      Left
                    </th>
                    <th className='px-4 py-3 text-right text-xs font-semibold uppercase text-gray-500'>
                      Right
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr className='border-b border-black/10'>
                    <td className='px-4 py-3'>Total Context</td>
                    <td className='px-4 py-3 text-right'>{leftItem.total_context ? leftItem.total_context : '—'}</td>
                    <td className='px-4 py-3 text-right'>{rightItem.total_context ? rightItem.total_context : '—'}</td>
                  </tr>
                  <tr className='border-b border-black/10'>
                    <td className='px-4 py-3'>Max Output</td>
                    <td className='px-4 py-3 text-right'>{leftItem.max_output ? leftItem.max_output : '—'}</td>
                    <td className='px-4 py-3 text-right'>{rightItem.max_output ? rightItem.max_output : '—'}</td>
                  </tr>
                  <tr className='border-b border-black/10'>
                    <td className='px-4 py-3'>Input Price</td>
                    <td className='px-4 py-3 align-top'>
                      {leftItem.quota_type === 1 ? (
                        <PriceValue value='—' />
                      ) : (
                        <PriceValue value={formatUsd(leftItem.input_price)} hint='per 1M tokens' />
                      )}
                    </td>
                    <td className='px-4 py-3 align-top'>
                      {rightItem.quota_type === 1 ? (
                        <PriceValue value='—' />
                      ) : (
                        <PriceValue value={formatUsd(rightItem.input_price)} hint='per 1M tokens' />
                      )}
                    </td>
                  </tr>
                  <tr className='border-b border-black/10'>
                    <td className='px-4 py-3'>Output Price</td>
                    <td className='px-4 py-3 align-top'>
                      {leftItem.quota_type === 1 ? (
                        <PriceValue value='—' />
                      ) : (
                        <PriceValue value={formatUsd(leftItem.output_price)} hint='per 1M tokens' />
                      )}
                    </td>
                    <td className='px-4 py-3 align-top'>
                      {rightItem.quota_type === 1 ? (
                        <PriceValue value='—' />
                      ) : (
                        <PriceValue value={formatUsd(rightItem.output_price)} hint='per 1M tokens' />
                      )}
                    </td>
                  </tr>
                  <tr className='border-b border-black/10'>
                    <td className='px-4 py-3'>Cache Read</td>
                    <td className='px-4 py-3 align-top'>
                      {leftItem.quota_type === 1 ? (
                        <PriceValue value='—' />
                      ) : (
                        <PriceValue value={formatUsd(getCacheReadPrice(leftItem))} hint='per 1M tokens' />
                      )}
                    </td>
                    <td className='px-4 py-3 align-top'>
                      {rightItem.quota_type === 1 ? (
                        <PriceValue value='—' />
                      ) : (
                        <PriceValue value={formatUsd(getCacheReadPrice(rightItem))} hint='per 1M tokens' />
                      )}
                    </td>
                  </tr>
                  <tr>
                    <td className='px-4 py-3'>Cache Write</td>
                    <td className='px-4 py-3 align-top'>
                      {leftItem.quota_type === 1 ? (
                        <PriceValue value='—' />
                      ) : (
                        <PriceValue value={formatUsd(getCacheWritePrice(leftItem))} hint='per 1M tokens' />
                      )}
                    </td>
                    <td className='px-4 py-3 align-top'>
                      {rightItem.quota_type === 1 ? (
                        <PriceValue value='—' />
                      ) : (
                        <PriceValue value={formatUsd(getCacheWritePrice(rightItem))} hint='per 1M tokens' />
                      )}
                    </td>
                  </tr>
                </tbody>
              </table>
            </Card>

            <Divider />

            <Card className='overflow-hidden p-0'>
              <table className='w-full border-collapse text-sm'>
                <thead>
                  <tr className='border-b border-black/10'>
                    <th className='px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500'>
                      Endpoint
                    </th>
                    <th className='px-4 py-3 text-right text-xs font-semibold uppercase text-gray-500'>
                      Left
                    </th>
                    <th className='px-4 py-3 text-right text-xs font-semibold uppercase text-gray-500'>
                      Right
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {endpointKeys.map((key) => {
                    const info = supportedEndpoints[key];
                    const leftOk = (leftItem.supported_endpoint_types || []).includes(key);
                    const rightOk = (rightItem.supported_endpoint_types || []).includes(key);
                    return (
                      <tr key={key} className='border-b border-black/10 last:border-b-0'>
                        <td className='px-4 py-3'>
                          <div className='text-sm font-semibold'>{key}</div>
                          <div className='text-xs text-gray-500'>
                            {info ? `${info.method} ${info.path}` : '—'}
                          </div>
                        </td>
                        <td className='px-4 py-3 text-right'>
                          <span className='inline-flex justify-end'>
                            <SupportedIcon ok={leftOk} />
                          </span>
                        </td>
                        <td className='px-4 py-3 text-right'>
                          <span className='inline-flex justify-end'>
                            <SupportedIcon ok={rightOk} />
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Card>

            <Divider />

            <div className='grid grid-cols-1 gap-3 md:grid-cols-2'>
              <Card className='!rounded-2xl overflow-hidden p-0'>
                <table className='w-full border-collapse text-sm'>
                  <thead>
                    <tr className='border-b border-black/10'>
                      <th className='px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500'>Input</th>
                      <th className='px-4 py-3 text-right text-xs font-semibold uppercase text-gray-500'>Left</th>
                      <th className='px-4 py-3 text-right text-xs font-semibold uppercase text-gray-500'>Right</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(leftCaps?.input || []).map((cap) => {
                      const leftOk = cap.supported;
                      const rightOk = Boolean(rightCaps?.input.find((c) => c.key === cap.key)?.supported);
                      return (
                        <tr key={cap.key} className='border-b border-black/10 last:border-b-0'>
                          <td className='px-4 py-3'>{cap.label}</td>
                          <td className='px-4 py-3 text-right'>
                            <span className='inline-flex justify-end'>
                              <SupportedIcon ok={leftOk} />
                            </span>
                          </td>
                          <td className='px-4 py-3 text-right'>
                            <span className='inline-flex justify-end'>
                              <SupportedIcon ok={rightOk} />
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </Card>

              <Card className='!rounded-2xl overflow-hidden p-0'>
                <table className='w-full border-collapse text-sm'>
                  <thead>
                    <tr className='border-b border-black/10'>
                      <th className='px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500'>Output</th>
                      <th className='px-4 py-3 text-right text-xs font-semibold uppercase text-gray-500'>Left</th>
                      <th className='px-4 py-3 text-right text-xs font-semibold uppercase text-gray-500'>Right</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(leftCaps?.output || []).map((cap) => {
                      const leftOk = cap.supported;
                      const rightOk = Boolean(rightCaps?.output.find((c) => c.key === cap.key)?.supported);
                      return (
                        <tr key={cap.key} className='border-b border-black/10 last:border-b-0'>
                          <td className='px-4 py-3'>{cap.label}</td>
                          <td className='px-4 py-3 text-right'>
                            <span className='inline-flex justify-end'>
                              <SupportedIcon ok={leftOk} />
                            </span>
                          </td>
                          <td className='px-4 py-3 text-right'>
                            <span className='inline-flex justify-end'>
                              <SupportedIcon ok={rightOk} />
                            </span>
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
          <Card className='!rounded-2xl'>
            <div className='p-4 text-sm text-gray-500'>Select two models to start comparing.</div>
          </Card>
        )}
      </div>
    </div>
  );
}
