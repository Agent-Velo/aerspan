import { DocumentRenderer } from '@/components/DocumentRenderer';
import { useCachedText } from '@/hooks/useCachedText';

export function TermsPage() {
  const { value, loading } = useCachedText('user_agreement', '/api/user-agreement');

  return (
    <div className='space-y-4'>
      <div className='text-lg font-semibold'>Terms</div>
      {loading && !value ? (
        <div className='text-sm text-muted'>Loading…</div>
      ) : (
        <DocumentRenderer content={value || ''} />
      )}
    </div>
  );
}
