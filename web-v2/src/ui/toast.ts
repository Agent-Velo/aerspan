export type ToastVariant = 'info' | 'success' | 'warning' | 'error';

export type ToastPayload = {
  variant: ToastVariant;
  message: string;
};

const TOAST_EVENT = 'aerspan:toast';

export function toast(payload: ToastPayload) {
  window.dispatchEvent(new CustomEvent<ToastPayload>(TOAST_EVENT, { detail: payload }));
}

toast.success = (message: string) => toast({ variant: 'success', message });
toast.info = (message: string) => toast({ variant: 'info', message });
toast.warning = (message: string) => toast({ variant: 'warning', message });
toast.error = (message: string) => toast({ variant: 'error', message });
toast._eventName = TOAST_EVENT;

