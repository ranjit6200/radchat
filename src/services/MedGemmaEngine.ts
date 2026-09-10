import { FilesetResolver, LlmInference } from '@mediapipe/tasks-genai'
import {
  downloadModel,
  getCachedModel,
  getHfToken,
  MODEL_URL,
  putCachedModel,
} from './modelStore'

/** MediaPipe GenAI Tasks WASM bridge, pinned to the bundled package version. */
const WASM_BASE_PATH = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-genai@0.10.29/wasm'

/** Sampling / context limits for clinical report generation. */
const MAX_TOKENS = 1024
const TOP_K = 40
const TEMPERATURE = 0.2
const RANDOM_SEED = 1

/** Human-readable loading step reporter. */
export type ProgressCallback = (step: string) => void

/**
 * `WasmFileset` is not exported by name from `@mediapipe/tasks-genai`, so we infer
 * it from the resolver's return type to keep the private state strongly typed.
 */
type WasmFileset = Awaited<ReturnType<typeof FilesetResolver.forGenAiTasks>>

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  return 'unknown error'
}

function formatBytes(bytes: number): string {
  const megabytes = bytes / (1024 * 1024)
  if (megabytes < 1024) return `${megabytes.toFixed(0)} MB`
  return `${(megabytes / 1024).toFixed(2)} GB`
}

/**
 * Singleton wrapper around the MediaPipe GenAI `LlmInference` task for MedGemma 1.5.
 *
 * A single `LlmInference` instance owns the ~2.8 GB model in memory, so the engine is
 * shared application-wide via `MedGemmaEngine.getInstance()` rather than instantiated
 * per component.
 */
export class MedGemmaEngine {
  private static instance: MedGemmaEngine | null = null

  private fileset: WasmFileset | null = null
  private llmInference: LlmInference | null = null

  /** In-flight initialization, used to dedupe concurrent `init()` calls. */
  private initPromise: Promise<void> | null = null

  private ready = false
  private generating = false

  private constructor() {}

  static getInstance(): MedGemmaEngine {
    if (!MedGemmaEngine.instance) {
      MedGemmaEngine.instance = new MedGemmaEngine()
    }
    return MedGemmaEngine.instance
  }

  get isReady(): boolean {
    return this.ready
  }

  /**
   * Loads the WASM runtime and the MedGemma model. Safe to call repeatedly: repeat
   * or simultaneous calls resolve against the same underlying initialization.
   */
  async init(onProgress?: ProgressCallback): Promise<void> {
    if (this.ready) return

    const existing = this.initPromise
    if (existing) return existing

    const pending = this.initialize(onProgress).finally(() => {
      this.initPromise = null
    })
    this.initPromise = pending
    return pending
  }

  private async initialize(onProgress?: ProgressCallback): Promise<void> {
    onProgress?.('Downloading model runtime...')
    try {
      this.fileset = await FilesetResolver.forGenAiTasks(WASM_BASE_PATH)
    } catch (caught) {
      throw new Error(`Failed to load the MediaPipe GenAI runtime: ${describeError(caught)}`)
    }

    const modelBlob = await this.resolveModelBlob(onProgress)

    onProgress?.('Loading model into memory (this can take a while)...')
    try {
      this.llmInference = await LlmInference.createFromOptions(this.fileset, {
        baseOptions: {
          // The available MedGemma 1.5 4B-IT vision .litertlm is a CPU (int4) build with
          // no GPU ("gpu_artisan") section, so inference must run on the CPU delegate.
          delegate: 'CPU',
          modelAssetBuffer: modelBlob.stream().getReader(),
        },
        maxTokens: MAX_TOKENS,
        topK: TOP_K,
        temperature: TEMPERATURE,
        randomSeed: RANDOM_SEED,
      })
    } catch (caught) {
      throw new Error(`Failed to load the MedGemma model: ${describeError(caught)}`)
    }

    this.ready = true
    onProgress?.('Model ready.')
  }

  /** Loads the model from the browser cache, downloading from Hugging Face on first use. */
  private async resolveModelBlob(onProgress?: ProgressCallback): Promise<Blob> {
    onProgress?.('Checking the browser cache for the model...')
    const cached = await getCachedModel()
    if (cached) {
      onProgress?.('Model found in the browser cache.')
      return cached
    }

    onProgress?.('Downloading MedGemma from Hugging Face (first run)...')
    let lastPercent = -1
    const blob = await downloadModel(MODEL_URL, getHfToken(), (progress) => {
      if (progress.percent === null) {
        onProgress?.(`Downloading MedGemma (${formatBytes(progress.receivedBytes)})...`)
      } else if (progress.percent !== lastPercent) {
        lastPercent = progress.percent
        onProgress?.(`Downloading MedGemma from Hugging Face... ${progress.percent}%`)
      }
    })

    onProgress?.('Saving the model to the browser cache...')
    try {
      await putCachedModel(blob)
    } catch (caught) {
      // Caching is best-effort: a quota failure must not block using the model.
      console.warn('[MedGemmaEngine] Could not cache the model in IndexedDB:', caught)
    }

    return blob
  }

  /**
   * Sends a text instruction plus a preprocessed image canvas to MedGemma and returns
   * the generated report. Rejects if the engine is not initialized, if the prompt is
   * empty, or if another generation is already running (the MediaPipe task allows only
   * one active `generateResponse` call at a time).
   */
  async analyze(prompt: string, processedCanvas?: HTMLCanvasElement): Promise<string> {
    if (!this.ready || !this.llmInference) {
      throw new Error('MedGemmaEngine is not initialized. Call init() before analyze().')
    }
    if (!prompt.trim()) {
      throw new Error('analyze() requires a non-empty prompt.')
    }
    if (this.generating) {
      throw new Error('A generation is already in progress. Wait for it to finish.')
    }

    this.generating = true
    try {
      const query = processedCanvas
        ? [prompt, { imageSource: processedCanvas }]
        : prompt
      return await this.llmInference.generateResponse(query)
    } finally {
      this.generating = false
    }
  }

  /** Releases the WASM/model resources held by the task. */
  dispose(): void {
    this.llmInference?.close()
    this.llmInference = null
    this.fileset = null
    this.ready = false
    this.generating = false
  }
}
