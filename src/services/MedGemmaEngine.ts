import { FilesetResolver, LlmInference } from '@mediapipe/tasks-genai'

/** MediaPipe GenAI Tasks WASM bridge, pinned to the bundled package version. */
const WASM_BASE_PATH = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-genai@0.10.29/wasm'

/** Locally bundled MedGemma 1.5 4B-IT artifact (served by Vite from `public/`). */
const MODEL_ASSET_PATH = '/models/medgemma-1.5-4b-it_q4_block32_vision_ekv2048.litertlm'

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

/**
 * MedGemma 1.5 4B-IT (Q4) is a GPU-only build, so it cannot load without WebGPU.
 * Fail fast with an actionable message instead of an opaque task error.
 */
function assertWebGpuAvailable(): void {
  const gpu =
    typeof navigator === 'undefined' ? undefined : (navigator as { gpu?: unknown }).gpu
  if (!gpu) {
    throw new Error(
      'WebGPU is not available in this browser. MedGemma 1.5 4B-IT (Q4) requires a ' +
        'WebGPU-capable browser such as a recent Chrome or Edge with hardware acceleration enabled.',
    )
  }
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
    onProgress?.('Checking WebGPU support...')
    assertWebGpuAvailable()

    onProgress?.('Downloading model runtime...')
    try {
      this.fileset = await FilesetResolver.forGenAiTasks(WASM_BASE_PATH)
    } catch (caught) {
      throw new Error(`Failed to load the MediaPipe GenAI runtime: ${describeError(caught)}`)
    }

    onProgress?.('Loading MedGemma 1.5 4B-IT model (this can take a while)...')
    try {
      this.llmInference = await LlmInference.createFromOptions(this.fileset, {
        baseOptions: {
          modelAssetPath: MODEL_ASSET_PATH,
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
