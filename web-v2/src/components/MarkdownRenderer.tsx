import { useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeHighlight from 'rehype-highlight';
import mermaid from 'mermaid';

import 'katex/dist/katex.min.css';
import 'highlight.js/styles/github.css';

import { copyText } from '@/lib/clipboard';
import { toast } from '@/ui/toast';
import { Button, Card } from '@/components/ui/heroui';

mermaid.initialize({
  startOnLoad: false,
  securityLevel: 'loose',
});

function MermaidBlock({ code }: { code: string }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    if (!ref.current) return;
    setHasError(false);
    mermaid
      .run({ nodes: [ref.current], suppressErrors: true })
      .catch(() => setHasError(true));
  }, [code]);

  if (hasError) return null;

  return (
    <Card className='my-3' variant='secondary'>
      <Card.Content className='overflow-auto'>
        <div ref={ref} className='mermaid'>
          {code}
        </div>
      </Card.Content>
    </Card>
  );
}

export function MarkdownRenderer({ markdown }: { markdown: string }) {
  const plugins = useMemo(() => [remarkGfm, remarkMath], []);
  const rehypePlugins = useMemo(() => [rehypeKatex, rehypeHighlight], []);

  return (
    <article className='markdown text-sm leading-6'>
      <ReactMarkdown
        remarkPlugins={plugins as any}
        rehypePlugins={rehypePlugins as any}
        components={{
          code: ({ className, children, ...props }) => {
            const match = /language-(\w+)/.exec(className || '');
            const language = match?.[1] || '';
            const raw = String(children ?? '');
            const code = raw.endsWith('\n') ? raw.slice(0, -1) : raw;

            if (language === 'mermaid') {
              return <MermaidBlock code={code} />;
            }

            const isBlock = Boolean(className);
            if (!isBlock) {
              return (
                <code
                  className='rounded px-1 py-0.5 text-[0.85em]'
                  style={{ background: 'color-mix(in oklab, var(--foreground) 10%, transparent)' }}
                  {...props}
                >
                  {children}
                </code>
              );
            }

            return (
              <Card className='my-3 gap-0 overflow-hidden p-0' variant='secondary'>
                <div className='flex items-center justify-end p-2'>
                  <Button
                    size='sm'
                    variant='secondary'
                    onPress={() => {
                      copyText(code).then((ok) => {
                        if (ok) toast.success('Copied');
                        else toast.error('Copy failed');
                      });
                    }}
                  >
                    Copy
                  </Button>
                </div>
                <pre className='m-0 overflow-auto p-3 text-sm'>
                  <code className={className} {...props}>
                    {code}
                  </code>
                </pre>
              </Card>
            );
          },
          a: ({ href, children, ...props }) => (
            <a
              href={href}
              target='_blank'
              rel='noreferrer'
              className='text-sky-600 underline underline-offset-2 dark:text-sky-400'
              {...props}
            >
              {children}
            </a>
          ),
        }}
      >
        {markdown}
      </ReactMarkdown>
    </article>
  );
}
