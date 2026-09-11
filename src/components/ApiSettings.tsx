import { cn } from '../utils/cn'
import { isApiConfigured, type ApiConfig } from '../services/llmClient'
import { getProvider, PROVIDER_LIST, type ProviderId } from '../services/providers'

interface ApiSettingsProps {
  config: ApiConfig
  onChange: (config: ApiConfig) => void
  onProviderChange: (provider: ProviderId) => void
}

const inputClass =
  'h-8 min-w-0 rounded-md border border-neutral-300 bg-white px-2 text-xs text-neutral-800 outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-200'

/**
 * Slim bar for configuring the OpenAI-compatible endpoint. The provider selector
 * swaps the active profile (defaults + prompt behaviour); values are persisted as
 * they are edited so they survive reloads.
 */
export default function ApiSettings({ config, onChange, onProviderChange }: ApiSettingsProps) {
  const configured = isApiConfigured(config)
  const profile = getProvider(config.provider)

  const update = (patch: Partial<ApiConfig>) => onChange({ ...config, ...patch })

  return (
    <div className="border-b border-neutral-200 bg-white">
      <div className="mx-auto flex w-full max-w-3xl flex-wrap items-center gap-2 px-4 py-2.5">
        <span className="shrink-0 text-xs font-medium text-neutral-500">API</span>

        <select
          className={cn(inputClass, 'shrink-0')}
          value={config.provider}
          onChange={(event) => onProviderChange(event.target.value as ProviderId)}
          aria-label="Provider"
        >
          {PROVIDER_LIST.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {candidate.label}
            </option>
          ))}
        </select>

        <input
          className={cn(inputClass, 'flex-1')}
          value={config.baseUrl}
          onChange={(event) => update({ baseUrl: event.target.value })}
          placeholder={profile.defaultBaseUrl || 'Base URL (e.g. https://api.openai.com/v1)'}
          autoComplete="off"
          spellCheck={false}
        />

        <input
          className={cn(inputClass, 'flex-1')}
          type="password"
          value={config.apiKey}
          onChange={(event) => update({ apiKey: event.target.value })}
          placeholder="API key"
          autoComplete="off"
          spellCheck={false}
        />

        <input
          className={cn(inputClass, 'w-40 shrink-0')}
          value={config.model}
          onChange={(event) => update({ model: event.target.value })}
          placeholder={profile.defaultModel || 'Model'}
          autoComplete="off"
          spellCheck={false}
        />

        <span
          className={cn(
            'shrink-0 text-xs font-medium',
            configured ? 'text-emerald-600' : 'text-amber-600',
          )}
        >
          {configured ? 'Ready' : 'Not configured'}
        </span>
      </div>
    </div>
  )
}