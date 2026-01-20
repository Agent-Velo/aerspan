import { MarkdownRenderer } from '@/components/MarkdownRenderer';
import { Card } from '@/components/ui/heroui';

type RenderMode = 'url' | 'html' | 'markdown';

function isProbablyUrl(content: string) {
  try {
    // Accept only absolute URLs.
    // eslint-disable-next-line no-new
    new URL(content);
    return true;
  } catch {
    return false;
  }
}

function isProbablyHtml(content: string) {
  return /<\s*[a-z][\s\S]*>/i.test(content);
}

function extractStyleTags(html: string) {
  const styleBlocks: string[] = [];
  const cleaned = html.replace(/<style[^>]*>([\s\S]*?)<\/style>/gi, (_, css: string) => {
    styleBlocks.push(css);
    return '';
  });
  return { cleaned, styleBlocks };
}

export function DocumentRenderer({ content }: { content: string }) {
  const trimmed = content.trim();
  const mode: RenderMode = isProbablyUrl(trimmed) ? 'url' : isProbablyHtml(trimmed) ? 'html' : 'markdown';

  if (mode === 'url') {
    return (
      <Card className='overflow-hidden p-0'>
        <iframe title='document' src={trimmed} className='h-[min(80vh,900px)] w-full' />
      </Card>
    );
  }

  if (mode === 'html') {
    const { cleaned, styleBlocks } = extractStyleTags(trimmed);
    return (
      <Card>
        <Card.Content>
          {styleBlocks.length > 0 ? <style>{styleBlocks.join('\n')}</style> : null}
          <div dangerouslySetInnerHTML={{ __html: cleaned }} />
        </Card.Content>
      </Card>
    );
  }

  return (
    <Card>
      <Card.Content>
        <MarkdownRenderer markdown={trimmed} />
      </Card.Content>
    </Card>
  );
}
