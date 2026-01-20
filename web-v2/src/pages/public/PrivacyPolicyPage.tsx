import { DocumentRenderer } from '@/components/DocumentRenderer';
import { useCachedText } from '@/hooks/useCachedText';

export function PrivacyPolicyPage() {
  const { value, loading } = useCachedText('privacy_policy', '/api/privacy-policy');

  return (
    <div className='space-y-4'>
      <div className='text-lg font-semibold'>Privacy Policy</div>
      {loading && !value ? (
        <div className='text-sm text-muted'>Loading…</div>
      ) : (
        <DocumentRenderer content={value || ''} />
      )}
    </div>
  );
}
