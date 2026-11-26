'use client'

import { useState } from 'react'
import { Table2 } from 'lucide-react'
import { LAB_LOCK_MIN_POINTS, type IqcChart } from '@/lib/iqc/types'
import { formatDateTime } from '@/lib/bm/rules'
import { Button, StatusBadge } from '@/components/ui'
import { VL_BASELINE_MIN_POINTS } from '@/lib/iqc/chart-attention'

const W = 720
const H = 340
const PAD = { top: 30, right: 74, bottom: 46, left: 74 }
const PLOT_W = W - PAD.left - PAD.right
const PLOT_H = H - PAD.top - PAD.bottom
const MAX_X_TICKS = 6
const COA_COLOR = '#2563a8'

const STATUS_COLOR: Record<string, string> = { accepted: '#16a34a', warning: '#d97706', investigate: '#8f5f1d', rejected: '#dc2626', not_evaluated: '#789097' }
const CONSUMABLE_LABEL: Record<string, string> = { 'trucount-tube': 'Trucount', 'staining-reagent': 'Reagent', mastermix: 'Mastermix', reagent: 'Reagent', other: 'Lot' }
type MeanView = 'active' | 'assigned' | 'lab'

function fmt(value: number) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 }).format(value)
}

function runDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function formatRunDay(value: string) {
  const date = runDate(value)
  return date ? new Intl.DateTimeFormat('th-TH-u-ca-buddhist', { day: 'numeric', month: 'short' }).format(date) : '-'
}

function formatRunMonth(value: string) {
  const date = runDate(value)
  return date ? new Intl.DateTimeFormat('th-TH-u-ca-buddhist', { month: 'short', year: 'numeric' }).format(date) : null
}

function safeFormatDateTime(value: string) {
  return runDate(value) ? formatDateTime(value) : '-'
}

function xTickIndexes(length: number) {
  if (length <= 0) return []
  if (length <= MAX_X_TICKS) return Array.from({ length }, (_, i) => i)
  return Array.from(new Set(Array.from({ length: MAX_X_TICKS }, (_, i) => Math.round((i * (length - 1)) / (MAX_X_TICKS - 1)))))
}

function statusLabel(status: IqcChart['status']) {
  return status === 'accepted' ? 'ผ่าน' : status === 'warning' ? 'แจ้งเตือน' : status === 'investigate' ? 'ต้องตรวจสอบ' : status === 'rejected' ? 'Rejected' : 'ยังไม่ประเมิน'
}

function chartShell(status: IqcChart['status']) {
  if (status === 'rejected') return 'border border-[#eba5a5]'
  if (status === 'investigate') return 'border border-[#cdb28a]'
  if (status === 'warning') return 'border border-[#efc48a]'
  if (status === 'not_evaluated') return 'border border-[#d3dfe1]'
  return 'border border-[#b5ddd7]'
}

export function LjChart({
  chart,
  selectedResultId,
  onPointSelect,
}: {
  chart: IqcChart
  selectedResultId?: string | null
  onPointSelect?: (point: IqcChart['points'][number]) => void
}) {
  const [showTable, setShowTable] = useState(false)
  const [meanView, setMeanView] = useState<MeanView>('active')
  const [showVoided, setShowVoided] = useState(false)
  const [hoverId, setHoverId] = useState<string | null>(null)
  const { points } = chart

  const legacyActiveLimitLabel = chart.activeLimit === 'lab' ? 'LAB Mean/SD' : 'Assigned Mean/SD'
  const activeLimitLabel = chart.policyProfile === 'vl-standard-v1' && !chart.baselineId
    ? 'ยังไม่ใช้ตัดสิน'
    : chart.activeLimit === 'baseline' ? 'QC baseline (lab observed)' : legacyActiveLimitLabel
  const meanViews: Record<MeanView, { tab: string; cardLabel: string; label: string; mean: number | null; sd: number | null; detail: string }> = {
    active: {
      tab: 'Active',
      cardLabel: 'ค่าที่ใช้ตัดสินผลตอนนี้ · Active Westgard limit',
      label: activeLimitLabel,
      mean: chart.mean,
      sd: chart.sd,
      detail: 'เกณฑ์ที่ใช้ประเมิน Westgard อยู่ในปัจจุบัน',
    },
    assigned: {
      tab: 'Assigned',
      cardLabel: 'Assigned Mean / SD',
      label: 'Assigned Mean/SD',
      mean: chart.assignedMean,
      sd: chart.assignedSd,
      detail: 'ค่าจากผู้ผลิต / certificate',
    },
    lab: {
      tab: 'LAB',
      cardLabel: 'LAB Mean / SD',
      label: 'LAB Mean/SD',
      // Before the lock the running value stands in, so the card stops reading
      // as "never calculated" once the analyte has enough points.
      mean: chart.labMean ?? chart.runningLabMean,
      sd: chart.labSd ?? chart.runningLabSd,
      detail: chart.labLockedAt
        ? `Locked · n ${chart.labN ?? chart.n}`
        : chart.runningLabMean != null
          ? `คำนวณสด n ${chart.runningLabN} · ยังไม่ lock จึงยังไม่ใช้เป็นเกณฑ์ Westgard`
          : `ยังไม่ครบ ${LAB_LOCK_MIN_POINTS} จุด · ตอนนี้ n ${chart.runningLabN}`,
    },
  }
  const displayedMean = meanViews[meanView]
  const { mean, sd } = displayedMean
  const hasStats = mean != null && sd != null && sd > 0
  // Voided results are recording mistakes or discarded runs: hidden unless asked
  // for (or selected), and never allowed to stretch the y-axis.
  const voidedCount = points.filter((p) => p.isVoided).length
  const selectedIsVoided = points.some((p) => p.isVoided && p.resultId === selectedResultId)
  const voidedShown = showVoided || selectedIsVoided
  const visible = voidedShown ? points : points.filter((p) => !p.isVoided)

  const scaleHint = chart.scale === 'log10' ? ' · log10' : ''
  const xTicks = xTickIndexes(visible.length)
  const monthLabel = visible[0]?.runDatetime ? formatRunMonth(visible[0].runDatetime) : null
  const unitLabel = chart.unit ? ` (${chart.unit})` : ''

  // Manufacturer (CoA) limits are stored on the same scale as statValue.
  const coa = chart.manufacturerLower != null && chart.manufacturerUpper != null && chart.manufacturerUpper > chart.manufacturerLower
    ? { lower: chart.manufacturerLower, upper: chart.manufacturerUpper }
    : null

  // The y-axis always contains every non-void point, the CoA range and ±3SD, so
  // an out-of-range result is drawn where it really is instead of at the edge.
  const usableStatValues = points.filter((p) => !p.isVoided).map((p) => p.statValue)
  const domainValues = [
    ...usableStatValues,
    ...(hasStats ? [mean! - 3 * sd!, mean! + 3 * sd!] : []),
    ...(coa ? [coa.lower, coa.upper] : []),
  ]
  const hasDomain = domainValues.length > 0
  const dataMin = hasDomain ? Math.min(...domainValues) : 0
  const dataMax = hasDomain ? Math.max(...domainValues) : 1
  const domainPad = dataMax > dataMin ? (dataMax - dataMin) * 0.1 : Math.max(Math.abs(dataMax) * 0.1, 0.5)
  const yMin = dataMin - domainPad
  const yMax = dataMax + domainPad

  function xAt(index: number) {
    if (visible.length <= 1) return PAD.left + PLOT_W / 2
    return PAD.left + 10 + (index / (visible.length - 1)) * (PLOT_W - 20)
  }
  function yAt(statValue: number) {
    const clamped = Math.max(yMin, Math.min(yMax, statValue))
    return PAD.top + ((yMax - clamped) / (yMax - yMin)) * PLOT_H
  }
  function band(from: number, to: number, fill: string, key: string) {
    const top = yAt(Math.max(from, to))
    const bottom = yAt(Math.min(from, to))
    return <rect key={key} x={PAD.left + 1} y={top} width={PLOT_W - 2} height={Math.max(0, bottom - top)} fill={fill} />
  }

  // A narrow SD on a wide axis would stack the SD labels on top of each other.
  const sdPixels = hasStats ? (sd! / (yMax - yMin)) * PLOT_H : 0
  const labelledSd = sdPixels >= 24 ? [-3, -2, -1, 0, 1, 2, 3] : sdPixels >= 8 ? [-3, 0, 3] : [0]
  const plainTicks = !hasStats && hasDomain ? [0, 0.25, 0.5, 0.75, 1].map((t) => yMin + t * (yMax - yMin)) : []

  const awaitingBaseline = chart.policyProfile === 'vl-standard-v1' && !chart.baselineId && chart.dataType === 'quantitative'
  const baselineCount = usableStatValues.length
  const latestPoint = [...visible].reverse().find((p) => !p.isVoided)
  const hovered = visible.find((p) => p.resultId === hoverId) ?? null
  const hoveredX = hovered ? xAt(visible.indexOf(hovered)) : 0
  const hoveredY = hovered ? yAt(hovered.statValue) : 0
  const cv = hasStats && mean !== 0 ? (sd! / Math.abs(mean!)) * 100 : null

  return (
    <div className={`paper rounded-lg p-4 transition-shadow duration-200 hover:shadow-md ${chartShell(chart.status)}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-bold text-[#173d50]">{chart.analyteName}</h3>
            <StatusBadge tone={chart.status} label={statusLabel(chart.status)} />
          </div>
          <p className="mt-0.5 text-xs text-[#789097]">
            {chart.controlMaterialName}
            {chart.level ? ` · ${chart.level}` : ''} · Lot {chart.lotNumber}
            {chart.unit ? ` · ${chart.unit}` : ''}
            {scaleHint}
          </p>
          <p className="mt-0.5 text-xs font-semibold text-[#315763]">เครื่อง: {chart.instrumentName ?? 'ไม่ระบุเครื่องมือ (ประวัติเดิม)'}</p>
          {chart.currentConsumables.length ? (
            <div className="mt-1 flex flex-wrap gap-1">
              {chart.currentConsumables.map((c) => (
                <span key={c.kind} className="inline-flex items-center rounded border border-[#cfe0e2] bg-[#f3f9f9] px-1.5 py-0.5 text-[10px] font-semibold text-[#3f6470]" title={`${CONSUMABLE_LABEL[c.kind] ?? c.kind} lot ปัจจุบัน`}>
                  {CONSUMABLE_LABEL[c.kind] ?? c.kind} {c.lotNumber}
                </span>
              ))}
            </div>
          ) : null}
        </div>
        <div className="inline-flex rounded-md border border-[#cfe0e2] bg-[#f3f9f9] p-0.5" role="group" aria-label="เลือกค่า Mean/SD ที่แสดงบนกราฟ">
          {(Object.keys(meanViews) as MeanView[]).map((view) => {
            const option = meanViews[view]
            const selected = meanView === view
            return (
              <button
                key={view}
                type="button"
                aria-pressed={selected}
                title={option.cardLabel}
                onClick={() => setMeanView(view)}
                className={`min-h-8 rounded px-3 text-xs font-bold transition focus-visible:ring-2 focus-visible:ring-[#0b7f76] focus-visible:outline-none ${selected ? 'bg-white text-[#0b7f76] shadow-sm' : 'text-[#5b7681] hover:text-[#173d50]'}`}
              >
                {option.tab}
              </button>
            )
          })}
        </div>
      </div>

      <div className="mt-3 rounded-md bg-[#f6fafa] px-3 py-2">
        <p className="text-xs text-[#315763]">
          <span className="font-bold text-[#173d50]">{displayedMean.label}</span>
          <span className="mono ml-2 tabular-nums">Mean {mean != null ? fmt(mean) : '—'} · SD {sd != null ? fmt(sd) : '—'} · CV {cv != null ? `${cv.toFixed(1)}%` : '—'} · n {chart.n}</span>
        </p>
        <p className="mt-0.5 text-[11px] text-[#6d8389]">
          {displayedMean.cardLabel} · {hasStats || meanView === 'lab' ? displayedMean.detail : 'ยังไม่มีค่า mean/SD ให้แสดง'}
        </p>
      </div>
      <p className="mt-1 text-[10px] text-[#789097]">กดปุ่มเพื่อเปลี่ยนเส้นและสเกลของกราฟสำหรับเปรียบเทียบ · สีสถานะและ z-score ยังคำนวณตาม Active Westgard limit</p>

      {awaitingBaseline ? (
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <span className="text-xs font-bold text-[#8a5b0c]">{baselineCount >= VL_BASELINE_MIN_POINTS ? `ครบ ${VL_BASELINE_MIN_POINTS} จุดแล้ว · รอ Admin อนุมัติ QC baseline` : `รอ QC baseline ${baselineCount}/${VL_BASELINE_MIN_POINTS} จุด`}</span>
          <div className="h-2 min-w-40 flex-1 overflow-hidden rounded-full bg-[#f1e6cf]" role="progressbar" aria-label="จำนวนจุดสำหรับ QC baseline" aria-valuemin={0} aria-valuemax={VL_BASELINE_MIN_POINTS} aria-valuenow={Math.min(baselineCount, VL_BASELINE_MIN_POINTS)}>
            <div className="h-full rounded-full bg-[#d99a2b]" style={{ width: `${Math.min(100, (baselineCount / VL_BASELINE_MIN_POINTS) * 100)}%` }} />
          </div>
        </div>
      ) : null}

      {!showTable ? (
        <div className="relative mt-3">
          <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" role="img" aria-label={`Levey-Jennings chart for ${chart.analyteName}`}>
            <text x={PAD.left} y={16} fontSize={13} fontWeight={700} fill="#173d50">
              {chart.scale === 'log10' ? `log10 Value${unitLabel}` : `Value${unitLabel}`}
            </text>
            {monthLabel ? (
              <text x={PAD.left + PLOT_W} y={16} textAnchor="end" fontSize={13} fontWeight={700} fill="#173d50">
                {monthLabel}
              </text>
            ) : null}
            <text x={PAD.left + PLOT_W} y={H - 7} textAnchor="end" fontSize={11} fontWeight={700} fill="#6d8389">
              Run date
            </text>
            <rect x={PAD.left} y={PAD.top} width={PLOT_W} height={PLOT_H} rx={4} fill="#fcfefe" stroke="#d5e5e7" />
            {hasStats
              ? [1, -1].flatMap((sign) => [
                  band(mean! + sign * 3 * sd!, sign > 0 ? yMax : yMin, '#fdecee', `out-${sign}`),
                  band(mean! + sign * 2 * sd!, mean! + sign * 3 * sd!, '#fff1e4', `3sd-${sign}`),
                  band(mean! + sign * sd!, mean! + sign * 2 * sd!, '#fff8e1', `2sd-${sign}`),
                  band(mean!, mean! + sign * sd!, '#eaf7ef', `1sd-${sign}`),
                ])
              : coa ? band(coa.lower, coa.upper, '#eaf3fb', 'coa') : null}

            {hasStats
              ? [-3, -2, -1, 1, 2, 3].map((k) => (
                  <line
                    key={k}
                    x1={PAD.left}
                    x2={PAD.left + PLOT_W}
                    y1={yAt(mean! + k * sd!)}
                    y2={yAt(mean! + k * sd!)}
                    stroke={Math.abs(k) === 3 ? '#e7a6ab' : Math.abs(k) === 2 ? '#e9c489' : '#bcd9c6'}
                    strokeWidth={1}
                    strokeDasharray="3 3"
                  />
                ))
              : null}
            {hasStats ? <line x1={PAD.left} x2={PAD.left + PLOT_W} y1={yAt(mean!)} y2={yAt(mean!)} stroke="#16a34a" strokeWidth={1.5} /> : null}
            {hasStats
              ? labelledSd.map((k) => {
                  const value = mean! + k * sd!
                  const y = yAt(value)
                  return (
                    <g key={`ytick-${k}`}>
                      <text x={PAD.left - 8} y={y} textAnchor="end" fontSize={11} fill="#35545e">
                        {fmt(value)}
                      </text>
                      <text x={PAD.left - 8} y={y + 11} textAnchor="end" fontSize={9} fill="#8a9ea4">
                        {k === 0 ? 'mean' : `${k > 0 ? '+' : ''}${k}SD`}
                      </text>
                    </g>
                  )
                })
              : plainTicks.map((value, i) => {
                  const y = yAt(value)
                  return (
                    <g key={`plain-ytick-${i}`}>
                      <line x1={PAD.left} x2={PAD.left + PLOT_W} y1={y} y2={y} stroke="#dbe7e9" strokeWidth={0.8} />
                      <text x={PAD.left - 8} y={y + 4} textAnchor="end" fontSize={11} fill="#35545e">
                        {value.toFixed(2)}
                      </text>
                    </g>
                  )
                })}

            {coa
              ? ([['สูง', coa.upper], ['ต่ำ', coa.lower]] as const).map(([side, value]) => (
                  <g key={`coa-${side}`}>
                    <line x1={PAD.left} x2={PAD.left + PLOT_W} y1={yAt(value)} y2={yAt(value)} stroke={COA_COLOR} strokeWidth={1.4} strokeDasharray="8 4" />
                    <text x={PAD.left + PLOT_W + 6} y={yAt(value)} fontSize={10} fontWeight={700} fill={COA_COLOR}>
                      CoA {side}
                    </text>
                    <text x={PAD.left + PLOT_W + 6} y={yAt(value) + 12} fontSize={11} fill={COA_COLOR}>
                      {fmt(value)}
                    </text>
                  </g>
                ))
              : null}

            <line x1={PAD.left} x2={PAD.left + PLOT_W} y1={PAD.top + PLOT_H} y2={PAD.top + PLOT_H} stroke="#aebfc4" />
            <line x1={PAD.left} x2={PAD.left} y1={PAD.top} y2={PAD.top + PLOT_H} stroke="#aebfc4" />
            {xTicks.map((index) => {
              const point = visible[index]
              if (!point) return null
              const x = xAt(index)
              return (
                <g key={`xtick-${point.resultId}`}>
                  <line x1={x} x2={x} y1={PAD.top + PLOT_H} y2={PAD.top + PLOT_H + 4} stroke="#aebfc4" />
                  <text x={x} y={PAD.top + PLOT_H + 18} textAnchor="middle" fontSize={11} fill="#4f686f">
                    {formatRunDay(point.runDatetime)}
                  </text>
                </g>
              )
            })}

            {chart.lotChanges.map((change, i) => {
              const idx = visible.findIndex((p) => p.runDatetime >= change.runDatetime)
              if (idx < 0) return null
              const x = xAt(idx)
              return (
                <g key={i}>
                  <line x1={x} x2={x} y1={PAD.top} y2={PAD.top + PLOT_H} stroke="#6b7280" strokeWidth={1} strokeDasharray="2 3" />
                  <text x={x + 3} y={PAD.top + 11} fontSize={9} fill="#6b7280">{change.kind === 'trucount-tube' ? `Trucount · LOT ${change.lotNumber}` : change.kind}</text>
                </g>
              )
            })}

            <polyline
              points={visible.filter((p) => !p.isVoided).map((p) => `${xAt(visible.indexOf(p))},${yAt(p.statValue)}`).join(' ')}
              fill="none"
              stroke="#4f7f8a"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {visible.map((p, i) => {
              const x = xAt(i)
              const y = yAt(p.statValue)
              const color = p.isVoided ? '#9aafb4' : STATUS_COLOR[p.status] ?? '#16a34a'
              const node = p.isVoided ? (
                <circle cx={x} cy={y} r={4} fill="white" stroke={color} strokeWidth={1.4} strokeDasharray="2 2" />
              ) : p.status === 'rejected' ? (
                <g stroke={color} strokeWidth={2.4}>
                  <line x1={x - 4.5} y1={y - 4.5} x2={x + 4.5} y2={y + 4.5} />
                  <line x1={x - 4.5} y1={y + 4.5} x2={x + 4.5} y2={y - 4.5} />
                </g>
              ) : p.status === 'warning' ? (
                <polygon points={`${x},${y - 5.5} ${x + 5.5},${y + 4.5} ${x - 5.5},${y + 4.5}`} fill={color} />
              ) : p.status === 'investigate' ? (
                <rect x={x - 5} y={y - 5} width={10} height={10} rx={1.5} fill={color} transform={`rotate(45 ${x} ${y})`} />
              ) : (
                <circle cx={x} cy={y} r={hoverId === p.resultId ? 6.5 : 5} fill={color} stroke="white" strokeWidth={1.6} />
              )
              const selected = selectedResultId === p.resultId
              return (
                <g
                  key={p.resultId}
                  role={onPointSelect ? 'button' : undefined}
                  tabIndex={onPointSelect ? 0 : undefined}
                  aria-label={`${safeFormatDateTime(p.runDatetime)} ${fmt(p.value)}${p.isVoided ? ' voided' : ''}`}
                  className={onPointSelect ? 'cursor-pointer' : undefined}
                  onMouseEnter={() => setHoverId(p.resultId)}
                  onMouseLeave={() => setHoverId(null)}
                  onFocus={() => setHoverId(p.resultId)}
                  onBlur={() => setHoverId(null)}
                  onClick={onPointSelect ? () => onPointSelect(p) : undefined}
                  onKeyDown={onPointSelect ? (event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      onPointSelect(p)
                    }
                  } : undefined}
                >
                  {selected ? <circle cx={x} cy={y} r={11} fill="none" stroke="#0b7f76" strokeWidth={2} /> : null}
                  {node}
                  <circle cx={x} cy={y} r={11} fill="transparent" />
                </g>
              )
            })}
            {latestPoint ? (
              <text
                x={xAt(visible.indexOf(latestPoint))}
                y={yAt(latestPoint.statValue) < PAD.top + 24 ? yAt(latestPoint.statValue) + 22 : yAt(latestPoint.statValue) - 11}
                textAnchor={visible.length > 1 ? 'end' : 'middle'}
                fontSize={12}
                fontWeight={700}
                fill="#173d50"
                stroke="white"
                strokeWidth={3}
                paintOrder="stroke"
                pointerEvents="none"
              >
                {chart.scale === 'log10' ? latestPoint.statValue.toFixed(2) : fmt(latestPoint.value)}
              </text>
            ) : null}
          </svg>
          {hovered ? (
            <div
              role="tooltip"
              className="pointer-events-none absolute z-10 w-max max-w-[16rem] rounded-md border border-[#c9dadd] bg-white px-3 py-2 text-[11px] leading-5 text-[#315763] shadow-lg"
              style={{
                left: `${(hoveredX / W) * 100}%`,
                top: `${(hoveredY / H) * 100}%`,
                transform: `translate(${hoveredX > W * 0.66 ? '-100%' : hoveredX < W * 0.34 ? '0%' : '-50%'}, ${hoveredY < H * 0.45 ? '14px' : 'calc(-100% - 14px)'})`,
              }}
            >
              <p className="font-bold text-[#173d50]">{safeFormatDateTime(hovered.runDatetime)}</p>
              <p className="mono tabular-nums">{fmt(hovered.value)}{unitLabel}</p>
              {chart.scale === 'log10' ? <p className="mono tabular-nums">log10 {hovered.statValue.toFixed(3)}</p> : null}
              <p className="mono tabular-nums">z {hovered.z == null ? '—' : hovered.z.toFixed(2)} · {hovered.isVoided ? 'voided' : statusLabel(hovered.status)}</p>
              {coa && !hovered.isVoided ? <p>{hovered.statValue >= coa.lower && hovered.statValue <= coa.upper ? 'อยู่ในช่วง CoA' : 'นอกช่วง CoA'}</p> : null}
              {hovered.violatedRules.length ? <p className="font-bold text-[#a83541]">{hovered.violatedRules.join(', ')}</p> : null}
            </div>
          ) : null}
        </div>
      ) : (
        <div className="mt-3 max-h-72 overflow-auto rounded-md border border-[#e3ebec]">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-[#f6fafa] text-[#55727c]">
              <tr>
                <th className="px-2 py-1.5 font-semibold">Date</th>
                <th className="px-2 py-1.5 text-right font-semibold">Value{unitLabel}</th>
                {chart.scale === 'log10' ? <th className="px-2 py-1.5 text-right font-semibold">log10</th> : null}
                <th className="px-2 py-1.5 text-right font-semibold">z</th>
                <th className="px-2 py-1.5 font-semibold">Status</th>
                <th className="px-2 py-1.5 font-semibold">Rules</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#eef3f3]">
              {[...points].reverse().map((p) => (
                <tr key={p.resultId} className={p.isVoided ? 'text-[#9aafb4] line-through' : ''}>
                  <td className="px-2 py-1.5">{safeFormatDateTime(p.runDatetime)}</td>
                  <td className="mono px-2 py-1.5 text-right tabular-nums">{fmt(p.value)}</td>
                  {chart.scale === 'log10' ? <td className="mono px-2 py-1.5 text-right tabular-nums">{p.statValue.toFixed(3)}</td> : null}
                  <td className="mono px-2 py-1.5 text-right tabular-nums">{p.z == null ? '—' : p.z.toFixed(2)}</td>
                  <td className="px-2 py-1.5"><StatusBadge tone={p.isVoided ? 'neutral' : p.status} label={p.isVoided ? 'voided' : p.status === 'accepted' ? 'ผ่าน' : p.status === 'warning' ? 'แจ้งเตือน' : p.status === 'investigate' ? 'ต้องตรวจสอบ' : p.status === 'rejected' ? 'Rejected' : 'ยังไม่ประเมิน'} /></td>
                  <td className="px-2 py-1.5">{p.violatedRules.join(', ') || '—'}</td>
                </tr>
              ))}
              {!points.length ? <tr><td colSpan={chart.scale === 'log10' ? 6 : 5} className="px-2 py-6 text-center text-[#91a4a9]">ยังไม่มีข้อมูล</td></tr> : null}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-3 text-[11px] text-[#789097]">
          {voidedCount && !showTable ? (
            <label className="flex items-center gap-1.5">
              <input type="checkbox" className="size-3.5 accent-[#0b7f76]" checked={voidedShown} disabled={selectedIsVoided} onChange={(event) => setShowVoided(event.target.checked)} />
              แสดงผล void ({voidedCount})
            </label>
          ) : null}
          {chart.lotChanges.length ? <span>{chart.lotChanges.length} lot change(s) marked</span> : null}
        </div>
        <Button variant="ghost" className="min-h-7 px-2 py-1 text-xs" onClick={() => setShowTable((v) => !v)}>
          <Table2 className="size-3.5" /> {showTable ? 'ดูกราฟ' : 'ดูเป็นตาราง'}
        </Button>
      </div>
    </div>
  )
}
