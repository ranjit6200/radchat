import type { ChatContentPart, ChatMessage } from '../services/llmClient'
import type { Message } from '../types'

/**
 * System directive sent as the first chat message. It pins the model to a
 * radiology-assistant persona and forces a single JSON object matching the
 * `ClinicalFindings` schema so the UI can render structured cards.
 */
export const SYSTEM_PROMPT = [
  'You are MedGemma, an expert clinical radiology assistant.',
  'Analyze the provided medical image (when present) together with the clinician instruction.',
  'Base your assessment only on visible evidence and state uncertainty explicitly.',
  'Do not invent patient identifiers or values that are not visible in the image.',
  '',
  'Respond with a SINGLE JSON object and no additional prose or markdown fences.',
  'The object MUST use this exact shape:',
  '{',
  '  "study": string,                     // imaging study / modality, if identifiable',
  '  "findings": string[],                // observed findings, one per array item',
  '  "impression": string,                // concise summary interpretation',
  '  "differentialDiagnoses": string[],   // ranked differentials',
  '  "recommendations": string[],         // suggested next steps / follow-up',
  '  "urgency": "routine" | "urgent" | "emergent"',
  '}',
  'Omit optional fields only when they genuinely do not apply.',
].join('\n')

function buildUserContent(text: string, imageDataUrls: string[]): string | ChatContentPart[] {
  const trimmed = text.trim()
  if (imageDataUrls.length === 0) return trimmed

  const parts: ChatContentPart[] = []
  if (trimmed) parts.push({ type: 'text', text: trimmed })
  for (const url of imageDataUrls) {
    parts.push({ type: 'image_url', image_url: { url } })
  }
  return parts
}

/**
 * Converts the in-memory transcript (plus the system prompt) into the message
 * array expected by an OpenAI-compatible chat completions request.
 */
export function buildMessages(messages: Message[]): ChatMessage[] {
  const result: ChatMessage[] = [{ role: 'system', content: SYSTEM_PROMPT }]

  for (const message of messages) {
    if (message.role === 'user') {
      const imageDataUrls = (message.images ?? []).map((image) => image.dataUrl)
      result.push({ role: 'user', content: buildUserContent(message.content, imageDataUrls) })
    } else if (message.role === 'assistant') {
      result.push({ role: 'assistant', content: message.content })
    }
  }

  return result
}
