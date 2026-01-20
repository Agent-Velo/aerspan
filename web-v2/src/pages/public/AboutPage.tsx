import { DocumentRenderer } from '@/components/DocumentRenderer';
import { useCachedText } from '@/hooks/useCachedText';

export function AboutPage() {
  const { value, loading } = useCachedText('about', '/api/about');

  return (
    <div className='space-y-4'>
      <div className='text-lg font-semibold'>About</div>
      {loading && !value ? (
        <div className='text-sm text-muted'>Loading…</div>
      ) : (
        <DocumentRenderer content={value || ''} />
      )}
    </div>
  );
}
