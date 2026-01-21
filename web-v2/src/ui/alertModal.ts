export type AlertModalOptions = {
  title?: string;
  confirmText?: string;
};

export type AlertModalRequest = AlertModalOptions & {
  id: string;
  message: string;
};

const ALERT_MODAL_EVENT = 'aerspan:alert-modal';

let nativeAlert: ((message?: any) => void) | null = null;
let isPatched = false;

let hostCount = 0;
const resolvers = new Map<string, () => void>();

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

export function registerAlertModalHost() {
  hostCount += 1;
  return () => {
    hostCount = Math.max(0, hostCount - 1);
  };
}

export function resolveAlertModal(id: string) {
  const resolve = resolvers.get(id);
  resolvers.delete(id);
  resolve?.();
}

export function alertModal(message: unknown, options: AlertModalOptions = {}) {
  const request: AlertModalRequest = {
    id: createId(),
    message: toMessageString(message),
    ...options,
  };

  if (typeof window === 'undefined') return Promise.resolve();

  // Safety net: if the React host isn't mounted yet, fall back to native alert
  // to avoid leaving a never-resolving Promise.
  if (!isHostReady()) {
    (nativeAlert ?? window.alert)(request.message);
    return Promise.resolve();
  }

  return new Promise<void>((resolve) => {
    resolvers.set(request.id, resolve);
    window.dispatchEvent(new CustomEvent<AlertModalRequest>(ALERT_MODAL_EVENT, { detail: request }));
  });
}

alertModal._eventName = ALERT_MODAL_EVENT;

export function installModalAlert() {
  if (typeof window === 'undefined') return;
  if (isPatched) return;

  nativeAlert = window.alert.bind(window);
  window.alert = (message?: any) => {
    void alertModal(message);
  };

  isPatched = true;
}

