import { useCallback, useEffect, useRef, useState } from 'react'
import { MedGemmaEngine } from '../services/MedGemmaEngine'

const IDLE_STATUS = 'Model not initialized.'

export interface UseMedGemmaResult {
  /** True once the WASM runtime and model have finished loading. */
  isReady: boolean
  /** True while the engine is downloading/loading the model. */
  isInitializing: boolean
  /** True while a generation request is in flight. */
  isGenerating: boolean
  /** Last error message, or null when the engine is healthy. */
  error: string | null
  /** Human-readable progress/status line for the UI. */
  statusMessage: string
  /** Downloads/loads the engine, reporting progress through `statusMessage`. */
  initEngine: () => Promise<void>
  /** Runs multimodal analysis and returns the report, or null on failure. */
  generateAnalysis: (
    prompt: string,
    processedCanvas?: HTMLCanvasElement,
  ) => Promise<string | null>
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  return 'An unknown error occurred.'
}

/**
 * React state wrapper around the {@link MedGemmaEngine} singleton. Exposes readiness,
 * progress, and error state plus `initEngine` / `generateAnalysis` runners that keep
 * the flags in sync during async work.
 */
export function useMedGemma(): UseMedGemmaResult {
  const [isReady, setIsReady] = useState(false)
  const [isInitializing, setIsInitializing] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [statusMessage, setStatusMessage] = useState(IDLE_STATUS)

  const isMountedRef = useRef(true)
  const generatingRef = useRef(false)

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  const initEngine = useCallback(async (): Promise<void> => {
    setError(null)
    setIsInitializing(true)
    setStatusMessage('Preparing model...')

    try {
      await MedGemmaEngine.getInstance().init((step) => {
        if (isMountedRef.current) setStatusMessage(step)
      })
      if (!isMountedRef.current) return
      setIsReady(true)
      setStatusMessage('Model ready.')
    } catch (caught) {
      console.error('[useMedGemma] Failed to initialize MedGemmaEngine:', caught)
      if (isMountedRef.current) {
        setError(toErrorMessage(caught))
        setStatusMessage('Failed to initialize model.')
      }
    } finally {
      if (isMountedRef.current) setIsInitializing(false)
    }
  }, [])

  const generateAnalysis = useCallback(
    async (prompt: string, processedCanvas?: HTMLCanvasElement): Promise<string | null> => {
      if (generatingRef.current) return null

      generatingRef.current = true
      setError(null)
      setIsGenerating(true)
      setStatusMessage('Analyzing image...')

      try {
        const result = await MedGemmaEngine.getInstance().analyze(prompt, processedCanvas)
        if (isMountedRef.current) setStatusMessage('Analysis complete.')
        return result
      } catch (caught) {
        if (isMountedRef.current) {
          setError(toErrorMessage(caught))
          setStatusMessage('Analysis failed.')
        }
        return null
      } finally {
        generatingRef.current = false
        if (isMountedRef.current) setIsGenerating(false)
      }
    },
    [],
  )

  return {
    isReady,
    isInitializing,
    isGenerating,
    error,
    statusMessage,
    initEngine,
    generateAnalysis,
  }
}
