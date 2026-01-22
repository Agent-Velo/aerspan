import { useEffect, useState } from 'react';
import { Button, Modal } from '@/components/ui/heroui';
import {
  confirmModal,
  drainConfirmModalQueue,
  registerConfirmModalHost,
  resolveConfirmModal,
  type ConfirmModalRequest,
} from '@/ui/confirmModal';

export function ConfirmModalHost() {
  const [queue, setQueue] = useState<ConfirmModalRequest[]>([]);
  const current = queue[0] ?? null;

  useEffect(() => {
    const handler = (e: Event) => {
      const event = e as CustomEvent<ConfirmModalRequest>;
      setQueue((prev) => [...prev, event.detail]);
    };

    window.addEventListener(confirmModal._eventName, handler);

    const unregister = registerConfirmModalHost();
    const pending = drainConfirmModalQueue();
    if (pending.length > 0) {
      setQueue((prev) => [...prev, ...pending]);
    }

    return () => {
      unregister();
      window.removeEventListener(confirmModal._eventName, handler);
    };
  }, []);

  const closeCurrent = (result: boolean) => {
    if (!current) return;
    resolveConfirmModal(current.id, result);
    setQueue((prev) => prev.slice(1));
  };

  if (!current) return null;

  return (
    <Modal
      isOpen
      onOpenChange={(nextOpen) => {
        if (nextOpen) return;
        closeCurrent(false);
      }}
    >
      {/*
        HeroUI Modal is based on React Aria's DialogTrigger and expects a trigger element.
        We control the open state programmatically, so the trigger stays hidden.
      */}
      <button type='button' className='hidden' aria-hidden='true' />

      <Modal.Backdrop>
        <Modal.Container size='sm'>
          <Modal.Dialog>
            <Modal.CloseTrigger />
            <Modal.Header>
              <Modal.Heading>{current.title ?? 'Confirm'}</Modal.Heading>
            </Modal.Header>

            <Modal.Body>
              <p className='whitespace-pre-wrap text-sm text-muted'>{current.message}</p>
            </Modal.Body>

            <Modal.Footer className='flex gap-2'>
              {/*
                NOTE: Don't rely on `slot="close"` for these buttons.
                React Aria chains slot handlers before component props, which means the dialog
                can request close before our `onPress` runs. Resolve and pop the queue directly.
              */}
              <Button
                variant='secondary'
                onPress={() => closeCurrent(false)}
              >
                {current.cancelText ?? 'Cancel'}
              </Button>
              <Button
                variant={current.confirmVariant ?? 'primary'}
                onPress={() => closeCurrent(true)}
              >
                {current.confirmText ?? 'Confirm'}
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
