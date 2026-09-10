import { useCallback, useState } from 'react'
import Sidebar from './components/Sidebar'
import ChatWindow from './components/ChatWindow'
import ChatInput from './components/ChatInput'
import type { ChatSession } from './types'

interface ChatState {
  chats: ChatSession[]
  activeChatId: string | null
}

const NEW_CHAT_TITLE = 'New Chat'

function createChat(): ChatSession {
  const now = Date.now()
  return {
    id: crypto.randomUUID(),
    title: NEW_CHAT_TITLE,
    createdAt: now,
    updatedAt: now,
    messages: [],
  }
}

export default function App() {
  const [state, setState] = useState<ChatState>({ chats: [], activeChatId: null })

  const createNewChat = useCallback(() => {
    const chat = createChat()
    setState((prev) => ({
      chats: [chat, ...prev.chats],
      activeChatId: chat.id,
    }))
  }, [])

  const selectChat = useCallback((id: string) => {
    setState((prev) => ({ ...prev, activeChatId: id }))
  }, [])

  const deleteChat = useCallback((id: string) => {
    setState((prev) => {
      const chats = prev.chats.filter((chat) => chat.id !== id)
      let activeChatId = prev.activeChatId

      // If the active chat was deleted, activate the most recently updated
      // remaining chat (or none if the list is now empty).
      if (activeChatId === id) {
        const next = [...chats].sort((a, b) => b.updatedAt - a.updatedAt)[0]
        activeChatId = next ? next.id : null
      }

      return { chats, activeChatId }
    })
  }, [])

  const sendMessage = useCallback((text: string, _images: File[]) => {
    const trimmed = text.trim()
    if (!trimmed) return
    setState((prev) => {
      if (!prev.activeChatId) return prev
      const chats = prev.chats.map((chat) =>
        chat.id === prev.activeChatId
          ? {
              ...chat,
              updatedAt: Date.now(),
              messages: [
                ...chat.messages,
                { id: crypto.randomUUID(), role: 'user' as const, content: trimmed },
              ],
            }
          : chat,
      )
      return { ...prev, chats }
    })
  }, [])

  const activeChat = state.chats.find((chat) => chat.id === state.activeChatId) ?? null

  return (
    <div className="flex h-screen w-full overflow-hidden bg-neutral-100 text-neutral-900">
      <Sidebar
        chats={state.chats}
        activeChatId={state.activeChatId}
        onNewChat={createNewChat}
        onSelectChat={selectChat}
        onDeleteChat={deleteChat}
      />

      <main className="flex flex-1 flex-col">
        {activeChat ? (
          <>
            <ChatWindow messages={activeChat.messages} />
            <ChatInput key={activeChat.id} onSend={sendMessage} />
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
            <div className="text-4xl">🩺</div>
            <h2 className="text-lg font-semibold">
              {state.chats.length === 0 ? 'No conversations yet' : 'Select a conversation'}
            </h2>
            <p className="max-w-md text-sm text-neutral-500">
              {state.chats.length === 0
                ? 'Start a new chat to begin a clinical discussion with MedGemma.'
                : 'Choose a chat from the sidebar or start a new one.'}
            </p>
            <button
              type="button"
              onClick={createNewChat}
              className="mt-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-500"
            >
              Start a new chat
            </button>
          </div>
        )}
      </main>
    </div>
  )
}