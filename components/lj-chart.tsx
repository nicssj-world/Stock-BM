'use client'

import { useState } from 'react'
import { Table2 } from 'lucide-react'
import type { IqcChart } from '@/lib/iqc/types'
import { formatDateTime } from '@/lib/bm/rules'
import { Button, StatusBadge } from '@/components/ui'

const W = 720
const H = 280
const PAD = { top: 16, right: 16, bottom: 28, left: 52 }
const PLOT_W = W - PAD.left - PAD.right
const PLOT_H = H - PAD.top - PAD.bottom

const STATUS_COLOR: Record<string, string> = { accepted: '#16a34a', warning: '#d97706', rejected: '#dc2626' }
const CONSUMABLE_LABEL: Record<string, string> = { 'trucount-tube': 'Trucount', 'staining-reagent': 'Reagent', mastermix: 'Mastermix', reagent: 'Reagent', other: 'Lot' }

function fmt(value: number) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 }).format(value)
}

export function LjChart({ chart }: { chart: IqcChart }) {
  const [showTable, setShowTable] = useState(false)
  const { mean, sd, points } = chart
  const hasStats = mean != null && sd != null && sd > 0
  const visible = points

  const limitLabel = chart.activeLimit === 'lab' ? 'Lab mean/SD' : 'Assigned'
  const scaleHint = chart.scale === 'log10' ? ' · log10' : ''

  function xAt(index: number) {
    if (visible.length <= 1) return PAD.left + PLOT_W / 2
    return PAD.left + (index / (visible.length - 1)) * PLOT_W
  }
  function yAt(statValue: number) {
    if (!hasStats) return PAD.top + PLOT_H / 2
    const yMax = mean! + 4 * sd!
    const yMin = mean! - 4 * sd!
    const clamped = Math.max(yMin, Math.min(yMax, statValue))
    return PAD.top + ((yMax - clamped) / (yMax - yMin)) * PLOT_H
  }

  const zones = hasStats
    ? [
        { from: 3, to: 4, fill: '#fdecee' },
        { from: 2, to: 3, fill: '#fff1e4' },
        { from: 1, to: 2, fill: '#fff8e1' },
        { from: 0, to: 1, fill: '#eaf7ef' },
      ]
    : []

  return (
    <div className="paper rounded-lg p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-bold text-[#173d50]">{chart.analyteName}</h3>
            <StatusBadge tone={chart.status} label={chart.status} />
          </div>
          <p className="mt-0.5 text-xs text-[#789097]">
            {chart.controlMaterialName}
            {chart.level ? ` · ${chart.level}` : ''} · Lot {chart.lotNumber}
            {chart.unit ? ` · ${chart.unit}` : ''}
            {scaleHint}
          </p>
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
        <div className="text-right">
          <span className="inline-block rounded border border-[#cfe0e2] bg-[#f3f9f9] px-2 py-0.5 text-[10px] font-bold text-[#3f6470]">{limitLabel}</span>
          <p className="mono mt-1 text-[11px] tabular-nums text-[#55727c]">
            x̄ {mean != null ? fmt(mean) : '—'} · SD {sd != null ? fmt(sd) : '—'} · CV {chart.cv != null ? `${chart.cv.toFixed(1)}%` : '—'} · n {chart.n}
          </p>
        </div>
      </div>

      {!hasStats ? (
        <p className="mt-3 rounded-md border border-[#eed4a6] bg-[#fff9ed] px-3 py-2 text-xs text-[#99601b]">
          ยังไม่ได้ตั้ง mean/SD (assigned หรือ lab) — บันทึกผลได้แต่ยังไม่ประเมิน Westgard
        </p>
      ) : null}

      {!showTable ? (
        <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 w-full" role="img" aria-label={`Levey-Jennings chart for ${chart.analyteName}`}>
          <title>{`Levey-Jennings: ${chart.analyteName} (${chart.lotNumber})`}</title>
          {zones.map((zone) =>
            [1, -1].map((sign) => {
              const top = yAt(mean! + sign * zone.to * sd!)
              const bottom = yAt(mean! + sign * zone.from * sd!)
              const y = Math.min(top, bottom)
              return <rect key={`${zone.from}-${sign}`} x={PAD.left} y={y} width={PLOT_W} height={Math.abs(bottom - top)} fill={zone.fill} />
            }),
          )}
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
            ? [-3, -2, -1, 0, 1, 2, 3].map((k) => (
                <text key={k} x={PAD.left - 6} y={yAt(mean! + k * sd!) + 3} textAnchor="end" fontSize={9} fill="#8aa0a6">
                  {k === 0 ? 'x̄' : `${k > 0 ? '+' : ''}${k}s`}
                </text>
              ))
            : null}

          {chart.lotChanges.map((change, i) => {
            const idx = visible.findIndex((p) => p.runDatetime === change.runDatetime)
            if (idx < 0) return null
            const x = xAt(idx)
            return (
              <g key={i}>
                <line x1={x} x2={x} y1={PAD.top} y2={PAD.top + PLOT_H} stroke="#6b7280" strokeWidth={1} strokeDasharray="2 3" />
                <text x={x + 2} y={PAD.top + 8} fontSize={8} fill="#6b7280">{change.kind === 'trucount-tube' ? 'Trucount' : change.kind}</text>
              </g>
            )
          })}

          <polyline
            points={visible.filter((p) => !p.isVoided).map((p) => `${xAt(visible.indexOf(p))},${yAt(p.statValue)}`).join(' ')}
            fill="none"
            stroke="#9fb6bd"
            strokeWidth={1.2}
          />

          {visible.map((p, i) => {
            const x = xAt(i)
            const y = yAt(p.statValue)
            const color = p.isVoided ? '#9aafb4' : STATUS_COLOR[p.status] ?? '#16a34a'
            const tip = `${formatDateTime(p.runDatetime)} · ${fmt(p.value)} · z ${p.z.toFixed(2)}${p.violatedRules.length ? ` · ${p.violatedRules.join(', ')}` : ''}${p.isVoided ? ' · voided' : ''}`
            const node =
              p.status === 'rejected' && !p.isVoided ? (
                <g stroke={color} strokeWidth={2}>
                  <line x1={x - 3.5} y1={y - 3.5} x2={x + 3.5} y2={y + 3.5} />
                  <line x1={x - 3.5} y1={y + 3.5} x2={x + 3.5} y2={y - 3.5} />
                </g>
              ) : p.status === 'warning' && !p.isVoided ? (
                <polygon points={`${x},${y - 4} ${x + 4},${y + 3.5} ${x - 4},${y + 3.5}`} fill={color} />
              ) : (
                <circle cx={x} cy={y} r={3.2} fill={color} opacity={p.isVoided ? 0.4 : 1} />
              )
            return (
              <g key={p.resultId}>
                {node}
                <circle cx={x} cy={y} r={8} fill="transparent">
                  <title>{tip}</title>
                </circle>
              </g>
            )
          })}
        </svg>
      ) : (
        <div className="mt-3 max-h-72 overflow-auto rounded-md border border-[#e3ebec]">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-[#f6fafa] text-[#55727c]">
              <tr>
                <th className="px-2 py-1.5 font-semibold">Date</th>
                <th className="px-2 py-1.5 text-right font-semibold">Value</th>
                <th className="px-2 py-1.5 text-right font-semibold">z</th>
                <th className="px-2 py-1.5 font-semibold">Status</th>
                <th className="px-2 py-1.5 font-semibold">Rules</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#eef3f3]">
              {[...visible].reverse().map((p) => (
                <tr key={p.resultId} className={p.isVoided ? 'text-[#9aafb4] line-through' : ''}>
                  <td className="px-2 py-1.5">{formatDateTime(p.runDatetime)}</td>
                  <td className="mono px-2 py-1.5 text-right tabular-nums">{fmt(p.value)}</td>
                  <td className="mono px-2 py-1.5 text-right tabular-nums">{p.z.toFixed(2)}</td>
                  <td className="px-2 py-1.5"><StatusBadge tone={p.isVoided ? 'neutral' : p.status} label={p.isVoided ? 'voided' : p.status} /></td>
                  <td className="px-2 py-1.5">{p.violatedRules.join(', ') || '—'}</td>
                </tr>
              ))}
              {!visible.length ? <tr><td colSpan={5} className="px-2 py-6 text-center text-[#91a4a9]">ยังไม่มีข้อมูล</td></tr> : null}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-2 flex items-center justify-between">
        <span className="text-[10px] text-[#9aafb4]">{chart.lotChanges.length ? `${chart.lotChanges.length} lot change(s) marked` : ''}</span>
        <Button variant="ghost" className="min-h-7 px-2 py-1 text-xs" onClick={() => setShowTable((v) => !v)}>
          <Table2 className="size-3.5" /> {showTable ? 'ดูกราฟ' : 'ดูเป็นตาราง'}
        </Button>
      </div>
    </div>
  )
}
