import { useEffect, useRef } from 'react'
import { Stethoscope } from 'lucide-react'
import type { Message } from '../types'
import MessageBubble from './MessageBubble'

interface ChatWindowProps {
  messages: Message[]
}

export default function ChatWindow({ messages }: ChatWindowProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages])

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
        <Stethoscope className="size-10 text-emerald-500" />
        <h2 className="text-lg font-semibold">What would you like to analyze?</h2>
        <p className="max-w-md text-sm text-neutral-500">
          Upload medical images and ask MedGemma a question. Responses will be rendered as
          structured clinical findings.
        </p>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6">
        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} />
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
