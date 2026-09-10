import { MessageSquare, Plus, Stethoscope, Trash2 } from 'lucide-react'
import { cn } from '../utils/cn'
import type { ChatSession } from '../types'

interface SidebarProps {
  chats: ChatSession[]
  activeChatId: string | null
  onNewChat: () => void
  onSelectChat: (id: string) => void
  onDeleteChat: (id: string) => void
}

export default function Sidebar({
  chats,
  activeChatId,
  onNewChat,
  onSelectChat,
  onDeleteChat,
}: SidebarProps) {
  const sorted = [...chats].sort((a, b) => b.updatedAt - a.updatedAt)

  return (
    <aside className="flex h-screen w-72 shrink-0 flex-col border-r border-neutral-800 bg-neutral-900 text-neutral-100">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-neutral-800 px-4 py-4">
        <Stethoscope className="size-5 shrink-0 text-emerald-400" />
        <span className="text-sm font-semibold tracking-wide">MedGemma Chat</span>
      </div>

      {/* New chat */}
      <div className="p-3">
        <button
          type="button"
          onClick={onNewChat}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2.5 text-sm font-medium transition-colors hover:bg-neutral-700"
        >
          <Plus className="size-4" />
          New Chat
        </button>
      </div>

      {/* Chat list */}
      <nav className="flex-1 overflow-y-auto px-3 pb-3">
        {sorted.length === 0 ? (
          <p className="px-2 py-4 text-center text-xs text-neutral-500">
            No chats yet. Start a new conversation.
          </p>
        ) : (
          <ul className="space-y-1">
            {sorted.map((chat) => {
              const isActive = chat.id === activeChatId
              return (
                <li
                  key={chat.id}
                  className={cn(
                    'group flex items-center rounded-lg text-sm transition-colors',
                    isActive
                      ? 'bg-neutral-800 text-neutral-50'
                      : 'text-neutral-300 hover:bg-neutral-800/60',
                  )}
                >
                  <button
                    type="button"
                    onClick={() => onSelectChat(chat.id)}
                    className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2.5 text-left"
                  >
                    <MessageSquare className="size-4 shrink-0 text-neutral-500" />
                    <span className="truncate">{chat.title}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteChat(chat.id)}
                    aria-label={`Delete ${chat.title}`}
                    title="Delete chat"
                    className="mr-2 rounded-md p-1.5 text-neutral-500 transition-colors hover:bg-neutral-700 hover:text-red-400"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </nav>
    </aside>
  )
}
