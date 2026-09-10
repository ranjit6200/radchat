/**
 * Client-side image preprocessing for MedGemma 1.5 4B-IT (SigLIP vision backbone).
 *
 * The utility transforms an arbitrary image source (PNG, JPEG, or a DICOM canvas
 * render) into a fixed 896x896, letterboxed, 3-channel RGB `HTMLCanvasElement` that
 * can be handed straight to the MediaPipe GenAI task. MediaPipe performs the SigLIP
 * normalization and [1, 896, 896, 3] tensor layout internally when the canvas is
 * passed as an image part of a multimodal `generateResponse` query.
 */

/** Fixed square input size expected by the SigLIP vision encoder. */
export const MODEL_IMAGE_SIZE = 896

/** Any source the browser can decode and draw into a 2D canvas. */
export type ImageInput =
  | File
  | Blob
  | HTMLImageElement
  | HTMLCanvasElement
  | ImageBitmap
  | OffscreenCanvas

type DrawableSource = HTMLImageElement | HTMLCanvasElement | ImageBitmap | OffscreenCanvas

interface Dimensions {
  width: number
  height: number
}

interface ResolvedSource {
  drawable: DrawableSource
  /** Whether `drawable` was created here and must be released after use. */
  owned: boolean
}

async function toDrawable(source: ImageInput): Promise<ResolvedSource> {
  if (source instanceof Blob) {
    return { drawable: await createImageBitmap(source), owned: true }
  }
  if (source instanceof HTMLImageElement) {
    if (!source.complete || source.naturalWidth === 0) {
      await source.decode()
    }
    return { drawable: source, owned: false }
  }
  return { drawable: source, owned: false }
}

function measure(source: DrawableSource): Dimensions {
  if (source instanceof HTMLImageElement) {
    return { width: source.naturalWidth, height: source.naturalHeight }
  }
  return { width: source.width, height: source.height }
}

/**
 * Resizes and letterboxes an image into a 896x896 RGB canvas.
 *
 * Pipeline:
 * 1. Decode the input into a drawable source.
 * 2. Create an off-DOM 896x896 canvas and fill it with opaque black (zero-filled
 *    background for letterbox padding and a composite target for alpha removal).
 * 3. Fit the source inside the square with a high-quality, aspect-preserving scale,
 *    centered horizontally and vertically.
 * 4. Draw the source so grayscale inputs stay R=G=B and RGBA inputs lose their
 *    alpha channel by compositing over black.
 */
export async function preprocessToCanvas(input: ImageInput): Promise<HTMLCanvasElement> {
  const { drawable, owned } = await toDrawable(input)

  try {
    const { width, height } = measure(drawable)
    if (width <= 0 || height <= 0) {
      throw new Error('Cannot preprocess an image with zero width or height.')
    }

    const canvas = document.createElement('canvas')
    canvas.width = MODEL_IMAGE_SIZE
    canvas.height = MODEL_IMAGE_SIZE

    const ctx = canvas.getContext('2d')
    if (!ctx) {
      throw new Error('Failed to acquire a 2D canvas context for image preprocessing.')
    }

    // Zero-filled (black) background: provides letterbox padding and drops alpha.
    ctx.fillStyle = '#000000'
    ctx.fillRect(0, 0, MODEL_IMAGE_SIZE, MODEL_IMAGE_SIZE)

    const scale = Math.min(MODEL_IMAGE_SIZE / width, MODEL_IMAGE_SIZE / height)
    const drawWidth = Math.max(1, Math.round(width * scale))
    const drawHeight = Math.max(1, Math.round(height * scale))
    const offsetX = Math.floor((MODEL_IMAGE_SIZE - drawWidth) / 2)
    const offsetY = Math.floor((MODEL_IMAGE_SIZE - drawHeight) / 2)

    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(drawable, offsetX, offsetY, drawWidth, drawHeight)

    return canvas
  } finally {
    if (owned && drawable instanceof ImageBitmap) {
      drawable.close()
    }
  }
}
