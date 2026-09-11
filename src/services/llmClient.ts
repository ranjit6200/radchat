/**
 * Minimal OpenAI-compatible chat completions client with multimodal (vision) support.
 *
 * Works against any server that exposes the `/chat/completions` endpoint (OpenAI,
 * DeepSeek, Ollama, LM Studio, vLLM, etc.). Provider-specific defaults and prompt
 * quirks live in `./providers`; this module only handles configuration storage and
 * the HTTP request/response cycle.
 */

import {
  DEFAULT_PROVIDER,
  getProvider,
  isProviderId,
  type ProviderId,
} from './providers'

const CONFIG_STORAGE_KEY = 'openai_api_config'

export interface ApiConfig {
  /** Active provider profile. */
  provider: ProviderId
  /** Base URL, e.g. "https://api.openai.com/v1" or "https://api.deepseek.com". */
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
  /** Nucleus sampling probability. Omitted from the request when undefined. */
  topP?: number
  /** Top-k sampling cutoff. Omitted from the request when undefined. */
  topK?: number
  maxTokens?: number
  /** Ask the server to force a JSON object response where supported. */
  jsonMode?: boolean
}

function readEnv(key: string): string {
  const value = (import.meta.env as Record<string, unknown>)[key]
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * Optional env fallbacks. Applied only to the default (MedGemma) provider so
 * deployments configured purely through `VITE_OPENAI_*` variables keep working,
 * without leaking those values into other providers.
 */
const ENV_DEFAULTS = {
  baseUrl: readEnv('VITE_OPENAI_BASE_URL'),
  apiKey: readEnv('VITE_OPENAI_API_KEY'),
  model: readEnv('VITE_OPENAI_MODEL'),
}

/** Values persisted for a single provider. */
interface SavedConfig {
  baseUrl: string
  apiKey: string
  model: string
}

interface StoredState {
  activeProvider: ProviderId
  configs: Partial<Record<ProviderId, SavedConfig>>
}

function toSavedConfig(value: unknown): SavedConfig | null {
  if (typeof value !== 'object' || value === null) return null
  const record = value as Record<string, unknown>
  return {
    baseUrl: typeof record.baseUrl === 'string' ? record.baseUrl : '',
    apiKey: typeof record.apiKey === 'string' ? record.apiKey : '',
    model: typeof record.model === 'string' ? record.model : '',
  }
}

/**
 * Reads the persisted state, transparently migrating the legacy single-config
 * shape (`{ baseUrl, apiKey, model }`) under the default provider.
 */
function readState(): StoredState {
  const empty: StoredState = { activeProvider: DEFAULT_PROVIDER, configs: {} }
  if (typeof localStorage === 'undefined') return empty

  let raw: string | null = null
  try {
    raw = localStorage.getItem(CONFIG_STORAGE_KEY)
  } catch {
    return empty
  }
  if (!raw) return empty

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return empty
  }
  if (typeof parsed !== 'object' || parsed === null) return empty

  const record = parsed as Record<string, unknown>

  // Current shape: { activeProvider, configs: { [providerId]: SavedConfig } }.
  if (typeof record.configs === 'object' && record.configs !== null) {
    const configs: Partial<Record<ProviderId, SavedConfig>> = {}
    for (const [key, value] of Object.entries(record.configs as Record<string, unknown>)) {
      if (!isProviderId(key)) continue
      const saved = toSavedConfig(value)
      if (saved) configs[key] = saved
    }
    return {
      activeProvider: isProviderId(record.activeProvider)
        ? record.activeProvider
        : DEFAULT_PROVIDER,
      configs,
    }
  }

  // Legacy shape: migrate it under the default provider.
  const legacy = toSavedConfig(record)
  if (!legacy) return empty
  return { activeProvider: DEFAULT_PROVIDER, configs: { [DEFAULT_PROVIDER]: legacy } }
}

function writeState(state: StoredState): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Ignore storage failures (e.g. private mode); the in-memory config still works.
  }
}

/** Merges saved values with the profile defaults and legacy env fallbacks. */
function resolveConfig(provider: ProviderId, saved: SavedConfig | undefined): ApiConfig {
  const profile = getProvider(provider)
  const useEnv = provider === DEFAULT_PROVIDER
  return {
    provider,
    baseUrl: saved?.baseUrl.trim() || profile.defaultBaseUrl || (useEnv ? ENV_DEFAULTS.baseUrl : ''),
    apiKey: saved?.apiKey.trim() || (useEnv ? ENV_DEFAULTS.apiKey : ''),
    model: saved?.model.trim() || profile.defaultModel || (useEnv ? ENV_DEFAULTS.model : ''),
  }
}

/** Loads the active provider configuration (with defaults applied). */
export function getApiConfig(): ApiConfig {
  const state = readState()
  return resolveConfig(state.activeProvider, state.configs[state.activeProvider])
}

/** Persists a configuration under its provider and makes that provider active. */
export function saveApiConfig(config: ApiConfig): void {
  const provider = isProviderId(config.provider) ? config.provider : DEFAULT_PROVIDER
  const state = readState()
  state.activeProvider = provider
  state.configs[provider] = {
    baseUrl: config.baseUrl.trim(),
    apiKey: config.apiKey.trim(),
    model: config.model.trim(),
  }
  writeState(state)
}

/**
 * Switches the active provider and returns its saved configuration. Values saved
 * for every provider (including the one being left) are preserved, so switching
 * back restores them.
 */
export function selectProvider(provider: ProviderId): ApiConfig {
  const next = isProviderId(provider) ? provider : DEFAULT_PROVIDER
  const state = readState()
  state.activeProvider = next
  writeState(state)
  return resolveConfig(next, state.configs[next])
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
  choices?: Array<{ message?: { content?: unknown; reasoning_content?: unknown } }>
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
  if (options.topP !== undefined) body.top_p = options.topP
  if (options.topK !== undefined) body.top_k = options.topK
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
  const message = data.choices?.[0]?.message
  // llama.cpp can route the generated text into `reasoning_content` when a reasoning
  // format is configured; fall back to it so the response is never lost.
  const content = extractContent(message?.content) ?? extractContent(message?.reasoning_content)
  if (content === null) {
    throw new Error('The API response did not contain any message content.')
  }
  return content
}