/**
 * Converts an image file into a base64 data URL suitable for an OpenAI-compatible
 * `image_url` content part.
 *
 * Images are re-encoded losslessly as PNG so no compression artifacts are
 * introduced before the model sees them. Only images larger than MAX_DIMENSION are
 * downscaled (with high-quality resampling) to keep payloads reasonable - the
 * backend performs the final model-sized resize.
 */

const MAX_DIMENSION = 2048

export async function fileToDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file)

  try {
    const { width, height } = bitmap
    const scale = Math.min(1, MAX_DIMENSION / Math.max(width, height))
    const targetWidth = Math.max(1, Math.round(width * scale))
    const targetHeight = Math.max(1, Math.round(height * scale))

    const canvas = document.createElement('canvas')
    canvas.width = targetWidth
    canvas.height = targetHeight

    const ctx = canvas.getContext('2d')
    if (!ctx) {
      throw new Error('Failed to acquire a 2D canvas context for image conversion.')
    }

    // High-quality resampling preserves fine detail (fractures, small nodules).
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight)

    // Lossless PNG: avoids JPEG artifacts on subtle findings. The backend
    // re-encodes to PNG at the model input size regardless.
    return canvas.toDataURL('image/png')
  } finally {
    bitmap.close()
  }
}