export const TOKEN_API_KEY_PREFIX = 'sk-ae-v1-';
export const LEGACY_TOKEN_API_KEY_PREFIX = 'sk-';

export function isNewTokenKeyFormat(tokenKey: string): boolean {
  return /^[0-9a-f]{32}$/i.test(tokenKey);
}

export function getTokenApiKeyPrefix(tokenKey: string): string {
  return isNewTokenKeyFormat(tokenKey)
    ? TOKEN_API_KEY_PREFIX
    : LEGACY_TOKEN_API_KEY_PREFIX;
}

export function formatTokenApiKey(tokenKey?: string | null): string {
  if (!tokenKey) return '';
  return `${getTokenApiKeyPrefix(tokenKey)}${tokenKey}`;
}

