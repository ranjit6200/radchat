import type { ChatContentPart, ChatMessage } from '../services/llmClient'
import { getProvider, type ProviderId, type ProviderProfile } from '../services/providers'
import type { Message } from '../types'

/**
 * Builds the multimodal user content for a message. Image/text ordering and the
 * fallback prompt come from the active provider profile so Gemma 3 (images
 * first) and DeepSeek (text first) can share one pipeline.
 */
function buildUserContent(
  text: string,
  imageDataUrls: string[],
  profile: ProviderProfile,
): string | ChatContentPart[] {
  const trimmed = text.trim()
  if (imageDataUrls.length === 0) return trimmed

  const textPart: ChatContentPart = { type: 'text', text: trimmed || profile.fallbackUserPrompt }
  const imageParts: ChatContentPart[] = imageDataUrls.map((url) => ({
    type: 'image_url',
    image_url: { url },
  }))

  return profile.imagesFirst ? [...imageParts, textPart] : [textPart, ...imageParts]
}

/**
 * Converts the in-memory transcript (plus the provider system prompt) into the
 * message array expected by an OpenAI-compatible chat completions request.
 */
export function buildMessages(messages: Message[], providerId?: ProviderId): ChatMessage[] {
  const profile = getProvider(providerId)
  const result: ChatMessage[] = [{ role: 'system', content: profile.systemPrompt }]

  for (const message of messages) {
    if (message.role === 'user') {
      const imageDataUrls = (message.images ?? []).map((image) => image.dataUrl)
      result.push({
        role: 'user',
        content: buildUserContent(message.content, imageDataUrls, profile),
      })
    } else if (message.role === 'assistant') {
      result.push({ role: 'assistant', content: message.content })
    }
  }

  return result
}