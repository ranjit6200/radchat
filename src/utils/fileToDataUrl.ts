/**
 * Converts an image file into a base64 data URL suitable for an OpenAI-compatible
 * `image_url` content part. Large images are downscaled to keep request payloads
 * reasonable.
 */

const MAX_DIMENSION = 1568

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

    ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight)

    // Keep PNG lossless (screenshots/annotations); everything else uses JPEG.
    const isPng = file.type === 'image/png'
    return isPng ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', 0.9)
  } finally {
    bitmap.close()
  }
}
