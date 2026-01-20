export function formatUnixSeconds(seconds: number): string {
  if (!seconds || seconds <= 0) return '—';
  const date = new Date(seconds * 1000);
  return date.toLocaleString();
}

export function formatUnixMillis(ms: number): string {
  if (!ms || ms <= 0) return '—';
  const date = new Date(ms);
  return date.toLocaleString();
}

export function toDateTimeLocalValueFromSeconds(seconds: number): string {
  const date = new Date(seconds * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  const yyyy = date.getFullYear();
  const mm = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const hh = pad(date.getHours());
  const mi = pad(date.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}

export function toDateTimeLocalValueFromMillis(ms: number): string {
  const date = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  const yyyy = date.getFullYear();
  const mm = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const hh = pad(date.getHours());
  const mi = pad(date.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}

export function fromDateTimeLocalToSeconds(value: string): number {
  if (!value) return 0;
  const ms = new Date(value).getTime();
  return Math.floor(ms / 1000);
}

export function fromDateTimeLocalToMillis(value: string): number {
  if (!value) return 0;
  return new Date(value).getTime();
}

export function clampRangeToMaxSeconds(start: number, end: number, maxRangeSeconds: number) {
  if (end - start <= maxRangeSeconds) return { start, end };
  return { start: end - maxRangeSeconds, end };
}

