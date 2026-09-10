import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertCircle } from 'lucide-react'
import Sidebar from './components/Sidebar'
import ChatWindow from './components/ChatWindow'
import ChatInput from './components/ChatInput'
import { useMedGemma } from './hooks/useMedGemma'
import { preprocessToCanvas } from './utils/imageProcessor'
import { buildPrompt } from './utils/promptBuilder'
import { parseClinicalFindings } from './utils/clinicalParser'
import type { ChatImage, ChatSession, ClinicalFindings, Message } from './types'

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
  const [isBusy, setIsBusy] = useState(false)
  const { error, statusMessage, initEngine, generateAnalysis } = useMedGemma()
  const objectUrlsRef = useRef<Set<string>>(new Set())

  // Release any object URLs created for message previews when the app unmounts.
  useEffect(() => {
    const urls = objectUrlsRef.current
    return () => {
      urls.forEach((url) => URL.revokeObjectURL(url))
      urls.clear()
    }
  }, [])

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

  const deleteChat = useCallback(
    (id: string) => {
      // Revoke the deleted chat's image previews before dropping the state.
      const target = state.chats.find((chat) => chat.id === id)
      target?.messages.forEach((message) =>
        message.images?.forEach((image) => {
          URL.revokeObjectURL(image.previewUrl)
          objectUrlsRef.current.delete(image.previewUrl)
        }),
      )

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
    },
    [state.chats],
  )

  const sendMessage = useCallback(
    async (text: string, images: File[]) => {
      const trimmed = text.trim()
      if (!trimmed) return

      const chatId = state.activeChatId
      if (!chatId) return

      const chatImages: ChatImage[] = images.map((file) => {
        const previewUrl = URL.createObjectURL(file)
        objectUrlsRef.current.add(previewUrl)
        return { id: crypto.randomUUID(), name: file.name, previewUrl }
      })

      const appendMessage = (message: Message) => {
        setState((prev) => ({
          ...prev,
          chats: prev.chats.map((chat) =>
            chat.id === chatId
              ? { ...chat, updatedAt: Date.now(), messages: [...chat.messages, message] }
              : chat,
          ),
        }))
      }

      // Show the user's message (and attachments) immediately.
      appendMessage({
        id: crypto.randomUUID(),
        role: 'user',
        content: trimmed,
        images: chatImages.length > 0 ? chatImages : undefined,
      })

      setIsBusy(true)
      try {
        await initEngine()

        const canvas = images.length > 0 ? await preprocessToCanvas(images[0]) : undefined
        const raw = await generateAnalysis(buildPrompt(trimmed), canvas)

        if (!raw) {
          appendMessage({
            id: crypto.randomUUID(),
            role: 'assistant',
            content: 'I was unable to generate a response. Please try again.',
          })
          return
        }

        const structured: ClinicalFindings | undefined =
          parseClinicalFindings(raw) ?? undefined

        appendMessage({
          id: crypto.randomUUID(),
          role: 'assistant',
          content: raw,
          structured,
        })
      } catch (caught) {
        appendMessage({
          id: crypto.randomUUID(),
          role: 'assistant',
          content:
            caught instanceof Error
              ? caught.message
              : 'Something went wrong while contacting MedGemma.',
        })
      } finally {
        setIsBusy(false)
      }
    },
    [state.activeChatId, initEngine, generateAnalysis],
  )

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
            {error && (
              <div className="mx-auto flex w-full max-w-3xl items-center gap-2 px-4 pt-3 text-sm text-red-600">
                <AlertCircle className="size-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}
            <ChatInput
              key={activeChat.id}
              onSend={sendMessage}
              disabled={isBusy}
              statusMessage={statusMessage}
            />
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