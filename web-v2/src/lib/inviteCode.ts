export function getInviteCode(): string | null {
  const raw = localStorage.getItem('via') || localStorage.getItem('aff');
  return raw && raw.trim() ? raw.trim() : null;
}

