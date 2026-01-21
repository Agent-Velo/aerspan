import { useEffect, useMemo, useState } from 'react';
import { BarChart, BarList } from '@tremor/react';
import { Copy } from 'lucide-react';
import { fetchJson } from '@/api/client';
import type { ApiResponse } from '@/api/types';
import { useStatus } from '@/stores/status/StatusStore';
import { useAuth } from '@/stores/auth/AuthStore';
import { MarkdownRenderer } from '@/components/MarkdownRenderer';
import { copyText } from '@/lib/clipboard';
import { toast } from '@/ui/toast';
import { clampRangeToMaxSeconds, fromDateTimeLocalToSeconds, toDateTimeLocalValueFromSeconds } from '@/lib/time';
import { Accordion, Button, Card, Chip, Input, Label, Spinner, TextField } from '@/components/ui/heroui';
import { TableActionButton } from '@/components/ui/TableActionButton';

type QuotaData = {
  created_at: number;
  model_name: string;
  quota: number;
  count: number;
  token_used?: number;
};

type UptimeCategory = {
  categoryName: string;
  monitors: Array<{ name: string; uptime: number; status: string; group?: string }>;
};

type ApiInfoItem = {
  url: string;
  route: string;
  description: string;
  color: string;
};

type AnnouncementItem = {
  content: string;
  publishDate: string;
  type?: string;
  extra?: string;
};

type FaqItem = {
  question: string;
  answer: string;
};

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function getDefaultRangeSeconds(): { start: number; end: number } {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const start = Math.floor(todayStart.getTime() / 1000);
  const end = Math.floor(Date.now() / 1000) + 3600;
  return { start, end };
}

function formatCompactNumber(value: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(value);
}

function quotaToDollars(quota: number, quotaPerUnit: number): number {
  const normalizedQuota = Number(quota);
  const normalizedQuotaPerUnit = Number(quotaPerUnit);

  const safeQuota = Number.isFinite(normalizedQuota) ? normalizedQuota : 0;
  const safeQuotaPerUnit =
    Number.isFinite(normalizedQuotaPerUnit) && normalizedQuotaPerUnit > 0 ? normalizedQuotaPerUnit : 500000;

  return safeQuota / safeQuotaPerUnit;
}

function formatDollars(amount: number): string {
  const safeAmount = Number.isFinite(amount) ? amount : 0;
  const absAmount = Math.abs(safeAmount);
  const maximumFractionDigits = absAmount > 0 && absAmount < 1 ? 6 : 2;
  const formatted = new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits,
  }).format(safeAmount);
  return `$${formatted}`;
}

function joinUrl(baseUrl: string, route: string): string {
  const safeBase = String(baseUrl || '').trim();
  const safeRoute = String(route || '').trim();
  if (!safeBase) return safeRoute;
  if (!safeRoute) return safeBase;
  if (safeBase.endsWith('/') && safeRoute.startsWith('/')) return safeBase + safeRoute.slice(1);
  if (!safeBase.endsWith('/') && !safeRoute.startsWith('/')) return `${safeBase}/${safeRoute}`;
  return safeBase + safeRoute;
}

function getAnnouncementKey(item: AnnouncementItem, index: number): string {
  return `${item?.publishDate || ''}-${String(item?.content || '').slice(0, 30)}-${index}`;
}

function formatPublishDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || '—';
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function apiInfoColorDotClass(color?: string): string {
  const mapping: Record<string, string> = {
    blue: 'bg-blue-500',
    green: 'bg-green-500',
    cyan: 'bg-cyan-500',
    purple: 'bg-purple-500',
    pink: 'bg-pink-500',
    red: 'bg-red-500',
    orange: 'bg-orange-500',
    amber: 'bg-amber-500',
    yellow: 'bg-yellow-500',
    lime: 'bg-lime-500',
    'light-green': 'bg-lime-400',
    teal: 'bg-teal-500',
    'light-blue': 'bg-sky-500',
    indigo: 'bg-indigo-500',
    violet: 'bg-violet-500',
    grey: 'bg-zinc-500',
  };
  return mapping[String(color || '').toLowerCase()] || 'bg-zinc-500';
}

function announcementTypeChip(
  type?: string,
): { label: string; color: 'default' | 'accent' | 'success' | 'warning' | 'danger' } {
  const normalized = String(type || 'default').toLowerCase();
  switch (normalized) {
    case 'success':
      return { label: 'Success', color: 'success' };
    case 'warning':
      return { label: 'Warning', color: 'warning' };
    case 'error':
      return { label: 'Error', color: 'danger' };
    case 'ongoing':
      return { label: 'Ongoing', color: 'accent' };
    default:
      return { label: 'Info', color: 'default' };
  }
}

export function DashboardPage() {
  const { status } = useStatus();
  const { user, refreshSelf } = useAuth();

  const quotaPerUnit = status?.quota_per_unit || 500000;

  const defaultRange = useMemo(() => getDefaultRangeSeconds(), []);

  const [start, setStart] = useState(() => toDateTimeLocalValueFromSeconds(defaultRange.start));
  const [end, setEnd] = useState(() => toDateTimeLocalValueFromSeconds(defaultRange.end));

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<QuotaData[]>([]);
  const [uptime, setUptime] = useState<UptimeCategory[]>([]);

  const [stats, setStats] = useState<{ quota: number; count: number; tokenUsed: number }>({
    quota: 0,
    count: 0,
    tokenUsed: 0,
  });

  const load = async () => {
    const startSec = fromDateTimeLocalToSeconds(start);
    const endSec = fromDateTimeLocalToSeconds(end);
    if (!startSec || !endSec || endSec <= startSec) {
      toast.error('Invalid time range.');
      return;
    }

    const clamped = clampRangeToMaxSeconds(startSec, endSec, 2592000);
    if (clamped.start !== startSec) {
      setStart(toDateTimeLocalValueFromSeconds(clamped.start));
      setEnd(toDateTimeLocalValueFromSeconds(clamped.end));
      toast.info("Time range can't exceed 1 month. Adjusted automatically.");
    }

    setLoading(true);
    try {
      await refreshSelf();
      const res = await fetchJson<ApiResponse<QuotaData[]>>('/api/data/self', {
        params: { start_timestamp: clamped.start, end_timestamp: clamped.end },
      });
      setData(res.data || []);

      const quotaSum = (res.data || []).reduce((acc, row) => acc + (row.quota || 0), 0);
      const countSum = (res.data || []).reduce((acc, row) => acc + (row.count || 0), 0);
      const tokenSum = (res.data || []).reduce((acc, row) => acc + (row.token_used || 0), 0);
      setStats({ quota: quotaSum, count: countSum, tokenUsed: tokenSum });

      if (status?.uptime_kuma_enabled) {
        const uptimeRes = await fetchJson<ApiResponse<UptimeCategory[]>>('/api/uptime/status', {
          skipErrorHandler: true,
        });
        setUptime(uptimeRes.data || []);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const lineSeries = useMemo(() => {
    const map = new Map<number, { time: number; quota: number; count: number }>();
    for (const row of data) {
      const t = row.created_at;
      const cur = map.get(t) || { time: t, quota: 0, count: 0 };
      cur.quota += row.quota || 0;
      cur.count += row.count || 0;
      map.set(t, cur);
    }
    return Array.from(map.values()).sort((a, b) => a.time - b.time);
  }, [data]);

  const topModels = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of data) {
      map.set(row.model_name, (map.get(row.model_name) || 0) + (row.quota || 0));
    }
    return Array.from(map.entries())
      .map(([model, quota]) => ({ model, quota }))
      .sort((a, b) => b.quota - a.quota)
      .slice(0, 10);
  }, [data]);

  const trendChartData = useMemo(() => {
    const startSec = fromDateTimeLocalToSeconds(start);
    const endSec = fromDateTimeLocalToSeconds(end);
    const duration = endSec && startSec ? endSec - startSec : 0;

    const formatter = new Intl.DateTimeFormat(undefined, {
      year: duration > 86400 * 30 ? 'numeric' : undefined,
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
    });

    return lineSeries.map((row) => ({
      time: formatter.format(new Date(row.time * 1000)),
      Quota: quotaToDollars(row.quota, quotaPerUnit),
    }));
  }, [end, lineSeries, quotaPerUnit, start]);

  const displayName = (user?.display_name || user?.username || '').trim();

  const apiInfoItems = (Array.isArray(status?.api_info) ? status?.api_info : []) as ApiInfoItem[];
  const announcements = (Array.isArray(status?.announcements) ? status?.announcements : []) as AnnouncementItem[];
  const faqItems = (Array.isArray(status?.faq) ? status?.faq : []) as FaqItem[];

  return (
    <div className='space-y-4'>
      <div className='flex flex-col justify-between gap-3 md:flex-row md:items-end'>
        <div>
          <div className='text-lg font-semibold'>{getGreeting()}{displayName ? `, ${displayName}` : ''}</div>
          <div className='mt-1 text-sm text-muted'>Refresh your usage stats and charts.</div>
        </div>
        <div className='flex flex-wrap gap-2'>
          <TextField name='start' type='datetime-local' onChange={setStart}>
            <Label>Start</Label>
            <Input value={start} />
          </TextField>
          <TextField name='end' type='datetime-local' onChange={setEnd}>
            <Label>End</Label>
            <Input value={end} />
          </TextField>
          <Button className='self-end' onPress={() => load()} isDisabled={loading}>
            Refresh
          </Button>
        </div>
      </div>

      <div className='grid grid-cols-1 gap-3 md:grid-cols-3'>
        <Card>
          <Card.Content>
            <div className='text-xs font-semibold uppercase text-muted'>Quota used</div>
            <div className='mt-2 text-2xl font-semibold'>{formatDollars(quotaToDollars(stats.quota, quotaPerUnit))}</div>
          </Card.Content>
        </Card>
        <Card>
          <Card.Content>
            <div className='text-xs font-semibold uppercase text-muted'>Requests</div>
            <div className='mt-2 text-2xl font-semibold'>{formatCompactNumber(stats.count)}</div>
          </Card.Content>
        </Card>
        <Card>
          <Card.Content>
            <div className='text-xs font-semibold uppercase text-muted'>Tokens</div>
            <div className='mt-2 text-2xl font-semibold'>{formatCompactNumber(stats.tokenUsed)}</div>
          </Card.Content>
        </Card>
      </div>

      <div className='grid grid-cols-1 gap-3 lg:grid-cols-2'>
        <Card>
          <Card.Header>
            <Card.Title>Trend</Card.Title>
          </Card.Header>
          <Card.Content>
            <div className='h-[320px]'>
              {loading ? (
                <div className='flex h-full items-center justify-center gap-2 text-sm text-muted'>
                  <Spinner size='sm' />
                  Loading…
                </div>
              ) : trendChartData.length === 0 ? (
                <div className='flex h-full items-center justify-center text-sm text-muted'>
                  No usage data for this time range.
                </div>
              ) : (
                <BarChart
                  className='h-full [&_.recharts-bar-rectangle_path]:!fill-blue-500 [&_.recharts-rectangle_path]:!fill-blue-500 [&_.recharts-text]:!fill-[var(--foreground)] [&_.recharts-cartesian-grid_line]:!stroke-[color-mix(in_oklab,var(--foreground)_10%,transparent)] [&_.recharts-tooltip-wrapper]:!outline-none [&_.recharts-default-tooltip]:!bg-[var(--background)] [&_.recharts-default-tooltip]:!border [&_.recharts-default-tooltip]:!border-[color-mix(in_oklab,var(--foreground)_20%,transparent)] [&_.recharts-default-tooltip]:!shadow-lg [&_.recharts-tooltip-item]:!text-[var(--foreground)]'
                  data={trendChartData}
                  index='time'
                  categories={['Quota']}
                  colors={['blue']}
                  valueFormatter={formatDollars}
                  showLegend={false}
                  showXAxis
                  showYAxis
                  yAxisWidth={65}
                />
              )}
            </div>
          </Card.Content>
        </Card>
        <Card>
          <Card.Header>
            <Card.Title>Top models</Card.Title>
          </Card.Header>
          <Card.Content>
            <div className='h-[320px]'>
              {loading ? (
                <div className='flex h-full items-center justify-center gap-2 text-sm text-muted'>
                  <Spinner size='sm' />
                  Loading…
                </div>
              ) : topModels.length === 0 ? (
                <div className='flex h-full items-center justify-center text-sm text-muted'>
                  No model usage data for this time range.
                </div>
              ) : (
                <div className='h-full overflow-auto pr-2'>
                  <BarList
                    data={topModels.map((item) => ({
                      name: item.model,
                      value: quotaToDollars(item.quota, quotaPerUnit),
                    }))}
                    valueFormatter={formatDollars}
                    color='blue'
                    sortOrder='none'
                  />
                </div>
              )}
            </div>
          </Card.Content>
        </Card>
      </div>

      {status?.api_info_enabled ? (
        <Card>
          <Card.Header>
            <Card.Title>API info</Card.Title>
          </Card.Header>
          <Card.Content>
            {apiInfoItems.length === 0 ? (
              <div className='text-sm text-muted'>No API info configured.</div>
            ) : (
              <Card className='overflow-hidden p-0' variant='secondary'>
                <div className='max-h-80 overflow-auto'>
                  <table className='app-table'>
                    <thead>
                      <tr>
                        <th>Route</th>
                        <th>Description</th>
                        <th>Base URL</th>
                        <th className='w-0'>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {apiInfoItems.map((item, idx) => {
                        const fullUrl = joinUrl(item.url, item.route);
                        return (
                          <tr key={`${item.url}-${item.route}-${idx}`}>
                            <td>
                              <div className='flex items-center gap-2'>
                                <span
                                  className={`h-2 w-2 shrink-0 rounded-full ${apiInfoColorDotClass(item.color)}`}
                                  aria-hidden
                                />
                                <code className='break-all text-xs'>{item.route}</code>
                              </div>
                            </td>
                            <td className='min-w-[12rem] text-sm'>{item.description}</td>
                            <td className='min-w-[14rem]'>
                              <a
                                href={fullUrl}
                                target='_blank'
                                rel='noreferrer'
                                className='break-all text-xs underline underline-offset-2'
                                style={{ color: 'var(--link)' }}
                              >
                                {item.url}
                              </a>
                            </td>
                            <td>
                              <TableActionButton
                                label='Copy'
                                onPress={() => {
                                  copyText(fullUrl).then((ok) => {
                                    if (ok) toast.success('Copied');
                                    else toast.error('Copy failed');
                                  });
                                }}
                              >
                                <Copy size={16} />
                              </TableActionButton>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}
          </Card.Content>
        </Card>
      ) : null}

      {status?.announcements_enabled ? (
        <Card>
          <Card.Header>
            <Card.Title>Announcements</Card.Title>
          </Card.Header>
          <Card.Content>
            {announcements.length === 0 ? (
              <div className='text-sm text-muted'>No announcements.</div>
            ) : (
              <div className='space-y-3'>
                <div className='flex flex-wrap items-center gap-2 text-xs text-muted'>
                  <span>Showing latest {Math.min(20, announcements.length)}.</span>
                  <span className='opacity-60'>·</span>
                  <span>Types:</span>
                  {(
                    [
                      { label: 'Info', color: 'default' },
                      { label: 'Ongoing', color: 'accent' },
                      { label: 'Success', color: 'success' },
                      { label: 'Warning', color: 'warning' },
                      { label: 'Error', color: 'danger' },
                    ] as const
                  ).map((t) => (
                    <Chip key={t.label} size='sm' variant='secondary' color={t.color}>
                      {t.label}
                    </Chip>
                  ))}
                </div>

                <div className='max-h-96 space-y-3 overflow-auto pr-2'>
                  {announcements.slice(0, 20).map((a, idx) => {
                    const chip = announcementTypeChip(a.type);
                    return (
                      <Card key={getAnnouncementKey(a, idx)} variant='secondary'>
                        <Card.Content className='space-y-2'>
                          <div className='flex flex-wrap items-center justify-between gap-2'>
                            <div className='text-xs text-muted'>{formatPublishDate(a.publishDate)}</div>
                            <Chip size='sm' variant='secondary' color={chip.color}>
                              {chip.label}
                            </Chip>
                          </div>

                          {a.content ? (
                            <MarkdownRenderer markdown={a.content} />
                          ) : (
                            <div className='text-sm text-muted'>—</div>
                          )}

                          {a.extra ? (
                            <div className='text-xs text-muted'>
                              <MarkdownRenderer markdown={a.extra} />
                            </div>
                          ) : null}
                        </Card.Content>
                      </Card>
                    );
                  })}
                </div>
              </div>
            )}
          </Card.Content>
        </Card>
      ) : null}

      {status?.faq_enabled ? (
        <Card>
          <Card.Header>
            <Card.Title>FAQ</Card.Title>
          </Card.Header>
          <Card.Content>
            {faqItems.length === 0 ? (
              <div className='text-sm text-muted'>No FAQ configured.</div>
            ) : (
              <Accordion variant='surface'>
                {faqItems.map((item, idx) => (
                  <Accordion.Item key={`${item.question}-${idx}`}>
                    <Accordion.Heading>
                      <Accordion.Trigger>
                        <span className='text-sm font-semibold'>{item.question}</span>
                        <Accordion.Indicator />
                      </Accordion.Trigger>
                    </Accordion.Heading>
                    <Accordion.Panel>
                      <Accordion.Body>
                        {item.answer ? (
                          <MarkdownRenderer markdown={item.answer} />
                        ) : (
                          <div className='text-sm text-muted'>—</div>
                        )}
                      </Accordion.Body>
                    </Accordion.Panel>
                  </Accordion.Item>
                ))}
              </Accordion>
            )}
          </Card.Content>
        </Card>
      ) : null}

      {status?.uptime_kuma_enabled && uptime.length > 0 ? (
        <Card>
          <Card.Header>
            <Card.Title>Uptime</Card.Title>
          </Card.Header>
          <Card.Content className='space-y-4'>
            {uptime.map((cat) => (
              <div key={cat.categoryName}>
                <div className='text-xs font-semibold uppercase text-muted'>{cat.categoryName}</div>
                <div className='mt-2 grid grid-cols-1 gap-2 md:grid-cols-2'>
                  {cat.monitors.map((m) => (
                    <Card key={m.name} variant='secondary'>
                      <Card.Content>
                        <div className='font-semibold'>{m.name}</div>
                        <div className='mt-1 text-xs text-muted'>
                          Status: {m.status} · Uptime: {m.uptime}
                        </div>
                      </Card.Content>
                    </Card>
                  ))}
                </div>
              </div>
            ))}
          </Card.Content>
        </Card>
      ) : null}
    </div>
  );
}
