import { useEffect, useState } from 'react';
import { Button, Modal } from '@/components/ui/heroui';
import {
  alertModal,
  registerAlertModalHost,
  resolveAlertModal,
  type AlertModalRequest,
} from '@/ui/alertModal';

export function AlertModalHost() {
  const [queue, setQueue] = useState<AlertModalRequest[]>([]);
  const current = queue[0] ?? null;

  useEffect(() => {
    const unregister = registerAlertModalHost();

    const handler = (e: Event) => {
      const event = e as CustomEvent<AlertModalRequest>;
      setQueue((prev) => [...prev, event.detail]);
    };

    window.addEventListener(alertModal._eventName, handler);
    return () => {
      unregister();
      window.removeEventListener(alertModal._eventName, handler);
    };
  }, []);

  const closeCurrent = () => {
    if (!current) return;
    resolveAlertModal(current.id);
    setQueue((prev) => prev.slice(1));
  };

  if (!current) return null;

  return (
    <Modal
      isOpen
      onOpenChange={(nextOpen) => {
        if (!nextOpen) closeCurrent();
      }}
    >
      {/*
        HeroUI Modal is based on React Aria's DialogTrigger and expects a trigger element.
        We control the open state programmatically, so the trigger stays hidden.
      */}
      <button type='button' className='hidden' aria-hidden='true' />

      <Modal.Backdrop isDismissable={false}>
        <Modal.Container size='sm'>
          <Modal.Dialog>
            <Modal.Header>
              <Modal.Heading>{current.title ?? 'Notice'}</Modal.Heading>
            </Modal.Header>

            <Modal.Body>
              <p className='whitespace-pre-wrap text-sm text-muted'>{current.message}</p>
            </Modal.Body>

            <Modal.Footer>
              <Button slot='close' className='w-full'>
                {current.confirmText ?? 'OK'}
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}

