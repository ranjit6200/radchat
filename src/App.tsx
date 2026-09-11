import { useCallback, useState } from 'react'
import { AlertCircle } from 'lucide-react'
import Sidebar from './components/Sidebar'
import ChatWindow from './components/ChatWindow'
import ChatInput from './components/ChatInput'
import ApiSettings from './components/ApiSettings'
import { useChatModel } from './hooks/useChatModel'
import {
  getApiConfig,
  isApiConfigured,
  saveApiConfig,
  selectProvider,
  type ApiConfig,
} from './services/llmClient'
import type { ProviderId } from './services/providers'
import { fileToDataUrl } from './utils/fileToDataUrl'
import { buildMessages } from './utils/promptBuilder'
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
  const [apiConfig, setApiConfig] = useState<ApiConfig>(() => getApiConfig())
  const { isGenerating, error, generate } = useChatModel()

  const isConfigured = isApiConfigured(apiConfig)

  const handleConfigChange = useCallback((next: ApiConfig) => {
    saveApiConfig(next)
    setApiConfig(next)
  }, [])

  const handleProviderChange = useCallback((provider: ProviderId) => {
    setApiConfig(selectProvider(provider))
  }, [])

  const createNewChat = useCallback(() => {
    const chat = createChat()
    setState((prev) => ({ chats: [chat, ...prev.chats], activeChatId: chat.id }))
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

  const appendToChat = useCallback((chatId: string, message: Message) => {
    setState((prev) => ({
      ...prev,
      chats: prev.chats.map((chat) =>
        chat.id === chatId
          ? { ...chat, updatedAt: Date.now(), messages: [...chat.messages, message] }
          : chat,
      ),
    }))
  }, [])

  const sendMessage = useCallback(
    async (text: string, images: File[]) => {
      const trimmed = text.trim()
      if (!trimmed && images.length === 0) return

      const chatId = state.activeChatId
      if (!chatId) return

      const chat = state.chats.find((candidate) => candidate.id === chatId)
      if (!chat) return

      let chatImages: ChatImage[] = []
      if (images.length > 0) {
        try {
          chatImages = await Promise.all(
            images.map(async (file) => ({
              id: crypto.randomUUID(),
              name: file.name,
              dataUrl: await fileToDataUrl(file),
            })),
          )
        } catch (caught) {
          console.error('[App] Failed to read an attached image:', caught)
          chatImages = []
        }
      }

      const userMessage: Message = {
        id: crypto.randomUUID(),
        role: 'user',
        content: trimmed,
        images: chatImages.length > 0 ? chatImages : undefined,
      }

      // Show the user's message (and attachments) immediately.
      appendToChat(chatId, userMessage)

      const history = [...chat.messages, userMessage]
      const raw = await generate(buildMessages(history, apiConfig.provider))

      if (!raw) {
        appendToChat(chatId, {
          id: crypto.randomUUID(),
          role: 'assistant',
          content:
            'I was unable to generate a response. Check the API endpoint settings and try again.',
        })
        return
      }

      const structured: ClinicalFindings | undefined = parseClinicalFindings(raw) ?? undefined
      appendToChat(chatId, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: raw,
        structured,
      })
    },
    [state, apiConfig, generate, appendToChat],
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
        <ApiSettings
          config={apiConfig}
          onChange={handleConfigChange}
          onProviderChange={handleProviderChange}
        />

        {error && (
          <div className="mx-auto flex w-full max-w-3xl items-center gap-2 px-4 pt-3 text-sm text-red-600">
            <AlertCircle className="size-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {activeChat ? (
          <>
            <ChatWindow messages={activeChat.messages} />
            <ChatInput
              key={activeChat.id}
              onSend={sendMessage}
              disabled={!isConfigured || isGenerating}
              statusMessage={
                isGenerating
                  ? 'Generating response...'
                  : 'Configure the API endpoint above to start chatting.'
              }
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
                ? 'Start a new chat to begin a clinical discussion.'
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
