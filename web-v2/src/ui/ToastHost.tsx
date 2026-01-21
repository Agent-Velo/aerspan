import { useEffect, useState } from 'react';
import { toast, type ToastPayload, type ToastVariant } from '@/ui/toast';
import { Alert } from '@/components/ui/heroui';

type ToastItem = ToastPayload & { id: string };

const variantToStatus: Record<ToastVariant, 'default' | 'accent' | 'success' | 'warning' | 'danger'>
  = {
    info: 'accent',
    success: 'success',
    warning: 'warning',
    error: 'danger',
  };

export function ToastHost() {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    const handler = (e: Event) => {
      const event = e as CustomEvent<ToastPayload>;
      const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const next: ToastItem = { ...event.detail, id };
      setItems((prev) => [...prev, next]);
      window.setTimeout(() => {
        setItems((prev) => prev.filter((t) => t.id !== id));
      }, 4000);
    };

    window.addEventListener(toast._eventName, handler);
    return () => window.removeEventListener(toast._eventName, handler);
  }, []);

  if (items.length === 0) return null;

  return (
    <div className='fixed bottom-4 right-4 z-[1000] flex w-[min(420px,calc(100vw-2rem))] flex-col gap-2'>
      {items.map((t) => (
        <Alert key={t.id} status={variantToStatus[t.variant]}>
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Description>{t.message}</Alert.Description>
          </Alert.Content>
        </Alert>
      ))}
    </div>
  );
}
