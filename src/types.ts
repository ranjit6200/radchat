export type Role = 'user' | 'assistant' | 'system'

export type Urgency = 'routine' | 'urgent' | 'emergent'

/**
 * Structured clinical findings emitted by MedGemma (radiology report schema).
 * `content` on a Message carries the markdown prose; `structured` carries the
 * parsed findings that StructuredView renders as cards.
 */
export interface ClinicalFindings {
  study?: string
  findings: string[]
  impression: string
  differentialDiagnoses?: string[]
  recommendations?: string[]
  urgency?: Urgency
}

/** Image attached to a message; `dataUrl` powers both display and API inputs. */
export interface ChatImage {
  id: string
  name: string
  dataUrl: string
}

export interface Message {
  id: string
  role: Role
  content: string
  structured?: ClinicalFindings
  /** Images attached to a user message, retained for display in the transcript. */
  images?: ChatImage[]
}

export interface ChatSession {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  messages: Message[]
}
