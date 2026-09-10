import { useState } from 'react'
import { Download, KeyRound, Loader2 } from 'lucide-react'
import { cn } from '../utils/cn'
import { getHfToken, setHfToken } from '../services/modelStore'

interface ModelControlsProps {
  isReady: boolean
  isInitializing: boolean
  error: string | null
  statusMessage: string
  onDownload: () => void
}

/**
 * Slim control bar for loading the on-device model: a Hugging Face token field (the
 * model is gated) and an explicit "Download model" action so the ~3 GB download never
 * starts automatically.
 */
export default function ModelControls({
  isReady,
  isInitializing,
  error,
  statusMessage,
  onDownload,
}: ModelControlsProps) {
  const [token, setToken] = useState(() => getHfToken())

  const handleTokenChange = (value: string) => {
    setToken(value)
    setHfToken(value)
  }

  const buttonLabel = isReady ? 'Model ready' : isInitializing ? 'Downloading...' : 'Download model'

  return (
    <div className="border-b border-neutral-200 bg-white">
      <div className="mx-auto flex w-full max-w-3xl flex-wrap items-center gap-2 px-4 py-2.5">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <KeyRound className="size-4 shrink-0 text-neutral-400" />
          <input
            type="password"
            value={token}
            onChange={(event) => handleTokenChange(event.target.value)}
            placeholder="Hugging Face token (required for the gated download)"
            autoComplete="off"
            spellCheck={false}
            className="h-8 w-full min-w-0 rounded-md border border-neutral-300 bg-white px-2 text-xs text-neutral-800 outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-200"
          />
        </div>

        <button
          type="button"
          onClick={onDownload}
          disabled={isReady || isInitializing}
          className="flex h-8 shrink-0 items-center gap-1.5 rounded-md bg-emerald-600 px-3 text-xs font-medium text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isInitializing ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Download className="size-3.5" />
          )}
          {buttonLabel}
        </button>
      </div>

      <div className="mx-auto w-full max-w-3xl px-4 pb-2.5">
        <p className={cn('text-xs', error ? 'text-red-600' : 'text-neutral-500')}>
          {error ?? statusMessage}
        </p>
      </div>
    </div>
  )
}
