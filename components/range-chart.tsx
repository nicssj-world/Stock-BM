'use client'

import type { EnvReadingPoint } from '@/lib/env/types'
import { formatDate } from '@/lib/bm/rules'

const W = 720
const H = 220
const PAD = { top: 14, right: 14, bottom: 26, left: 44 }
const PLOT_W = W - PAD.left - PAD.right
const PLOT_H = H - PAD.top - PAD.bottom

const STATUS_COLOR: Record<string, string> = { 'in-range': '#16a34a', 'out-of-range': '#dc2626', corrected: '#d97706' }

function fmt(value: number) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value)
}

// Trend chart for a monitored unit: green acceptable band between min/max limits,
// red zones outside, status-coloured + shaped markers (●=in-range, ✖=out-of-range,
// ◆=corrected) so meaning never relies on colour alone.
export function RangeChart({
  points,
  minLimit,
  maxLimit,
  unit,
  label,
  metricLabel = 'Temperature',
}: {
  points: EnvReadingPoint[]
  minLimit: number | null
  maxLimit: number | null
  unit: string
  label: string
  metricLabel?: string
}) {
  const values = points.map((p) => p.value)
  const bounds = [...values, ...(minLimit != null ? [minLimit] : []), ...(maxLimit != null ? [maxLimit] : [])]
  if (!bounds.length) {
    return <p className="rounded-md border border-[#e3ebec] bg-[#f8fbfb] px-3 py-6 text-center text-xs text-[#91a4a9]">ยังไม่มีข้อมูล / No {metricLabel.toLowerCase()} readings yet</p>
  }
  const rawMax = Math.max(...bounds)
  const rawMin = Math.min(...bounds)
  const span = rawMax - rawMin || 1
  const yMax = rawMax + span * 0.15
  const yMin = rawMin - span * 0.15

  function xAt(index: number) {
    if (points.length <= 1) return PAD.left + PLOT_W / 2
    return PAD.left + (index / (points.length - 1)) * PLOT_W
  }
  function yAt(value: number) {
    const clamped = Math.max(yMin, Math.min(yMax, value))
    return PAD.top + ((yMax - clamped) / (yMax - yMin)) * PLOT_H
  }

  const bandTop = maxLimit != null ? yAt(maxLimit) : PAD.top
  const bandBottom = minLimit != null ? yAt(minLimit) : PAD.top + PLOT_H

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`${metricLabel} trend for ${label}`}>
      <title>{`${metricLabel} trend: ${label}`}</title>
      {/* out-of-range background */}
      <rect x={PAD.left} y={PAD.top} width={PLOT_W} height={PLOT_H} fill="#fdecee" />
      {/* acceptable band */}
      <rect x={PAD.left} y={bandTop} width={PLOT_W} height={Math.max(0, bandBottom - bandTop)} fill="#eaf7ef" />

      {maxLimit != null ? <line x1={PAD.left} x2={PAD.left + PLOT_W} y1={yAt(maxLimit)} y2={yAt(maxLimit)} stroke="#e7a6ab" strokeWidth={1} strokeDasharray="3 3" /> : null}
      {minLimit != null ? <line x1={PAD.left} x2={PAD.left + PLOT_W} y1={yAt(minLimit)} y2={yAt(minLimit)} stroke="#e7a6ab" strokeWidth={1} strokeDasharray="3 3" /> : null}

      {maxLimit != null ? <text x={PAD.left - 6} y={yAt(maxLimit) + 3} textAnchor="end" fontSize={9} fill="#a9700f">{fmt(maxLimit)}</text> : null}
      {minLimit != null ? <text x={PAD.left - 6} y={yAt(minLimit) + 3} textAnchor="end" fontSize={9} fill="#a9700f">{fmt(minLimit)}</text> : null}

      <polyline points={points.map((p, i) => `${xAt(i)},${yAt(p.value)}`).join(' ')} fill="none" stroke="#9fb6bd" strokeWidth={1.2} />

      {points.map((p, i) => {
        const x = xAt(i)
        const y = yAt(p.value)
        const color = STATUS_COLOR[p.status] ?? '#16a34a'
        const tip = `${formatDate(p.readingDate)} · ${fmt(p.value)} ${unit} · ${p.status}`
        const node =
          p.status === 'out-of-range' ? (
            <g stroke={color} strokeWidth={2}>
              <line x1={x - 3.5} y1={y - 3.5} x2={x + 3.5} y2={y + 3.5} />
              <line x1={x - 3.5} y1={y + 3.5} x2={x + 3.5} y2={y - 3.5} />
            </g>
          ) : p.status === 'corrected' ? (
            <rect x={x - 3} y={y - 3} width={6} height={6} fill={color} transform={`rotate(45 ${x} ${y})`} />
          ) : (
            <circle cx={x} cy={y} r={3.2} fill={color} />
          )
        return (
          <g key={p.id}>
            {node}
            <circle cx={x} cy={y} r={8} fill="transparent">
              <title>{tip}</title>
            </circle>
          </g>
        )
      })}
    </svg>
  )
}
