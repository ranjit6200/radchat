import { Bot, User } from 'lucide-react'
import { cn } from '../utils/cn'
import type { Message } from '../types'
import Markdown from './Markdown'
import StructuredView from './StructuredView'

interface MessageBubbleProps {
  message: Message
}

export default function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === 'user'
  const hasContent = message.content.trim().length > 0
  // When structured findings are present, `content` is the raw JSON that produced
  // the cards, so render the cards only instead of duplicating the raw output.
  const showProse = hasContent && !message.structured

  return (
    <div className={cn('flex w-full gap-3', isUser ? 'flex-row-reverse' : 'flex-row')}>
      {/* Avatar */}
      <div
        className={cn(
          'flex size-8 shrink-0 items-center justify-center rounded-full',
          isUser ? 'bg-emerald-600 text-white' : 'bg-neutral-800 text-emerald-400',
        )}
      >
        {isUser ? <User className="size-4" /> : <Bot className="size-4" />}
      </div>

      {/* Bubble + structured cards */}
      <div
        className={cn(
          'flex min-w-0 max-w-[85%] flex-col gap-2',
          isUser ? 'items-end' : 'items-start',
        )}
      >
        {isUser && message.images && message.images.length > 0 && (
          <div className="flex flex-wrap justify-end gap-2">
            {message.images.map((image) => (
              <img
                key={image.id}
                src={image.dataUrl}
                alt={image.name}
                className="size-24 rounded-xl border border-neutral-200 object-cover shadow-sm"
              />
            ))}
          </div>
        )}

        {showProse && (
          <div
            className={cn(
              'rounded-2xl px-4 py-2.5 text-sm shadow-sm',
              isUser
                ? 'rounded-tr-sm bg-emerald-600 text-white'
                : 'rounded-tl-sm border border-neutral-200 bg-white text-neutral-800',
            )}
          >
            <Markdown>{message.content}</Markdown>
          </div>
        )}

        {!isUser && message.structured && <StructuredView data={message.structured} />}
      </div>
    </div>
  )
}
