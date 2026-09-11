import type { ReactNode } from 'react'
import {
  AlertTriangle,
  ChevronDown,
  ClipboardCheck,
  ClipboardList,
  Eye,
  FileText,
  Lightbulb,
  ListChecks,
} from 'lucide-react'
import { cn } from '../utils/cn'
import type { ClinicalFindings, Urgency } from '../types'
import Markdown from './Markdown'

const URGENCY_STYLES: Record<Urgency, { label: string; badge: string }> = {
  routine: { label: 'Routine', badge: 'bg-emerald-100 text-emerald-700 ring-emerald-600/20' },
  urgent: { label: 'Urgent', badge: 'bg-amber-100 text-amber-700 ring-amber-600/20' },
  emergent: { label: 'Emergent', badge: 'bg-red-100 text-red-700 ring-red-600/20' },
}

interface SectionTitleProps {
  icon: ReactNode
  children: ReactNode
}

function SectionTitle({ icon, children }: SectionTitleProps) {
  return (
    <h5 className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-neutral-500 uppercase">
      {icon}
      {children}
    </h5>
  )
}

interface StructuredViewProps {
  data: ClinicalFindings
}

export default function StructuredView({ data }: StructuredViewProps) {
  const urgency = data.urgency ? URGENCY_STYLES[data.urgency] : null
  const findings = data.findings ?? []
  const differentials = data.differentialDiagnoses ?? []
  const recommendations = data.recommendations ?? []

  return (
    <div className="w-full space-y-4 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 border-b border-neutral-100 pb-3">
        <div className="flex items-center gap-2">
          <FileText className="size-4 shrink-0 text-emerald-600" />
          <h4 className="text-sm font-semibold text-neutral-900">
            {data.study ?? 'Clinical Findings'}
          </h4>
        </div>
        {urgency && (
          <span
            className={cn(
              'inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset',
              urgency.badge,
            )}
          >
            {data.urgency === 'emergent' && <AlertTriangle className="size-3" />}
            {urgency.label}
          </span>
        )}
      </div>

      {/* Model visual reasoning (collapsible) */}
      {data.visualAnalysis && (
        <details className="group rounded-lg border border-neutral-200 bg-neutral-50/70">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-lg px-3 py-2 outline-none focus-visible:ring-2 focus-visible:ring-emerald-200 [&::-webkit-details-marker]:hidden">
            <span className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-neutral-500 uppercase">
              <Eye className="size-3.5" />
              Model Visual Reasoning Path
            </span>
            <ChevronDown className="size-4 shrink-0 text-neutral-400 transition-transform group-open:rotate-180" />
          </summary>
          <div className="border-t border-neutral-200 px-3 py-2.5 text-xs leading-relaxed text-neutral-600">
            <Markdown>{data.visualAnalysis}</Markdown>
          </div>
        </details>
      )}

      {/* Findings */}
      {findings.length > 0 && (
        <section>
          <SectionTitle icon={<ClipboardList className="size-3.5" />}>Findings</SectionTitle>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-neutral-700 marker:text-neutral-400">
            {findings.map((finding, index) => (
              <li key={index}>
                <Markdown>{finding}</Markdown>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Impression */}
      {data.impression && (
        <section className="rounded-lg border border-emerald-200 bg-emerald-50/70 p-3">
          <SectionTitle icon={<Lightbulb className="size-3.5 text-emerald-600" />}>
            <span className="text-emerald-700">Impression</span>
          </SectionTitle>
          <div className="mt-1.5 text-sm font-medium text-neutral-800">
            <Markdown>{data.impression}</Markdown>
          </div>
        </section>
      )}

      {/* Differential diagnoses */}
      {differentials.length > 0 && (
        <section>
          <SectionTitle icon={<ListChecks className="size-3.5" />}>
            Differential Diagnoses
          </SectionTitle>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {differentials.map((diagnosis, index) => (
              <span
                key={index}
                className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-medium text-neutral-700 ring-1 ring-inset ring-neutral-200"
              >
                {diagnosis}
              </span>
            ))}
          </div>
        </section>
      )}

      {/* Recommendations */}
      {recommendations.length > 0 && (
        <section>
          <SectionTitle icon={<ClipboardCheck className="size-3.5" />}>
            Recommendations
          </SectionTitle>
          <ul className="mt-2 space-y-1.5 text-sm text-neutral-700">
            {recommendations.map((recommendation, index) => (
              <li key={index} className="flex items-start gap-2">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-emerald-500" />
                <div className="min-w-0 flex-1">
                  <Markdown>{recommendation}</Markdown>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
