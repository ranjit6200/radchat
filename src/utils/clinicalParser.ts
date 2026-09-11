import type { ClinicalFindings, Urgency } from '../types'

const URGENCY_VALUES: readonly Urgency[] = ['routine', 'urgent', 'emergent']

/** Strips a leading/trailing markdown code fence, if present. */
function stripCodeFence(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  return fenced ? fenced[1] : raw
}

/**
 * Returns the first balanced `{ ... }` block in `text`, ignoring braces that appear
 * inside JSON string literals.
 */
function extractBalancedObject(text: string): string | null {
  const start = text.indexOf('{')
  if (start === -1) return null

  let depth = 0
  let inString = false
  let escaped = false

  for (let i = start; i < text.length; i += 1) {
    const char = text[i]

    if (inString) {
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') inString = false
      continue
    }

    if (char === '"') inString = true
    else if (char === '{') depth += 1
    else if (char === '}') {
      depth -= 1
      if (depth === 0) return text.slice(start, i + 1)
    }
  }

  return null
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
}

function toOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function toUrgency(value: unknown): Urgency | undefined {
  if (typeof value !== 'string') return undefined
  const normalized = value.trim().toLowerCase()
  return (URGENCY_VALUES as readonly string[]).includes(normalized)
    ? (normalized as Urgency)
    : undefined
}

/**
 * Parses MedGemma's raw output into a structured {@link ClinicalFindings} record.
 * Accepts a JSON object wrapped in prose or markdown fences and returns `null` when
 * no valid object can be recovered, letting callers fall back to rendering the raw
 * markdown response.
 */
export function parseClinicalFindings(raw: string): ClinicalFindings | null {
  if (!raw || !raw.trim()) return null

  const json = extractBalancedObject(stripCodeFence(raw))
  if (!json) return null

  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    return null
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return null
  }

  const record = parsed as Record<string, unknown>
  const findings = toStringArray(record.findings)
  const impression = toOptionalString(record.impression)

  if (findings.length === 0 && !impression) return null

  const result: ClinicalFindings = {
    findings,
    impression: impression ?? '',
  }

  // Parses the new backend buffer parameter used to give the multi-modal
  // engine cross-attention processing space before printing clinical prose.
  const visualAnalysis = toOptionalString(record.visual_analysis)
  if (visualAnalysis) result.visualAnalysis = visualAnalysis

  const study = toOptionalString(record.study)
  if (study) result.study = study

  const differentialDiagnoses = toStringArray(record.differentialDiagnoses)
  if (differentialDiagnoses.length > 0) result.differentialDiagnoses = differentialDiagnoses

  const recommendations = toStringArray(record.recommendations)
  if (recommendations.length > 0) result.recommendations = recommendations

  const urgency = toUrgency(record.urgency)
  if (urgency) result.urgency = urgency

  return result
}
