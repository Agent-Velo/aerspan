export const TOKEN_API_KEY_PREFIX = 'sk-ae-v1-';
export const LEGACY_TOKEN_API_KEY_PREFIX = 'sk-';

function normalizeTokenKey(input: string): string {
  let raw = input.trim();
  // Avoid double-prefixing if a full API key was passed in.
  if (raw.startsWith(TOKEN_API_KEY_PREFIX)) {
    raw = raw.slice(TOKEN_API_KEY_PREFIX.length);
  } else if (raw.startsWith(LEGACY_TOKEN_API_KEY_PREFIX)) {
    raw = raw.slice(LEGACY_TOKEN_API_KEY_PREFIX.length);
  }
  return raw.trim();
}

export function isNewTokenKeyFormat(tokenKey: string): boolean {
  const raw = normalizeTokenKey(tokenKey);
  // New format: 72 hex chars, with an optional suffix starting with '-'.
  // Backward compatibility: accept the old 32-hex variant.
  return /^(?:[0-9a-f]{72}|[0-9a-f]{32})($|-)/i.test(raw);
}

export function getTokenApiKeyPrefix(tokenKey: string): string {
  return isNewTokenKeyFormat(tokenKey)
    ? TOKEN_API_KEY_PREFIX
    : LEGACY_TOKEN_API_KEY_PREFIX;
}

export function formatTokenApiKey(tokenKey?: string | null): string {
  if (!tokenKey) return '';
  const raw = normalizeTokenKey(tokenKey);
  if (!raw) return '';
  return `${getTokenApiKeyPrefix(raw)}${raw}`;
}
