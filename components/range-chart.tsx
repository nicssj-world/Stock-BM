'use client'

import type { EnvReadingPoint } from '@/lib/env/types'
import { formatDate } from '@/lib/bm/rules'

const W = 720
const H = 240
const PAD = { top: 24, right: 62, bottom: 42, left: 54 }
const PLOT_W = W - PAD.left - PAD.right
const PLOT_H = H - PAD.top - PAD.bottom

const STATUS_COLOR: Record<string, string> = { 'in-range': '#16a34a', 'out-of-range': '#dc2626', corrected: '#d97706' }
const PERIOD_SHORT_LABEL: Record<number, string> = { 1: 'ช', 2: 'บ', 3: 'ด' }

function fmt(value: number) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value)
}

function readingDate(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  if (Number.isFinite(year) && Number.isFinite(month) && Number.isFinite(day)) return new Date(year, month - 1, day)
  return new Date(value)
}

function formatChartDay(point: EnvReadingPoint, showPeriodLabel: boolean) {
  const day = new Intl.DateTimeFormat('th-TH-u-ca-buddhist', { day: 'numeric' }).format(readingDate(point.readingDate))
  return showPeriodLabel ? `${day}${PERIOD_SHORT_LABEL[point.periodIndex] ?? point.periodIndex}` : day
}

function formatChartMonth(value: string) {
  return new Intl.DateTimeFormat('th-TH-u-ca-buddhist', { month: 'short', year: 'numeric' }).format(readingDate(value))
}

function formatSavedAt(value?: string | null) {
  if (!value) return null
  return new Intl.DateTimeFormat('th-TH-u-ca-buddhist', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'Asia/Bangkok',
  }).format(new Date(value))
}

function xTickIndexes(length: number) {
  if (length <= 0) return []
  if (length <= 1) return [0]
  if (length <= 4) return Array.from({ length }, (_, i) => i)
  return Array.from(new Set([0, Math.floor((length - 1) / 3), Math.floor(((length - 1) * 2) / 3), length - 1]))
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
  showPeriodLabels = false,
}: {
  points: EnvReadingPoint[]
  minLimit: number | null
  maxLimit: number | null
  unit: string
  label: string
  metricLabel?: string
  showPeriodLabels?: boolean
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
  const yTicks = Array.from({ length: 5 }, (_, i) => yMin + ((yMax - yMin) * i) / 4)
  const tickIndexes = xTickIndexes(points.length)
  const chartMonth = points[0]?.readingDate ? formatChartMonth(points[0].readingDate) : null
  const isHumidity = unit === '%' || metricLabel.toLowerCase().includes('humidity')
  const accent = isHumidity ? '#0b78a3' : '#0b7f76'

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`${metricLabel} trend for ${label}`}>
      <title>{`${metricLabel} trend: ${label}`}</title>
      <text x={PAD.left} y={13} fontSize={10} fontWeight={700} fill={accent}>
        {metricLabel} ({unit})
      </text>
      {chartMonth ? (
        <text x={PAD.left + PLOT_W} y={13} textAnchor="end" fontSize={10} fontWeight={700} fill="#42616a">
          {chartMonth}
        </text>
      ) : null}
      <text x={PAD.left + PLOT_W} y={H - 7} textAnchor="end" fontSize={9} fontWeight={700} fill="#789097">
        Day
      </text>
      <rect x={PAD.left} y={PAD.top} width={PLOT_W} height={PLOT_H} rx={8} fill="#fcfefe" stroke="#d5e5e7" />
      {/* out-of-range background */}
      <rect x={PAD.left + 1} y={PAD.top + 1} width={PLOT_W - 2} height={PLOT_H - 2} rx={7} fill="#fff3f4" />
      {/* acceptable band */}
      <rect x={PAD.left + 1} y={bandTop} width={PLOT_W - 2} height={Math.max(0, bandBottom - bandTop)} fill={isHumidity ? '#edf8fb' : '#ecf8f0'} />

      {yTicks.map((tick) => {
        const y = yAt(tick)
        return (
          <g key={`y-${tick}`}>
            <line x1={PAD.left} x2={PAD.left + PLOT_W} y1={y} y2={y} stroke="#dbe7e9" strokeWidth={0.8} />
            <text x={PAD.left - 8} y={y + 3} textAnchor="end" fontSize={9} fill="#5f757b">
              {fmt(tick)}
            </text>
          </g>
        )
      })}

      <line x1={PAD.left} x2={PAD.left + PLOT_W} y1={PAD.top + PLOT_H} y2={PAD.top + PLOT_H} stroke="#aebfc4" strokeWidth={1} />
      <line x1={PAD.left} x2={PAD.left} y1={PAD.top} y2={PAD.top + PLOT_H} stroke="#aebfc4" strokeWidth={1} />

      {tickIndexes.map((index) => {
        const x = xAt(index)
        const isFirst = index === 0
        const isLast = index === points.length - 1
        const isOnlyTick = isFirst && isLast
        return (
          <g key={`x-${points[index]?.id ?? index}`}>
            <line x1={x} x2={x} y1={PAD.top} y2={PAD.top + PLOT_H} stroke="#e7eff1" strokeWidth={0.8} />
            <line x1={x} x2={x} y1={PAD.top + PLOT_H} y2={PAD.top + PLOT_H + 4} stroke="#aebfc4" strokeWidth={1} />
            <text
              x={x}
              y={PAD.top + PLOT_H + 16}
              textAnchor={isOnlyTick ? 'middle' : isFirst ? 'start' : isLast ? 'end' : 'middle'}
              fontSize={9}
              fill="#5f757b"
            >
              {formatChartDay(points[index], showPeriodLabels)}
            </text>
          </g>
        )
      })}

      {maxLimit != null ? <line x1={PAD.left} x2={PAD.left + PLOT_W} y1={yAt(maxLimit)} y2={yAt(maxLimit)} stroke="#e7a6ab" strokeWidth={1} strokeDasharray="3 3" /> : null}
      {minLimit != null ? <line x1={PAD.left} x2={PAD.left + PLOT_W} y1={yAt(minLimit)} y2={yAt(minLimit)} stroke="#e7a6ab" strokeWidth={1} strokeDasharray="3 3" /> : null}

      {maxLimit != null ? <text x={PAD.left + PLOT_W + 5} y={yAt(maxLimit) + 3} fontSize={9} fill="#a9700f">max {fmt(maxLimit)}</text> : null}
      {minLimit != null ? <text x={PAD.left + PLOT_W + 5} y={yAt(minLimit) + 3} fontSize={9} fill="#a9700f">min {fmt(minLimit)}</text> : null}

      <polyline points={points.map((p, i) => `${xAt(i)},${yAt(p.value)}`).join(' ')} fill="none" stroke="#88a8af" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />

      {points.map((p, i) => {
        const x = xAt(i)
        const y = yAt(p.value)
        const color = STATUS_COLOR[p.status] ?? '#16a34a'
        const measuredAt = `${formatDate(p.readingDate)}${p.readingTime ? ` ${p.readingTime}` : ''}`
        const savedAt = formatSavedAt(p.createdAt)
        const tip = `${measuredAt} · ${fmt(p.value)} ${unit} · ${p.status}${savedAt ? ` · บันทึก ${savedAt}` : ''}`
        const node =
          p.status === 'out-of-range' ? (
            <g stroke={color} strokeWidth={2}>
              <line x1={x - 3.5} y1={y - 3.5} x2={x + 3.5} y2={y + 3.5} />
              <line x1={x - 3.5} y1={y + 3.5} x2={x + 3.5} y2={y - 3.5} />
            </g>
          ) : p.status === 'corrected' ? (
            <rect x={x - 3} y={y - 3} width={6} height={6} fill={color} transform={`rotate(45 ${x} ${y})`} />
          ) : (
            <circle cx={x} cy={y} r={4} fill={color} stroke="white" strokeWidth={1.4} />
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
