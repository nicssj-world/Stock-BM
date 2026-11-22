// Instrument-comparison charts as plain SVG with no hooks, so both the interactive
// view (client) and the printable report (server component) can render them.
import type { ComparePair, CompareScale, CompareSummary } from '@/lib/instcomp/compare'
import type { InstCompStudy } from '@/lib/instcomp/types'

export type ChartStudy = Pick<InstCompStudy, 'scale' | 'pairLimit' | 'referenceLabel' | 'candidateLabel'>

export function fmt(value: number | null | undefined, digits = 3) {
  return value == null || !Number.isFinite(value) ? '—' : value.toFixed(digits)
}

export function diffUnit(scale: CompareScale) {
  return scale === 'log10' ? 'log' : '%'
}

const W = 420
const H = 260
const PAD = { left: 48, right: 14, top: 14, bottom: 36 }

function scaleLinear(domain: [number, number], range: [number, number]) {
  const [d0, d1] = domain
  const [r0, r1] = range
  const span = d1 - d0 || 1
  return (value: number) => r0 + ((value - d0) / span) * (r1 - r0)
}

function padDomain(values: number[], extra = 0.1): [number, number] {
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || Math.abs(max) || 1
  return [min - span * extra, max + span * extra]
}

function ticks([min, max]: [number, number], count = 5) {
  const step = (max - min) / (count - 1)
  return Array.from({ length: count }, (_, index) => min + step * index)
}

function ChartFrame({ title, xLabel, yLabel, children, x, y }: { title: string; xLabel: string; yLabel: string; children: React.ReactNode; x: [number, number]; y: [number, number] }) {
  const sx = scaleLinear(x, [PAD.left, W - PAD.right])
  const sy = scaleLinear(y, [H - PAD.bottom, PAD.top])
  return (
    <figure className="instcomp-chart rounded-md border border-[#e1ebec] bg-white p-3">
      <figcaption className="mb-1 text-xs font-bold text-[#315763]">{title}</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={title}>
        {ticks(y).map((value) => (
          <g key={`y${value}`}>
            <line x1={PAD.left} x2={W - PAD.right} y1={sy(value)} y2={sy(value)} stroke="#edf2f2" />
            <text x={PAD.left - 6} y={sy(value) + 3} textAnchor="end" fontSize="9" fill="#789097">{value.toFixed(2)}</text>
          </g>
        ))}
        {ticks(x).map((value) => (
          <text key={`x${value}`} x={sx(value)} y={H - PAD.bottom + 14} textAnchor="middle" fontSize="9" fill="#789097">{value.toFixed(2)}</text>
        ))}
        <text x={(PAD.left + W - PAD.right) / 2} y={H - 4} textAnchor="middle" fontSize="10" fill="#58747d">{xLabel}</text>
        <text x={12} y={(PAD.top + H - PAD.bottom) / 2} textAnchor="middle" fontSize="10" fill="#58747d" transform={`rotate(-90 12 ${(PAD.top + H - PAD.bottom) / 2})`}>{yLabel}</text>
        {children}
      </svg>
    </figure>
  )
}

export function BlandAltmanChart({ pairs, summary, study }: { pairs: ComparePair[]; summary: CompareSummary; study: ChartStudy }) {
  const points = pairs.filter((pair) => pair.category === 'quantitative')
  const unit = diffUnit(study.scale)
  const xValues = points.map((pair) => pair.mean as number)
  const yValues = [...points.map((pair) => pair.difference as number), study.pairLimit, -study.pairLimit, summary.loaLower ?? 0, summary.loaUpper ?? 0]
  const x = padDomain(xValues)
  const y = padDomain(yValues, 0.08)
  const sx = scaleLinear(x, [PAD.left, W - PAD.right])
  const sy = scaleLinear(y, [H - PAD.bottom, PAD.top])
  const line = (value: number, color: string, dash: string, label: string, side: 'start' | 'end' = 'end') => (
    <g>
      <line x1={PAD.left} x2={W - PAD.right} y1={sy(value)} y2={sy(value)} stroke={color} strokeDasharray={dash} strokeWidth="1.2" />
      <text x={side === 'end' ? W - PAD.right - 2 : PAD.left + 4} y={sy(value) - 3} textAnchor={side} fontSize="9" fill={color} paintOrder="stroke" stroke="#ffffff" strokeWidth="3">{label}</text>
    </g>
  )
  return (
    <ChartFrame title="Bland-Altman" xLabel={study.scale === 'log10' ? 'ค่าเฉลี่ยของสองเครื่อง (log10)' : 'ค่าเฉลี่ยของสองเครื่อง'} yLabel={`ผลต่าง ใหม่ − เดิม (${unit})`} x={x} y={y}>
      {line(0, '#9aafb4', '0', '0')}
      {line(study.pairLimit, '#c02a37', '2 3', `+${study.pairLimit} เกณฑ์`)}
      {line(-study.pairLimit, '#c02a37', '2 3', `−${study.pairLimit} เกณฑ์`)}
      {summary.meanBias != null ? line(summary.meanBias, '#0b7f76', '0', `bias ${fmt(summary.meanBias)}`, 'start') : null}
      {summary.loaUpper != null ? line(summary.loaUpper, '#a9700f', '5 3', `+1.96SD ${fmt(summary.loaUpper)}`) : null}
      {summary.loaLower != null ? line(summary.loaLower, '#a9700f', '5 3', `−1.96SD ${fmt(summary.loaLower)}`) : null}
      {points.map((pair) => (
        <circle key={pair.rowNo} cx={sx(pair.mean as number)} cy={sy(pair.difference as number)} r="3.5" fill={pair.withinPairLimit ? '#0b7f76' : '#c02a37'} fillOpacity="0.8">
          <title>{`${pair.sampleLabel ?? `#${pair.rowNo}`}: ${fmt(pair.difference)} ${unit}`}</title>
        </circle>
      ))}
    </ChartFrame>
  )
}

export function ScatterChart({ pairs, study }: { pairs: ComparePair[]; study: ChartStudy }) {
  const points = pairs.filter((pair) => pair.category === 'quantitative')
  const all = points.flatMap((pair) => [pair.referenceStat as number, pair.candidateStat as number])
  const domain = padDomain(all, 0.05)
  const sx = scaleLinear(domain, [PAD.left, W - PAD.right])
  const sy = scaleLinear(domain, [H - PAD.bottom, PAD.top])
  const axis = study.scale === 'log10' ? ' (log10)' : ''
  return (
    <ChartFrame title="Scatter · เส้นทแยง = ผลตรงกัน" xLabel={`${study.referenceLabel}${axis}`} yLabel={`${study.candidateLabel}${axis}`} x={domain} y={domain}>
      <line x1={sx(domain[0])} y1={sy(domain[0])} x2={sx(domain[1])} y2={sy(domain[1])} stroke="#9aafb4" strokeDasharray="4 3" />
      {points.map((pair) => (
        <circle key={pair.rowNo} cx={sx(pair.referenceStat as number)} cy={sy(pair.candidateStat as number)} r="3.5" fill={pair.withinPairLimit ? '#0b7f76' : '#c02a37'} fillOpacity="0.8">
          <title>{`${pair.sampleLabel ?? `#${pair.rowNo}`}: ${fmt(pair.referenceStat)} → ${fmt(pair.candidateStat)}`}</title>
        </circle>
      ))}
    </ChartFrame>
  )
}
