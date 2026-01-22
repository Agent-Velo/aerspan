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

import { API } from './api';

export const TOKEN_API_KEY_PREFIX = 'sk-ae-v1-';
export const LEGACY_TOKEN_API_KEY_PREFIX = 'sk-';

function normalizeTokenKey(input) {
  let raw = String(input || '').trim();
  // Avoid double-prefixing if a full API key was passed in.
  if (raw.startsWith(TOKEN_API_KEY_PREFIX)) {
    raw = raw.slice(TOKEN_API_KEY_PREFIX.length);
  } else if (raw.startsWith(LEGACY_TOKEN_API_KEY_PREFIX)) {
    raw = raw.slice(LEGACY_TOKEN_API_KEY_PREFIX.length);
  }
  return raw.trim();
}

export function isNewTokenKeyFormat(tokenKey) {
  const raw = normalizeTokenKey(tokenKey);
  // New format: 72 hex chars, with an optional suffix starting with '-'.
  // Backward compatibility: accept the old 32-hex variant.
  return /^(?:[0-9a-f]{72}|[0-9a-f]{32})($|-)/i.test(raw);
}

export function getTokenApiKeyPrefix(tokenKey) {
  return isNewTokenKeyFormat(tokenKey)
    ? TOKEN_API_KEY_PREFIX
    : LEGACY_TOKEN_API_KEY_PREFIX;
}

export function formatTokenApiKey(tokenKey) {
  if (!tokenKey) return '';
  const raw = normalizeTokenKey(tokenKey);
  if (!raw) return '';
  return `${getTokenApiKeyPrefix(raw)}${raw}`;
}

/**
 * 获取可用的token keys
 * @returns {Promise<string[]>} 返回active状态的token key数组
 */
export async function fetchTokenKeys() {
  try {
    const response = await API.get('/api/token/?p=1&size=10');
    const { success, data } = response.data;
    if (!success) throw new Error('Failed to fetch token keys');

    const tokenItems = Array.isArray(data) ? data : data.items || [];
    const activeTokens = tokenItems.filter((token) => token.status === 1);
    return activeTokens.map((token) => token.key);
  } catch (error) {
    console.error('Error fetching token keys:', error);
    return [];
  }
}

/**
 * 获取服务器地址
 * @returns {string} 服务器地址
 */
export function getServerAddress() {
  let status = localStorage.getItem('status');
  let serverAddress = '';

  if (status) {
    try {
      status = JSON.parse(status);
      serverAddress = status.server_address || '';
    } catch (error) {
      console.error('Failed to parse status from localStorage:', error);
    }
  }

  if (!serverAddress) {
    serverAddress = window.location.origin;
  }

  return serverAddress;
}
