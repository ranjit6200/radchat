/**
 * Provider profiles keep the client endpoint-agnostic.
 *
 * Every supported backend speaks the OpenAI `/chat/completions` protocol, but
 * they differ in defaults and behavioural quirks (prompt wording, image/text
 * ordering, sampling, JSON-mode rules). Each profile bundles those differences so
 * the request pipeline itself stays generic.
 *
 * Adding a provider = appending a profile below.
 */

export type ProviderId = 'medgemma' | 'deepseek'

export interface ProviderProfile {
  /** Stable id persisted with the saved configuration. */
  id: ProviderId
  /** Human-readable name shown in the settings bar. */
  label: string
  /** Default base URL; empty means "no default" (falls back to env / user input). */
  defaultBaseUrl: string
  /** Default model id; empty means "no default" (falls back to env / user input). */
  defaultModel: string
  /** Whether to send `response_format: { type: 'json_object' }`. */
  jsonMode: boolean
  /** Sampling temperature passed to the model. */
  temperature: number
  /** Nucleus sampling probability; omitted from the request when undefined. */
  topP?: number
  /** Top-k sampling cutoff; omitted from the request when undefined. */
  topK?: number
  /** Upper bound on generated tokens. */
  maxTokens: number
  /**
   * Content-part ordering for multimodal requests. Gemma 3 expects images
   * before text; DeepSeek's docs place text before the image.
   */
  imagesFirst: boolean
  /** System directive pinning the persona and output contract. */
  systemPrompt: string
  /** Fallback text used when an image is attached without any typed text. */
  fallbackUserPrompt: string
}

// --- MedGemma (self-hosted llama.cpp / Modal) -------------------------------

/**
 * MedGemma is a medical specialist, so it gets a radiology-specific free-form
 * directive (no JSON contract). Images are sent first and the user fallback keeps
 * Gemma image-first formatting.
 */
const MEDGEMMA_SYSTEM_PROMPT = [
  'You are MedGemma, a senior clinical radiologist.',
  'Methodically examine the attached medical image(s) and answer the question accurately and concisely.',
  'When asked for a report, review every anatomical region first, then state the findings and a brief impression.',
  'If a finding is uncertain or not visible, say so; never invent findings.',
].join('\n')

const MEDGEMMA_USER_PROMPT = 'Describe this image.'

// --- DeepSeek ---------------------------------------------------------------

/** DeepSeek uses a generic radiology-assistant persona with the same free-form flow. */
const DEEPSEEK_SYSTEM_PROMPT = [
  'You are a helpful radiology assistant.',
  "Answer the user's question about the attached medical image(s) accurately and concisely.",
  'If the user attaches an image without a specific question, describe the key findings.',
].join('\n')

const DEEPSEEK_USER_PROMPT = 'Describe this image.'

export const PROVIDERS: Record<ProviderId, ProviderProfile> = {
  medgemma: {
    id: 'medgemma',
    label: 'MedGemma (self-hosted)',
    defaultBaseUrl: '',
    defaultModel: '',
    jsonMode: false,
    // Gemma 3 / MedGemma instruct models are tuned for temperature 1.0 with
    // top_p 0.95 and top_k 64; lower temperatures degrade report quality.
    temperature: 0.4,
    topP: 0.95,
    topK: 64,
    maxTokens: 2048,
    imagesFirst: true,
    systemPrompt: MEDGEMMA_SYSTEM_PROMPT,
    fallbackUserPrompt: MEDGEMMA_USER_PROMPT,
  },
  deepseek: {
    id: 'deepseek',
    label: 'DeepSeek',
    defaultBaseUrl: 'https://api.deepseek.com',
    defaultModel: 'deepseek-flash',
    jsonMode: false,
    temperature: 0.0,
    maxTokens: 4096,
    imagesFirst: false,
    systemPrompt: DEEPSEEK_SYSTEM_PROMPT,
    fallbackUserPrompt: DEEPSEEK_USER_PROMPT,
  },
}

export const PROVIDER_LIST: readonly ProviderProfile[] = Object.values(PROVIDERS)

/**
 * Provider assumed when nothing has been saved yet. Keeps existing MedGemma
 * setups working without any change.
 */
export const DEFAULT_PROVIDER: ProviderId = 'medgemma'

export function isProviderId(value: unknown): value is ProviderId {
  return (
    typeof value === 'string' && Object.prototype.hasOwnProperty.call(PROVIDERS, value)
  )
}

/** Resolves a profile, falling back to the default provider for unknown ids. */
export function getProvider(id: ProviderId | undefined): ProviderProfile {
  return isProviderId(id) ? PROVIDERS[id] : PROVIDERS[DEFAULT_PROVIDER]
}