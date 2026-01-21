export function getApiBaseUrl(): string {
  const explicit = import.meta.env.VITE_API_BASE_URL as string | undefined;
  const legacy = import.meta.env.VITE_REACT_APP_SERVER_URL as string | undefined;
  const value = (explicit || legacy || '').trim();
  return value;
}

