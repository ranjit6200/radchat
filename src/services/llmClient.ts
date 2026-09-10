/**
 * Minimal OpenAI-compatible chat completions client with multimodal (vision) support.
 *
 * Works against any server that exposes the `/chat/completions` endpoint (OpenAI,
 * Ollama, LM Studio, vLLM, etc.). Configuration is persisted in localStorage so it
 * survives reloads, with optional Vite env defaults.
 */

const CONFIG_STORAGE_KEY = 'openai_api_config'

export interface ApiConfig {
  /** Base URL, e.g. "https://api.openai.com/v1" or "http://localhost:11434/v1". */
  baseUrl: string
  apiKey: string
  model: string
}

export type ChatContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string | ChatContentPart[]
}

export interface ChatCompletionOptions {
  temperature?: number
  maxTokens?: number
  /** Ask the server to force a JSON object response where supported. */
  jsonMode?: boolean
}

function readEnv(key: string): string {
  const value = (import.meta.env as Record<string, unknown>)[key]
  return typeof value === 'string' ? value.trim() : ''
}

const ENV_DEFAULTS: ApiConfig = {
  baseUrl: readEnv('VITE_OPENAI_BASE_URL'),
  apiKey: readEnv('VITE_OPENAI_API_KEY'),
  model: readEnv('VITE_OPENAI_MODEL'),
}

export function getApiConfig(): ApiConfig {
  let stored: Partial<ApiConfig> = {}
  if (typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem(CONFIG_STORAGE_KEY)
      if (raw) stored = JSON.parse(raw) as Partial<ApiConfig>
    } catch {
      stored = {}
    }
  }

  return {
    baseUrl: stored.baseUrl?.trim() || ENV_DEFAULTS.baseUrl,
    apiKey: stored.apiKey?.trim() || ENV_DEFAULTS.apiKey,
    model: stored.model?.trim() || ENV_DEFAULTS.model,
  }
}

export function saveApiConfig(config: ApiConfig): void {
  if (typeof localStorage === 'undefined') return
  const normalized: ApiConfig = {
    baseUrl: config.baseUrl.trim(),
    apiKey: config.apiKey.trim(),
    model: config.model.trim(),
  }
  localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(normalized))
}

export function isApiConfigured(config: ApiConfig): boolean {
  return config.baseUrl.trim().length > 0 && config.model.trim().length > 0
}

/** Resolves the full chat completions URL from a (possibly partial) base URL. */
function completionsUrl(baseUrl: string): string {
  const trimmed = baseUrl.replace(/\/+$/, '')
  return trimmed.endsWith('/chat/completions') ? trimmed : `${trimmed}/chat/completions`
}

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: unknown } }>
}

function extractContent(content: unknown): string | null {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (part && typeof part === 'object' && 'text' in part) {
          const value = (part as { text?: unknown }).text
          return typeof value === 'string' ? value : ''
        }
        return ''
      })
      .join('')
  }
  return null
}

async function readErrorDetail(response: Response): Promise<string> {
  try {
    const text = await response.text()
    if (!text) return ''
    try {
      const parsed = JSON.parse(text) as { error?: { message?: string }; message?: string }
      return parsed.error?.message ?? parsed.message ?? text.slice(0, 300)
    } catch {
      return text.slice(0, 300)
    }
  } catch {
    return ''
  }
}

/**
 * Sends a chat completion request and returns the assistant message content.
 * Throws with a readable message on configuration, network, or HTTP errors.
 */
export async function chatCompletion(
  config: ApiConfig,
  messages: ChatMessage[],
  options: ChatCompletionOptions = {},
): Promise<string> {
  if (!isApiConfigured(config)) {
    throw new Error('The API endpoint is not configured. Set the base URL and model first.')
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`

  const body: Record<string, unknown> = {
    model: config.model,
    messages,
    temperature: options.temperature ?? 0.2,
    max_tokens: options.maxTokens ?? 1024,
  }
  if (options.jsonMode) {
    body.response_format = { type: 'json_object' }
  }

  let response: Response
  try {
    response = await fetch(completionsUrl(config.baseUrl), {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    })
  } catch (caught) {
    const reason = caught instanceof Error ? caught.message : 'unknown error'
    throw new Error(`Network error contacting ${config.baseUrl}: ${reason}`)
  }

  if (!response.ok) {
    const detail = await readErrorDetail(response)
    throw new Error(`Request failed (HTTP ${response.status})${detail ? `: ${detail}` : ''}`)
  }

  const data = (await response.json()) as ChatCompletionResponse
  const content = extractContent(data.choices?.[0]?.message?.content)
  if (content === null) {
    throw new Error('The API response did not contain any message content.')
  }
  return content
}
