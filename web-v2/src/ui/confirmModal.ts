export type ConfirmModalOptions = {
  title?: string;
  confirmText?: string;
  cancelText?: string;
  confirmVariant?: 'primary' | 'secondary' | 'tertiary' | 'ghost' | 'danger';
};

export type ConfirmModalRequest = ConfirmModalOptions & {
  id: string;
  message: string;
};

const CONFIRM_MODAL_EVENT = 'aerspan:confirm-modal';

let hostCount = 0;
const resolvers = new Map<string, (result: boolean) => void>();
const pendingRequests: ConfirmModalRequest[] = [];

function createId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function toMessageString(message: unknown) {
  if (message == null) return '';
  return typeof message === 'string' ? message : String(message);
}

function isHostReady() {
  return hostCount > 0;
}

export function registerConfirmModalHost() {
  hostCount += 1;
  return () => {
    hostCount = Math.max(0, hostCount - 1);
  };
}

export function resolveConfirmModal(id: string, result: boolean) {
  const resolve = resolvers.get(id);
  resolvers.delete(id);
  resolve?.(result);
}

export function confirmModal(message: unknown, options: ConfirmModalOptions = {}) {
  const request: ConfirmModalRequest = {
    id: createId(),
    message: toMessageString(message),
    ...options,
  };

  if (typeof window === 'undefined') return Promise.resolve(false);

  return new Promise<boolean>((resolve) => {
    resolvers.set(request.id, resolve);

    if (!isHostReady()) {
      pendingRequests.push(request);
      return;
    }

    window.dispatchEvent(new CustomEvent<ConfirmModalRequest>(CONFIRM_MODAL_EVENT, { detail: request }));
  });
}

confirmModal._eventName = CONFIRM_MODAL_EVENT;

export function drainConfirmModalQueue() {
  if (pendingRequests.length === 0) return [];
  return pendingRequests.splice(0, pendingRequests.length);
}
