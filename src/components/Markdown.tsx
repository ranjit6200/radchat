import type { Components } from 'react-markdown'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '../utils/cn'

const components: Components = {
  a: ({ node: _node, className, ...props }) => (
    <a
      {...props}
      target="_blank"
      rel="noreferrer"
      className={cn('font-medium underline underline-offset-2 hover:opacity-80', className)}
    />
  ),
  p: ({ node: _node, className, ...props }) => (
    <p {...props} className={cn('my-2 leading-relaxed first:mt-0 last:mb-0', className)} />
  ),
  ul: ({ node: _node, className, ...props }) => (
    <ul {...props} className={cn('my-2 list-disc space-y-1 pl-5 first:mt-0 last:mb-0', className)} />
  ),
  ol: ({ node: _node, className, ...props }) => (
    <ol
      {...props}
      className={cn('my-2 list-decimal space-y-1 pl-5 first:mt-0 last:mb-0', className)}
    />
  ),
  li: ({ node: _node, className, ...props }) => (
    <li {...props} className={cn('leading-relaxed', className)} />
  ),
  h1: ({ node: _node, className, ...props }) => (
    <h1 {...props} className={cn('mt-4 mb-2 text-lg font-semibold first:mt-0', className)} />
  ),
  h2: ({ node: _node, className, ...props }) => (
    <h2 {...props} className={cn('mt-4 mb-2 text-base font-semibold first:mt-0', className)} />
  ),
  h3: ({ node: _node, className, ...props }) => (
    <h3 {...props} className={cn('mt-3 mb-1.5 text-sm font-semibold first:mt-0', className)} />
  ),
  h4: ({ node: _node, className, ...props }) => (
    <h4 {...props} className={cn('mt-3 mb-1.5 text-sm font-semibold first:mt-0', className)} />
  ),
  blockquote: ({ node: _node, className, ...props }) => (
    <blockquote
      {...props}
      className={cn('my-2 border-l-2 border-current/30 pl-3 opacity-80 italic', className)}
    />
  ),
  hr: ({ node: _node, className, ...props }) => (
    <hr {...props} className={cn('my-3 border-neutral-200', className)} />
  ),
  strong: ({ node: _node, className, ...props }) => (
    <strong {...props} className={cn('font-semibold', className)} />
  ),
  table: ({ node: _node, className, ...props }) => (
    <div className="my-3 w-full overflow-x-auto">
      <table {...props} className={cn('w-full border-collapse text-left text-sm', className)} />
    </div>
  ),
  thead: ({ node: _node, className, ...props }) => (
    <thead {...props} className={cn('bg-neutral-100', className)} />
  ),
  th: ({ node: _node, className, ...props }) => (
    <th {...props} className={cn('border border-neutral-200 px-3 py-1.5 font-semibold', className)} />
  ),
  td: ({ node: _node, className, ...props }) => (
    <td {...props} className={cn('border border-neutral-200 px-3 py-1.5 align-top', className)} />
  ),
  pre: ({ node: _node, className, ...props }) => (
    <pre
      {...props}
      className={cn(
        'my-3 overflow-x-auto rounded-lg bg-neutral-900 p-3 text-xs leading-relaxed text-neutral-100',
        className,
      )}
    />
  ),
  code: ({ node: _node, className, children, ...props }) => {
    const isBlock = typeof className === 'string' && className.includes('language-')
    return (
      <code
        {...props}
        className={cn(
          'font-mono',
          isBlock
            ? 'text-inherit'
            : 'rounded bg-neutral-200/80 px-1.5 py-0.5 text-[0.85em] text-neutral-800',
          className,
        )}
      >
        {children}
      </code>
    )
  },
}

interface MarkdownProps {
  children: string
  className?: string
}

export default function Markdown({ children, className }: MarkdownProps) {
  return (
    <div className={cn('text-inherit', className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {children}
      </ReactMarkdown>
    </div>
  )
}
