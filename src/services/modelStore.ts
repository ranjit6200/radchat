/**
 * Hugging Face source for the gated MedGemma 1.5 4B-IT LiteRT (vision) model and the
 * browser-side cache used to persist it between sessions.
 *
 * The repo is gated, so downloading requires a Hugging Face access token; the model is
 * stored as a Blob in IndexedDB and streamed to MediaPipe on subsequent loads.
 */

const HF_REPO = 'litert-community/MedGemma-1.5-4B-IT'
const HF_FILE = 'medgemma-1.5-4b-it_q4_block32_vision_ekv2048.litertlm'

/** Direct download URL (requires `Authorization: Bearer <token>`). */
export const MODEL_URL = `https://huggingface.co/${HF_REPO}/resolve/main/${HF_FILE}`

/** Cache key; the version suffix lets us invalidate old artifacts deliberately. */
const MODEL_CACHE_KEY = `${HF_FILE}@v1`

const DB_NAME = 'radchat'
const DB_VERSION = 1
const STORE_NAME = 'models'
const TOKEN_STORAGE_KEY = 'hf_token'

/* ------------------------------- HF token -------------------------------- */

export function getHfToken(): string {
  const fromStorage =
    typeof localStorage !== 'undefined' ? localStorage.getItem(TOKEN_STORAGE_KEY) : null
  if (fromStorage && fromStorage.trim()) return fromStorage.trim()

  const fromEnv = import.meta.env.VITE_HF_TOKEN
  return typeof fromEnv === 'string' ? fromEnv.trim() : ''
}

export function setHfToken(token: string): void {
  if (typeof localStorage === 'undefined') return
  const trimmed = token.trim()
  if (trimmed) localStorage.setItem(TOKEN_STORAGE_KEY, trimmed)
  else localStorage.removeItem(TOKEN_STORAGE_KEY)
}

/* ----------------------------- IndexedDB cache ---------------------------- */

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Unable to open IndexedDB.'))
  })
}

async function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb()
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, mode)
      const request = run(tx.objectStore(STORE_NAME))
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed.'))
    })
  } finally {
    db.close()
  }
}

export async function getCachedModel(): Promise<Blob | null> {
  const blob = await withStore<Blob | undefined>('readonly', (store) => store.get(MODEL_CACHE_KEY))
  return blob instanceof Blob ? blob : null
}

export async function putCachedModel(blob: Blob): Promise<void> {
  await withStore<IDBValidKey>('readwrite', (store) => store.put(blob, MODEL_CACHE_KEY))
}

export async function deleteCachedModel(): Promise<void> {
  await withStore<undefined>('readwrite', (store) => store.delete(MODEL_CACHE_KEY))
}

/* ------------------------------- Downloader ------------------------------- */

export interface DownloadProgress {
  receivedBytes: number
  totalBytes: number | null
  /** Integer percentage when the server reports a content length, else null. */
  percent: number | null
}

/**
 * Streams the model from Hugging Face, reporting progress as chunks arrive, and
 * returns the downloaded bytes as a Blob.
 */
export async function downloadModel(
  url: string,
  token: string,
  onProgress?: (progress: DownloadProgress) => void,
): Promise<Blob> {
  const headers: Record<string, string> = {}
  if (token) headers.Authorization = `Bearer ${token}`

  const response = await fetch(url, { headers })
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error(
        `Hugging Face denied access to the gated MedGemma model (HTTP ${response.status}). ` +
          `Accept the license at https://huggingface.co/${HF_REPO} and enter a valid access token.`,
      )
    }
    if (response.status === 404) {
      throw new Error(`Model file not found at ${url}.`)
    }
    throw new Error(`Failed to download the model (HTTP ${response.status}).`)
  }

  const totalHeader = response.headers.get('content-length')
  const totalBytes = totalHeader ? Number(totalHeader) : null

  const reader = response.body?.getReader()
  if (!reader) {
    const blob = await response.blob()
    onProgress?.({ receivedBytes: blob.size, totalBytes: blob.size, percent: 100 })
    return blob
  }

  const chunks: Uint8Array<ArrayBuffer>[] = []
  let receivedBytes = 0

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (!value) continue

    // `slice()` yields an ArrayBuffer-backed copy, which is a valid BlobPart.
    chunks.push(value.slice())
    receivedBytes += value.byteLength
    onProgress?.({
      receivedBytes,
      totalBytes,
      percent: totalBytes ? Math.floor((receivedBytes / totalBytes) * 100) : null,
    })
  }

  return new Blob(chunks, { type: 'application/octet-stream' })
}
