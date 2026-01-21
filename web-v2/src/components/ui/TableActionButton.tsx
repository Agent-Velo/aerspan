import type { ComponentProps, ReactNode } from 'react';
import { Button, Tooltip } from '@/components/ui/heroui';

export type TableActionButtonProps = Omit<ComponentProps<typeof Button>, 'children' | 'isIconOnly'> & {
  label: string;
  children: ReactNode;
  tooltip?: ReactNode;
};

export function TableActionButton({
  label,
  tooltip,
  children,
  size = 'sm',
  variant = 'ghost',
  ...buttonProps
}: TableActionButtonProps) {
  return (
    <Tooltip delay={0}>
      <Button {...buttonProps} isIconOnly aria-label={label} size={size} variant={variant}>
        {children}
      </Button>
      <Tooltip.Content>{tooltip ?? label}</Tooltip.Content>
    </Tooltip>
  );
}

