import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent, ClipboardEvent, DragEvent, KeyboardEvent } from 'react'
import { ImagePlus, SendHorizontal, X } from 'lucide-react'
import { cn } from '../utils/cn'

const MAX_IMAGES = 4
const MAX_IMAGE_BYTES = 10 * 1024 * 1024 // 10 MB

interface PendingImage {
  id: string
  file: File
  previewUrl: string
}

interface ChatInputProps {
  onSend: (text: string, images: File[]) => void
  /** Blocks sending while the model is loading or generating. */
  disabled?: boolean
  /** Progress line shown while `disabled` is true. */
  statusMessage?: string
}

export default function ChatInput({ onSend, disabled = false, statusMessage }: ChatInputProps) {
  const [text, setText] = useState('')
  const [images, setImages] = useState<PendingImage[]>([])
  const [isDragging, setIsDragging] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const dragCounter = useRef(0)
  const imagesRef = useRef<PendingImage[]>([])

  useEffect(() => {
    imagesRef.current = images
  }, [images])

  useEffect(() => {
    return () => {
      imagesRef.current.forEach((img) => URL.revokeObjectURL(img.previewUrl))
    }
  }, [])

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [text])

  const addImages = (files: File[]) => {
    const remaining = MAX_IMAGES - images.length
    if (remaining <= 0) return

    const accepted = files
      .filter((file) => file.type.startsWith('image/') && file.size <= MAX_IMAGE_BYTES)
      .slice(0, remaining)
    if (accepted.length === 0) return

    const next: PendingImage[] = accepted.map((file) => ({
      id: crypto.randomUUID(),
      file,
      previewUrl: URL.createObjectURL(file),
    }))
    setImages((prev) => [...prev, ...next])
  }

  const removeImage = (id: string) => {
    const target = images.find((img) => img.id === id)
    if (target) URL.revokeObjectURL(target.previewUrl)
    setImages((prev) => prev.filter((img) => img.id !== id))
  }

  const clearImages = () => {
    images.forEach((img) => URL.revokeObjectURL(img.previewUrl))
    setImages([])
  }

  const handleSend = () => {
    const trimmed = text.trim()
    if (!trimmed || disabled) return
    onSend(trimmed, images.map((img) => img.file))
    setText('')
    clearImages()
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      handleSend()
    }
  }

  const handlePaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const items = event.clipboardData?.items
    if (!items) return

    const files: File[] = []
    for (const item of items) {
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        const file = item.getAsFile()
        if (file) files.push(file)
      }
    }

    if (files.length > 0) {
      event.preventDefault()
      addImages(files)
    }
  }

  const handleFileInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    addImages(Array.from(event.target.files ?? []))
    event.target.value = ''
  }

  const handleDragEnter = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    dragCounter.current += 1
    setIsDragging(true)
  }

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
  }

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    dragCounter.current -= 1
    if (dragCounter.current <= 0) {
      dragCounter.current = 0
      setIsDragging(false)
    }
  }

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    dragCounter.current = 0
    setIsDragging(false)
    addImages(Array.from(event.dataTransfer.files))
  }

  const canSend = text.trim().length > 0 && !disabled

  return (
    <div className="border-t border-neutral-200 bg-white p-3">
      <div className="mx-auto w-full max-w-3xl">
        <div
          onDragEnter={handleDragEnter}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={cn(
            'relative rounded-2xl border bg-white shadow-sm transition-colors',
            isDragging ? 'border-emerald-400 ring-2 ring-emerald-200' : 'border-neutral-300',
          )}
        >
          {images.length > 0 && (
            <div className="flex flex-wrap gap-2 px-3 pt-3">
              {images.map((img) => (
                <div
                  key={img.id}
                  className="group relative size-16 overflow-hidden rounded-lg border border-neutral-200"
                >
                  <img
                    src={img.previewUrl}
                    alt={img.file.name}
                    className="size-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => removeImage(img.id)}
                    aria-label={`Remove ${img.file.name}`}
                    title="Remove image"
                    className="absolute top-1 right-1 rounded-full bg-neutral-900/70 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
                  >
                    <X className="size-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-end gap-2 p-3">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleFileInputChange}
              className="hidden"
            />

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled || images.length >= MAX_IMAGES}
              aria-label="Attach images"
              title="Attach images"
              className="flex size-9 shrink-0 items-center justify-center rounded-lg text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ImagePlus className="size-5" />
            </button>

            <textarea
              ref={textareaRef}
              value={text}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              rows={1}
              placeholder={
                images.length > 0
                  ? 'Describe these images or ask a question...'
                  : 'Describe the medical images or ask a question...'
              }
              className="max-h-48 flex-1 resize-none overflow-y-auto bg-transparent py-2 text-sm leading-relaxed text-neutral-800 outline-none placeholder:text-neutral-400"
            />

            <button
              type="button"
              onClick={handleSend}
              disabled={!canSend}
              aria-label="Send message"
              title="Send message"
              className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-emerald-600 text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <SendHorizontal className="size-5" />
            </button>
          </div>

          {isDragging && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-2xl bg-emerald-50/80 text-sm font-medium text-emerald-700">
              Drop images here
            </div>
          )}
        </div>

        <p className="mt-2 text-center text-xs text-neutral-400">
          {disabled && statusMessage
            ? statusMessage
            : `Drag & drop, paste, or use the image button - up to ${MAX_IMAGES} images.`}
        </p>
      </div>
    </div>
  )
}