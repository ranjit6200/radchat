import { useCallback, useEffect, useRef, useState } from 'react'
import { chatCompletion, getApiConfig, type ChatMessage } from '../services/llmClient'

export interface UseChatModelResult {
  /** True while a generation request is in flight. */
  isGenerating: boolean
  /** Last error message, or null when healthy. */
  error: string | null
  /** Runs a chat completion and returns the raw text (or null on failure). */
  generate: (messages: ChatMessage[]) => Promise<string | null>
}

/**
 * React wrapper around the OpenAI-compatible client. Reads the latest saved API
 * config on every call and keeps request/error state in sync.
 */
export function useChatModel(): UseChatModelResult {
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isMountedRef = useRef(true)
  const generatingRef = useRef(false)

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  const generate = useCallback(async (messages: ChatMessage[]): Promise<string | null> => {
    if (generatingRef.current) return null

    generatingRef.current = true
    setError(null)
    setIsGenerating(true)

    try {
      return await chatCompletion(getApiConfig(), messages, { jsonMode: true })
    } catch (caught) {
      if (isMountedRef.current) {
        setError(caught instanceof Error ? caught.message : 'An unknown error occurred.')
      }
      return null
    } finally {
      generatingRef.current = false
      if (isMountedRef.current) setIsGenerating(false)
    }
  }, [])

  return { isGenerating, error, generate }
}
