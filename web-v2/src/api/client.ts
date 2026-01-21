import { getApiBaseUrl } from '@/lib/env';
import { clearStoredUser, getStoredUserId } from '@/lib/storage';
import { toast } from '@/ui/toast';

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

export type FetchJsonOptions = {
  method?: HttpMethod;
  params?: Record<string, string | number | boolean | null | undefined>;
  headers?: Record<string, string>;
  body?: unknown;
  skipErrorHandler?: boolean;
  dedupeGet?: boolean;
};

const inFlightGetRequests = new Map<string, Promise<any>>();

const UNAUTHORIZED_EVENT = 'aerspan:unauthorized';

export function onUnauthorized(handler: () => void) {
  window.addEventListener(UNAUTHORIZED_EVENT, handler);
  return () => window.removeEventListener(UNAUTHORIZED_EVENT, handler);
}

function buildUrl(path: string, params?: FetchJsonOptions['params']): string {
  const base = getApiBaseUrl();

  const url = (() => {
    if (/^https?:\/\//i.test(path)) return new URL(path);
    if (base) return new URL(path, base);
    return new URL(path, window.location.origin);
  })();

  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null) continue;
      url.searchParams.set(key, String(value));
    }
  }
  return base ? url.toString() : url.pathname + url.search;
}

async function readErrorBody(response: Response): Promise<string> {
  const contentType = response.headers.get('content-type') || '';
  try {
    if (contentType.includes('application/json')) {
      const json = await response.json();
      if (typeof json?.message === 'string') return json.message;
      return JSON.stringify(json);
    }
    return await response.text();
  } catch {
    return `${response.status} ${response.statusText}`;
  }
}

export async function fetchJson<T>(path: string, options: FetchJsonOptions = {}): Promise<T> {
  const method = options.method ?? 'GET';
  const dedupeGet = options.dedupeGet ?? true;

  const url = buildUrl(path, options.params);
  const dedupeKey = method === 'GET' ? `${url}` : null;
  if (dedupeKey && dedupeGet && inFlightGetRequests.has(dedupeKey)) {
    return inFlightGetRequests.get(dedupeKey) as Promise<T>;
  }

  const userId = getStoredUserId();

  const headers = new Headers({
    'Cache-Control': 'no-store',
    ...options.headers,
  });
  if (typeof userId === 'number' && userId > 0) {
    headers.set('New-Api-User', String(userId));
  }

  let body: BodyInit | undefined;
  if (options.body !== undefined) {
    if (options.body instanceof FormData) {
      body = options.body;
    } else {
      headers.set('Content-Type', 'application/json');
      body = JSON.stringify(options.body);
    }
  }

  const run = async (): Promise<T> => {
    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers,
        body,
        credentials: getApiBaseUrl() ? 'include' : 'same-origin',
      });
    } catch (error) {
      if (!options.skipErrorHandler) toast.error('Network connection failed');
      throw error;
    }

    if (!response.ok) {
      const message = await readErrorBody(response);
      if (response.status === 401) {
        clearStoredUser();
        window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT));
      }
      if (!options.skipErrorHandler) toast.error(message || 'Request failed');
      throw new Error(message || `HTTP ${response.status}`);
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      const text = await response.text();
      return text as unknown as T;
    }

    const json = (await response.json()) as any;
    if (json && typeof json.success === 'boolean') {
      if (!json.success) {
        if (!options.skipErrorHandler) toast.error(json.message || 'Request failed');
        throw new Error(json.message || 'Request failed');
      }
      return json as T;
    }
    return json as T;
  };

  const promise = run();
  if (dedupeKey && dedupeGet) {
    inFlightGetRequests.set(dedupeKey, promise);
    promise.finally(() => inFlightGetRequests.delete(dedupeKey));
  }
  return promise;
}
