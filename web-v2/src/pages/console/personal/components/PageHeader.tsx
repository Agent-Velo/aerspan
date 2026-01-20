import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/heroui';
import type { ReactNode } from 'react';

type PageHeaderProps = {
  title: string;
  description?: string;
  backPath?: string;
  actions?: ReactNode;
};

export function PageHeader({ title, description, backPath = '/console/personal', actions }: PageHeaderProps) {
  const navigate = useNavigate();

  return (
    <div className='flex flex-col justify-between gap-3 md:flex-row md:items-end'>
      <div>
        {backPath ? (
          <Button
            size='sm'
            variant='ghost'
            onPress={() => navigate(backPath)}
            className='mb-2 -ml-2'
          >
            ← Back to Personal
          </Button>
        ) : null}
        <div className='text-lg font-semibold'>{title}</div>
        {description ? <div className='mt-1 text-sm text-muted'>{description}</div> : null}
      </div>
      {actions ? <div className='flex flex-wrap gap-2'>{actions}</div> : null}
    </div>
  );
}
