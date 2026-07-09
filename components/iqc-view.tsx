'use client'

import { useMemo, useState } from 'react'
import { AlertTriangle, CalendarClock, Calculator, ClipboardList, Eye, Gauge, Layers3, Lock, LineChart, ListFilter, PlusCircle, Printer, Search, Settings, Sigma, Trash2, Wrench } from 'lucide-react'
import type { BmActor } from '@/lib/bm/types'
import type { IqcUncertaintyBudget, IqcWorkspace } from '@/lib/iqc/types'
import { formatDate, formatDateTime } from '@/lib/bm/rules'
import { api, Button, Card, Field, Input, Notice, PageHeader, Select, StatCard, StatusBadge, Tabs, Textarea } from '@/components/ui'
import { LjChart } from '@/components/lj-chart'
import { AttachmentList } from '@/components/attachments'
import { ManagedList } from '@/components/managed-list'

type Tab = 'charts' | 'enter' | 'sixsigma' | 'uncertainty' | 'corrective' | 'manage'
type NoticeState = { tone: 'success' | 'danger'; text: string } | null

export function IqcView({ actor, initialData }: { actor: BmActor; initialData: IqcWorkspace }) {
  const [data, setData] = useState(initialData)
  const [tab, setTab] = useState<Tab>('charts')
  const [notice, setNotice] = useState<NoticeState>(null)
  const isAdmin = actor.role === 'Admin'

  const tabs = [
    { key: 'charts' as const, label: 'ภาพรวม / Charts', icon: LineChart },
    { key: 'enter' as const, label: 'บันทึกผล / Enter run', icon: PlusCircle },
    { key: 'sixsigma' as const, label: 'Six Sigma', icon: Gauge },
    { key: 'uncertainty' as const, label: 'Uncertainty', icon: Sigma },
    { key: 'corrective' as const, label: 'Corrective action', icon: Wrench },
    ...(isAdmin ? [{ key: 'manage' as const, label: 'จัดการ / Manage', icon: Settings }] : []),
  ]

  function ok(text: string, next: IqcWorkspace) {
    setData(next)
    setNotice({ tone: 'success', text })
  }
  function err(text: string) {
    setNotice({ tone: 'danger', text })
  }

  const [panel, setPanel] = useState<string>('all')
  const panels = useMemo(() => {
    const set = new Set<string>()
    data.charts.forEach((c) => c.groupLabel && set.add(c.groupLabel))
    data.analytes.forEach((a) => a.groupLabel && set.add(a.groupLabel))
    return [...set].sort()
  }, [data])
  const scoped = useMemo(() => {
    const keep = (g: string | null) => panel === 'all' || g === panel
    const charts = data.charts.filter((c) => keep(c.groupLabel))
    return {
      ...data,
      charts,
      sixSigma: data.sixSigma.filter((r) => keep(r.groupLabel)),
      uncertaintyBudgets: data.uncertaintyBudgets.filter((b) => keep(b.groupLabel)),
      analytes: data.analytes.filter((a) => keep(a.groupLabel)),
      summary: {
        ...data.summary,
        chartCount: charts.length,
        inControl: charts.filter((c) => c.status === 'accepted').length,
        warning: charts.filter((c) => c.status === 'warning').length,
        rejected: charts.filter((c) => c.status === 'rejected').length,
      },
    }
  }, [data, panel])

  return (
    <div className="mx-auto max-w-[1500px] space-y-5">
      <PageHeader eyebrow="Internal Quality Control" title="IQC" description="Levey-Jennings, Westgard rules, ควบคุมคุณภาพภายในต่อ analyte / control lot" />
      {notice ? <Notice tone={notice.tone}>{notice.text}</Notice> : null}

      {panels.length > 1 ? (
        <div className="inline-flex flex-wrap gap-1 rounded-lg border border-[#0b7f76]/25 bg-[#f1faf9] p-1" role="tablist" aria-label="เลือก panel">
          {['all', ...panels].map((p) => {
            const on = panel === p
            return (
              <button key={p} type="button" role="tab" aria-selected={on} onClick={() => setPanel(p)} className={`rounded-md px-3.5 py-2 text-sm font-bold transition focus-visible:ring-2 focus-visible:ring-[#0b7f76] focus-visible:outline-none ${on ? 'bg-[#0b7f76] text-white' : 'text-[#3f6470] hover:bg-white'}`}>
                {p === 'all' ? 'ทั้งหมด' : p}
              </button>
            )
          })}
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Charts" value={scoped.summary.chartCount} />
        <StatCard label="In-control" value={scoped.summary.inControl} tone="accepted" />
        <StatCard label="Warning" value={scoped.summary.warning} tone="warning" />
        <StatCard label="Rejected" value={scoped.summary.rejected} tone="rejected" hint={`${data.summary.openCorrectiveActions} corrective action ค้าง`} />
      </div>

      <Tabs tabs={tabs} active={tab} onChange={setTab} />

      {tab === 'charts' ? <ChartsOverviewTab data={scoped} isAdmin={isAdmin} onOk={ok} onErr={err} /> : null}
      {tab === 'enter' ? <EnterTab data={scoped} onOk={ok} onErr={err} onDone={() => setTab('charts')} /> : null}
      {tab === 'sixsigma' ? <SixSigmaTab data={scoped} /> : null}
      {tab === 'uncertainty' ? <UncertaintyTab data={scoped} isAdmin={isAdmin} onOk={ok} onErr={err} /> : null}
      {tab === 'corrective' ? <CorrectiveTab data={data} actor={actor} onOk={ok} onErr={err} /> : null}
      {tab === 'manage' && isAdmin ? <ManageTab data={data} onOk={ok} onErr={err} /> : null}
    </div>
  )
}

type ChartStatusFilter = 'attention' | 'all' | 'accepted' | 'warning' | 'rejected' | 'unlocked' | 'expiring'

function chartStatusRank(status: IqcWorkspace['charts'][number]['status']) {
  return status === 'rejected' ? 0 : status === 'warning' ? 1 : 2
}

function daysUntil(dateText: string | null) {
  if (!dateText) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const date = new Date(`${dateText}T00:00:00`)
  const diff = Math.ceil((date.getTime() - today.getTime()) / 86400000)
  return Number.isFinite(diff) ? diff : null
}

function fmtCompact(value: number | null) {
  if (value == null) return '—'
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value)
}

function ChartsOverviewTab({ data, isAdmin, onOk, onErr }: { data: IqcWorkspace; isAdmin: boolean; onOk: (t: string, d: IqcWorkspace) => void; onErr: (t: string) => void }) {
  const [busy, setBusy] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<ChartStatusFilter>('all')
  const [query, setQuery] = useState('')
  const [selectedKey, setSelectedKey] = useState<string | null>(null)

  async function lock(controlLotId: string, analyteId: string, eligible: boolean) {
    let overrideReason: string | undefined
    if (!eligible) {
      const reason = window.prompt('จุดยังไม่ครบ 20 — ระบุเหตุผลในการ override lock:')
      if (reason == null || !reason.trim()) return
      overrideReason = reason.trim()
    }
    setBusy(`${controlLotId}:${analyteId}`)
    try {
      const result = await api<{ iqc: IqcWorkspace }>('/api/iqc/lock', { method: 'POST', body: JSON.stringify({ controlLotId, analyteId, overrideReason }) })
      onOk(eligible ? 'Lock lab mean/SD แล้ว' : 'Lock (override) แล้ว', result.iqc)
    } catch (e) {
      onErr(e instanceof Error ? e.message : 'Lock ไม่สำเร็จ')
    } finally {
      setBusy(null)
    }
  }

  if (!data.charts.length) {
    return <Card className="p-8 text-center text-sm text-[#8198a0]">ยังไม่มีข้อมูล IQC — เพิ่ม analyte/control แล้วบันทึกผลที่แท็บบันทึกผล</Card>
  }

  const lotsById = new Map(data.controlLots.map((lot) => [lot.id, lot]))
  const expiringLotIds = new Set(data.controlLots.filter((lot) => {
    const days = daysUntil(lot.expiryDate)
    return days != null && days >= 0 && days <= 30
  }).map((lot) => lot.id))
  const attentionKeys = new Set(data.charts.filter((chart) => chart.status !== 'accepted' || chart.activeLimit !== 'lab' || expiringLotIds.has(chart.controlLotId)).map((chart) => chart.key))
  const rejectedCount = data.charts.filter((chart) => chart.status === 'rejected').length
  const warningCount = data.charts.filter((chart) => chart.status === 'warning').length
  const unlockedCount = data.charts.filter((chart) => chart.activeLimit !== 'lab').length
  const expiringCount = new Set(data.charts.filter((chart) => expiringLotIds.has(chart.controlLotId)).map((chart) => chart.controlLotId)).size
  const q = query.trim().toLowerCase()
  const filteredCharts = data.charts
    .filter((chart) => {
      if (statusFilter === 'attention' && !attentionKeys.has(chart.key)) return false
      if (statusFilter === 'accepted' && chart.status !== 'accepted') return false
      if (statusFilter === 'warning' && chart.status !== 'warning') return false
      if (statusFilter === 'rejected' && chart.status !== 'rejected') return false
      if (statusFilter === 'unlocked' && chart.activeLimit === 'lab') return false
      if (statusFilter === 'expiring' && !expiringLotIds.has(chart.controlLotId)) return false
      if (!q) return true
      return [chart.controlMaterialName, chart.level, chart.lotNumber, chart.analyteCode, chart.analyteName, chart.groupLabel]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q)
    })
    .sort((a, b) => chartStatusRank(a.status) - chartStatusRank(b.status) || a.controlMaterialName.localeCompare(b.controlMaterialName) || a.lotNumber.localeCompare(b.lotNumber) || a.analyteCode.localeCompare(b.analyteCode))
  const selectedChart = filteredCharts.find((chart) => chart.key === selectedKey) ?? null
  const grouped = filteredCharts.reduce((map, chart) => {
    const current = map.get(chart.controlLotId) ?? []
    current.push(chart)
    map.set(chart.controlLotId, current)
    return map
  }, new Map<string, IqcWorkspace['charts']>())

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        <div className="grid gap-px bg-[#dbe8e9] sm:grid-cols-2 xl:grid-cols-5">
          <button type="button" onClick={() => { setStatusFilter('attention'); setSelectedKey(null) }} className={`bg-white p-4 text-left transition hover:bg-[#f7fbfb] ${statusFilter === 'attention' ? 'ring-2 ring-inset ring-[#0b7f76]' : ''}`}>
            <div className="flex items-center gap-2 text-[11px] font-bold tracking-[0.14em] text-[#789097] uppercase"><ListFilter className="size-4" /> Needs attention</div>
            <div className="mono mt-2 text-2xl font-bold text-[#173d50]">{attentionKeys.size}</div>
            <p className="mt-1 text-xs text-[#789097]">warning, rejected, expiring, unlocked</p>
          </button>
          <button type="button" onClick={() => { setStatusFilter('rejected'); setSelectedKey(null) }} className={`bg-white p-4 text-left transition hover:bg-[#fff7f7] ${statusFilter === 'rejected' ? 'ring-2 ring-inset ring-[#c02a37]' : ''}`}>
            <div className="flex items-center gap-2 text-[11px] font-bold tracking-[0.14em] text-[#789097] uppercase"><AlertTriangle className="size-4" /> Rejected</div>
            <div className="mono mt-2 text-2xl font-bold text-[#c02a37]">{rejectedCount}</div>
            <p className="mt-1 text-xs text-[#789097]">out of control</p>
          </button>
          <button type="button" onClick={() => { setStatusFilter('warning'); setSelectedKey(null) }} className={`bg-white p-4 text-left transition hover:bg-[#fffaf0] ${statusFilter === 'warning' ? 'ring-2 ring-inset ring-[#a9700f]' : ''}`}>
            <div className="flex items-center gap-2 text-[11px] font-bold tracking-[0.14em] text-[#789097] uppercase"><AlertTriangle className="size-4" /> Warning</div>
            <div className="mono mt-2 text-2xl font-bold text-[#a9700f]">{warningCount}</div>
            <p className="mt-1 text-xs text-[#789097]">Westgard watch</p>
          </button>
          <button type="button" onClick={() => { setStatusFilter('expiring'); setSelectedKey(null) }} className={`bg-white p-4 text-left transition hover:bg-[#f7fbfb] ${statusFilter === 'expiring' ? 'ring-2 ring-inset ring-[#0b7f76]' : ''}`}>
            <div className="flex items-center gap-2 text-[11px] font-bold tracking-[0.14em] text-[#789097] uppercase"><CalendarClock className="size-4" /> Expiring lots</div>
            <div className="mono mt-2 text-2xl font-bold text-[#173d50]">{expiringCount}</div>
            <p className="mt-1 text-xs text-[#789097]">within 30 days</p>
          </button>
          <button type="button" onClick={() => { setStatusFilter('unlocked'); setSelectedKey(null) }} className={`bg-white p-4 text-left transition hover:bg-[#f7fbfb] ${statusFilter === 'unlocked' ? 'ring-2 ring-inset ring-[#0b7f76]' : ''}`}>
            <div className="flex items-center gap-2 text-[11px] font-bold tracking-[0.14em] text-[#789097] uppercase"><Lock className="size-4" /> Not lab-locked</div>
            <div className="mono mt-2 text-2xl font-bold text-[#173d50]">{unlockedCount}</div>
            <p className="mt-1 text-xs text-[#789097]">needs admin review</p>
          </button>
        </div>
      </Card>

      <Card className="p-3">
        <div className="grid gap-3 lg:grid-cols-[1fr_220px]">
          <label className="relative block">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[#789097]" />
            <Input value={query} onChange={(event) => setQuery(event.target.value)} className="pl-9" placeholder="Search control, lot, analyte" />
          </label>
          <Select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value as ChartStatusFilter); setSelectedKey(null) }}>
            <option value="attention">Needs attention</option>
            <option value="all">All charts</option>
            <option value="rejected">Rejected</option>
            <option value="warning">Warning</option>
            <option value="accepted">Accepted</option>
            <option value="expiring">Expiring lots</option>
            <option value="unlocked">Not lab-locked</option>
          </Select>
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(520px,1.25fr)]">
        <div className="space-y-3">
          {filteredCharts.length ? [...grouped.entries()].map(([lotId, charts]) => {
            const lot = lotsById.get(lotId)
            const worst = charts.some((chart) => chart.status === 'rejected') ? 'rejected' : charts.some((chart) => chart.status === 'warning') ? 'warning' : 'accepted'
            const days = daysUntil(lot?.expiryDate ?? null)
            return (
              <Card key={lotId} className="overflow-hidden">
                <div className="border-b border-[#e3ebec] bg-[#fbfefe] p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-bold text-[#173d50]">{charts[0]?.controlMaterialName}</h3>
                        {charts[0]?.level ? <span className="rounded-full border border-[#d2dee0] px-2 py-0.5 text-[11px] font-bold text-[#55727c]">{charts[0].level}</span> : null}
                        <StatusBadge tone={worst} label={worst} />
                      </div>
                      <p className="mono mt-1 text-xs text-[#5f7880]">Lot {charts[0]?.lotNumber}</p>
                    </div>
                    <div className="text-right text-xs text-[#789097]">
                      <div>{charts.length} analyte{charts.length > 1 ? 's' : ''}</div>
                      {lot?.expiryDate ? <div className={days != null && days <= 30 ? 'font-bold text-[#a9700f]' : ''}>EXP {formatDate(lot.expiryDate)}</div> : null}
                    </div>
                  </div>
                </div>
                <div className="divide-y divide-[#eef3f3]">
                  {charts.map((chart) => {
                    const latest = [...chart.points].reverse().find((point) => !point.isVoided)
                    const selected = selectedChart?.key === chart.key
                    return (
                      <button key={chart.key} type="button" onClick={() => setSelectedKey(chart.key)} className={`grid w-full gap-2 px-4 py-3 text-left transition hover:bg-[#f7fbfb] sm:grid-cols-[1fr_auto] ${selected ? 'bg-[#edf8f6] ring-2 ring-inset ring-[#0b7f76]/45' : 'bg-white'}`}>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-bold text-[#173d50]">{chart.analyteCode}</span>
                            <StatusBadge tone={chart.status} label={chart.status} />
                            {chart.activeLimit !== 'lab' ? <span className="rounded-full border border-[#eed4a6] bg-[#fff9ed] px-2 py-0.5 text-[11px] font-bold text-[#a9700f]">not locked</span> : null}
                          </div>
                          <p className="mt-1 text-xs text-[#789097]">
                            n {chart.n} · mean {fmtCompact(chart.mean)} · SD {fmtCompact(chart.sd)}
                            {latest ? ` · latest ${fmtCompact(latest.value)} (${formatDateTime(latest.runDatetime)})` : ''}
                          </p>
                        </div>
                        <span className="inline-flex items-center justify-end gap-1 text-xs font-bold text-[#0b7f76]"><Eye className="size-4" /> View chart</span>
                      </button>
                    )
                  })}
                </div>
              </Card>
            )
          }) : (
            <Card className="p-8 text-center text-sm text-[#8198a0]">No IQC charts match this filter.</Card>
          )}
        </div>

        <div className="space-y-2 xl:sticky xl:top-4 xl:self-start">
          {selectedChart ? (
            <>
              <LjChart chart={selectedChart} />
              {isAdmin && selectedChart.activeLimit !== 'lab' ? (
                <div className="flex items-center justify-end gap-2">
                  {!selectedChart.lockEligible ? <span className="text-[11px] text-[#a9700f]">n {selectedChart.n} &lt; 20 — lock ได้แบบ override (Admin)</span> : null}
                  <Button variant="secondary" className="min-h-8 px-3 py-1.5 text-xs" disabled={selectedChart.n < 2 || busy === selectedChart.key} onClick={() => lock(selectedChart.controlLotId, selectedChart.analyteId, selectedChart.lockEligible)}>
                    <Lock className="size-3.5" /> {selectedChart.lockEligible ? 'Lock Lab Mean/SD' : `Lock (override, n ${selectedChart.n})`}
                  </Button>
                </div>
              ) : null}
            </>
          ) : (
            <Card className="flex min-h-[320px] flex-col items-center justify-center p-8 text-center">
              <div className="flex size-12 items-center justify-center rounded-lg bg-[#edf8f6] text-[#0b7f76]"><Layers3 className="size-6" /></div>
              <h3 className="mt-4 font-bold text-[#173d50]">เลือก analyte เพื่อดูกราฟ</h3>
              <p className="mt-2 max-w-sm text-sm leading-6 text-[#789097]">ภาพรวมจะแสดงสถานะและ lot แบบย่อก่อน เพื่อให้ control เยอะ ๆ ยังอ่านง่าย</p>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}

// Kept temporarily as a fallback while the overview tab is being rolled out.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function ChartsTab({ data, isAdmin, onOk, onErr }: { data: IqcWorkspace; isAdmin: boolean; onOk: (t: string, d: IqcWorkspace) => void; onErr: (t: string) => void }) {
  const [busy, setBusy] = useState<string | null>(null)
  async function lock(controlLotId: string, analyteId: string, eligible: boolean) {
    let overrideReason: string | undefined
    if (!eligible) {
      const reason = window.prompt('จุดยังไม่ครบ 20 — ระบุเหตุผลในการ override lock (เช่น "lot หมดแล้ว ไม่มี run เพิ่ม"):')
      if (reason == null || !reason.trim()) return
      overrideReason = reason.trim()
    }
    setBusy(`${controlLotId}:${analyteId}`)
    try {
      const result = await api<{ iqc: IqcWorkspace }>('/api/iqc/lock', { method: 'POST', body: JSON.stringify({ controlLotId, analyteId, overrideReason }) })
      onOk(eligible ? 'Lock lab mean/SD แล้ว' : 'Lock (override) แล้ว — บันทึกเหตุผลใน audit', result.iqc)
    } catch (e) {
      onErr(e instanceof Error ? e.message : 'Lock ไม่สำเร็จ')
    } finally {
      setBusy(null)
    }
  }
  if (!data.charts.length) return <Card className="p-8 text-center text-sm text-[#8198a0]">ยังไม่มีข้อมูล IQC — เพิ่ม analyte/control แล้วบันทึกผลที่แท็บ &ldquo;บันทึกผล&rdquo;</Card>
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {data.charts.map((chart) => (
        <div key={chart.key} className="space-y-2">
          <LjChart chart={chart} />
          {isAdmin && chart.activeLimit !== 'lab' ? (
            <div className="flex items-center justify-end gap-2">
              {!chart.lockEligible ? <span className="text-[11px] text-[#a9700f]">n {chart.n} &lt; 20 — lock ได้แบบ override (Admin)</span> : null}
              <Button variant="secondary" className="min-h-8 px-3 py-1.5 text-xs" disabled={chart.n < 2 || busy === chart.key} onClick={() => lock(chart.controlLotId, chart.analyteId, chart.lockEligible)}>
                <Lock className="size-3.5" /> {chart.lockEligible ? 'Lock Lab Mean/SD' : `Lock (override, n ${chart.n})`}
              </Button>
            </div>
          ) : null}
        </div>
      ))}
    </div>
  )
}

const MONTHS: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 }

// Parse a date cell ("18-May-26", "2026-05-18", "18/05/2026") to an ISO string, or null.
function parseImportDate(raw: string): string | null {
  const text = raw.trim()
  if (!text) return null
  let y: number | null = null
  let m: number | null = null
  let d: number | null = null
  const dmon = text.match(/^(\d{1,2})[-\s]([A-Za-z]{3,})[-\s](\d{2,4})$/)
  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  const dmy = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/)
  if (dmon) {
    d = Number(dmon[1]); m = MONTHS[dmon[2].slice(0, 3).toLowerCase()] ?? null; y = Number(dmon[3])
  } else if (iso) {
    y = Number(iso[1]); m = Number(iso[2]) - 1; d = Number(iso[3])
  } else if (dmy) {
    d = Number(dmy[1]); m = Number(dmy[2]) - 1; y = Number(dmy[3])
  } else {
    return null
  }
  if (y == null || m == null || d == null) return null
  if (y < 100) y += 2000
  const date = new Date(`${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}T00:00:00+07:00`)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function parseImportRows(text: string, columnCount: number): { runDatetime: string; values: (number | null)[] }[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const cells = line.includes('\t') ? line.split('\t') : line.split(',')
      const runDatetime = parseImportDate(cells[0] ?? '')
      if (!runDatetime) return null
      const values: (number | null)[] = []
      for (let i = 0; i < columnCount; i += 1) {
        const cell = (cells[i + 1] ?? '').trim().replace(/,/g, '')
        const n = Number(cell)
        values.push(cell === '' || Number.isNaN(n) ? null : n)
      }
      return { runDatetime, values }
    })
    .filter((r): r is { runDatetime: string; values: (number | null)[] } => r !== null)
}

function ImportPanel({ data, onOk, onErr }: { data: IqcWorkspace; onOk: (t: string, d: IqcWorkspace) => void; onErr: (t: string) => void }) {
  const activeLots = data.controlLots.filter((l) => l.isActive)
  const [controlLotId, setControlLotId] = useState('')
  const [cols, setCols] = useState<string[]>([])
  const [trucountLot, setTrucountLot] = useState('')
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const preview = cols.length ? parseImportRows(text, cols.length) : []

  function fillCols() {
    if (!controlLotId) return
    const specAnalytes = data.specs.filter((s) => s.controlLotId === controlLotId).map((s) => s.analyteId)
    setCols(specAnalytes.length ? specAnalytes : data.analytes.filter((a) => a.isActive).map((a) => a.id))
  }

  async function submit() {
    if (!controlLotId || !cols.length || !preview.length) return onErr('เลือก control lot, คอลัมน์ analyte และวางข้อมูล')
    setBusy(true)
    try {
      const result = await api<{ iqc: IqcWorkspace }>('/api/iqc/import', { method: 'POST', body: JSON.stringify({ controlLotId, analyteIds: cols, trucountLot: trucountLot || null, rows: preview }) })
      onOk(`นำเข้า ${preview.length} run แล้ว`, result.iqc)
      setText('')
    } catch (e) {
      onErr(e instanceof Error ? e.message : 'นำเข้าไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="space-y-3 p-4">
      <div>
        <h2 className="font-bold text-[#173d50]">นำเข้าจากตาราง / Paste import</h2>
        <p className="text-xs text-[#789097]">วางจาก Google Sheet/Excel ได้เลย — คอลัมน์แรก = วันที่ (เช่น 18-May-26), คอลัมน์ถัดไป = ค่าตาม analyte ที่จับคู่ (เว้นว่างได้)</p>
      </div>
      <div className="grid gap-2 md:grid-cols-[1fr_auto_auto]">
        <Field label="Control lot"><Select value={controlLotId} onChange={(e) => setControlLotId(e.target.value)}><option value="">—</option>{activeLots.map((l) => <option key={l.id} value={l.id}>{l.controlMaterialName}{l.level ? ` ${l.level}` : ''} · {l.lotNumber}</option>)}</Select></Field>
        <div className="flex items-end"><Button type="button" variant="secondary" className="h-9" onClick={fillCols}>เติมคอลัมน์จาก spec</Button></div>
        <div className="flex items-end"><Button type="button" variant="ghost" className="h-9" onClick={() => setCols((c) => [...c, data.analytes[0]?.id ?? ''])}>+ คอลัมน์</Button></div>
      </div>
      <div className="max-w-xs">
        <Field label="BD Trucount tube lot (จากคอลัมน์ Lot. ในชีต)" hint="บันทึกเป็น consumable ทุก run ที่ import (มีผลเฉพาะ analyte absolute)">
          <Input value={trucountLot} onChange={(e) => setTrucountLot(e.target.value)} placeholder="เช่น 25290" />
        </Field>
      </div>
      {cols.length ? (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-[#58747d]">ลำดับคอลัมน์ (หลังคอลัมน์วันที่)</p>
          {cols.map((analyteId, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="mono w-8 text-xs text-[#789097]">#{i + 1}</span>
              <Select className="h-9 flex-1" value={analyteId} onChange={(e) => setCols((cs) => cs.map((x, j) => (j === i ? e.target.value : x)))}>{data.analytes.map((a) => <option key={a.id} value={a.id}>{a.code}{a.unit ? ` (${a.unit})` : ''}</option>)}</Select>
              <button type="button" className="rounded p-1.5 text-[#c02a37] hover:bg-[#fff0f1]" aria-label="ลบคอลัมน์" onClick={() => setCols((cs) => cs.filter((_, j) => j !== i))}><Trash2 className="size-4" /></button>
            </div>
          ))}
        </div>
      ) : null}
      <Textarea rows={6} className="mono text-xs" value={text} onChange={(e) => setText(e.target.value)} placeholder={'18-May-26\t57.79\t857\t11.4\t169\n19-May-26\t55.78\t868\t11.64\t181'} />
      <div className="flex items-center justify-between">
        <span className="text-xs text-[#789097]">{preview.length ? `อ่านได้ ${preview.length} แถว` : 'ยังไม่มีแถวที่อ่านได้'}</span>
        <Button disabled={busy || !preview.length || !controlLotId} onClick={submit}>{busy ? 'กำลังนำเข้า…' : `นำเข้า ${preview.length || ''} run`}</Button>
      </div>
    </Card>
  )
}

type ValueRow = { id: number; controlLotId: string; analyteId: string; value: string }
type ConsumableRow = { id: number; kind: string; lotNumber: string }

function EnterTab({ data, onOk, onErr, onDone }: { data: IqcWorkspace; onOk: (t: string, d: IqcWorkspace) => void; onErr: (t: string) => void; onDone: () => void }) {
  const activeAnalytes = useMemo(() => data.analytes.filter((a) => a.isActive), [data.analytes])
  const activeLots = useMemo(() => data.controlLots.filter((l) => l.isActive), [data.controlLots])
  const [instrumentId, setInstrumentId] = useState('')
  const [runDatetime, setRunDatetime] = useState(() => new Date().toISOString().slice(0, 16))
  const [note, setNote] = useState('')
  const [consumables, setConsumables] = useState<ConsumableRow[]>([])
  const [rows, setRows] = useState<ValueRow[]>([])
  const [fillLot, setFillLot] = useState('')
  const [busy, setBusy] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const seq = useMemo(() => ({ n: 1 }), [])

  const analyteById = useMemo(() => new Map(data.analytes.map((a) => [a.id, a])), [data.analytes])

  function addRow() {
    setRows((r) => [...r, { id: seq.n++, controlLotId: activeLots[0]?.id ?? '', analyteId: activeAnalytes[0]?.id ?? '', value: '' }])
  }
  function fillFromLot() {
    if (!fillLot) return
    const specs = data.specs.filter((s) => s.controlLotId === fillLot)
    const added = (specs.length ? specs.map((s) => s.analyteId) : activeAnalytes.map((a) => a.id)).map((analyteId) => ({ id: seq.n++, controlLotId: fillLot, analyteId, value: '' }))
    setRows((r) => [...r, ...added])
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    const values = rows.filter((r) => r.controlLotId && r.analyteId && r.value.trim()).map((r) => {
      const analyte = analyteById.get(r.analyteId)
      if (analyte?.dataType === 'qualitative') return { controlLotId: r.controlLotId, analyteId: r.analyteId, qualitativeValue: r.value.trim() }
      return { controlLotId: r.controlLotId, analyteId: r.analyteId, numericValue: Number(r.value) }
    })
    if (!values.length) return onErr('กรอกค่าผลอย่างน้อย 1 รายการ')
    setBusy(true)
    try {
      const result = await api<{ iqc: IqcWorkspace }>('/api/iqc/runs', {
        method: 'POST',
        body: JSON.stringify({
          instrumentId: instrumentId || null,
          runDatetime: new Date(runDatetime).toISOString(),
          note: note || null,
          consumables: consumables.filter((c) => c.lotNumber.trim()).map((c) => ({ kind: c.kind, lotNumber: c.lotNumber.trim(), appliesScope: c.kind === 'trucount-tube' ? 'absolute-only' : 'all' })),
          values,
        }),
      })
      onOk('บันทึก run แล้ว', result.iqc)
      onDone()
    } catch (e) {
      onErr(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  if (!activeAnalytes.length || !activeLots.length) {
    return <Notice tone="warning">ต้องมี analyte และ control lot ก่อน (ไปที่แท็บ จัดการ / Manage)</Notice>
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button type="button" variant="ghost" onClick={() => setShowImport((v) => !v)}>{showImport ? 'ซ่อนการนำเข้า' : 'นำเข้าจากตาราง / Paste import'}</Button>
      </div>
      {showImport ? <ImportPanel data={data} onOk={onOk} onErr={onErr} /> : null}
      <form onSubmit={submit} className="grid gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
      <Card className="space-y-3 p-4">
        <h2 className="font-bold text-[#173d50]">Run context</h2>
        <Field label="วันเวลา run / Run datetime"><Input type="datetime-local" value={runDatetime} onChange={(e) => setRunDatetime(e.target.value)} required /></Field>
        <Field label="เครื่อง / Instrument">
          <Select value={instrumentId} onChange={(e) => setInstrumentId(e.target.value)}>
            <option value="">— ไม่ระบุ —</option>
            {data.instruments.filter((i) => i.isActive).map((i) => <option key={i.id} value={i.id}>{i.code} · {i.name}{i.model ? ` (${i.model})` : ''}</option>)}
          </Select>
        </Field>
        <div>
          <div className="mb-1 flex items-center justify-between"><span className="text-xs font-semibold text-[#58747d]">Consumable lots</span><Button type="button" variant="ghost" className="min-h-7 px-2 py-1 text-xs" onClick={() => setConsumables((c) => [...c, { id: seq.n++, kind: 'staining-reagent', lotNumber: '' }])}>+ เพิ่ม</Button></div>
          <div className="space-y-2">
            {consumables.map((c, i) => (
              <div key={c.id} className="flex gap-1.5">
                <Select className="h-9" value={c.kind} onChange={(e) => setConsumables((rows) => rows.map((x, j) => (j === i ? { ...x, kind: e.target.value } : x)))}>
                  <option value="staining-reagent">Staining reagent</option>
                  <option value="trucount-tube">Trucount tube</option>
                  <option value="mastermix">Mastermix</option>
                  <option value="reagent">Reagent</option>
                  <option value="other">Other</option>
                </Select>
                <Input className="h-9" placeholder="Lot no." value={c.lotNumber} onChange={(e) => setConsumables((rows) => rows.map((x, j) => (j === i ? { ...x, lotNumber: e.target.value } : x)))} />
                <button type="button" className="rounded p-1.5 text-[#c02a37] hover:bg-[#fff0f1]" aria-label="ลบ" onClick={() => setConsumables((rows) => rows.filter((_, j) => j !== i))}><Trash2 className="size-4" /></button>
              </div>
            ))}
            {!consumables.length ? <p className="text-[11px] text-[#9aafb4]">เช่น Trucount tube lot, staining reagent lot (ช่วยตามรอย abs-count shift)</p> : null}
          </div>
        </div>
        <Field label="หมายเหตุ / Note"><Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      </Card>

      <Card className="space-y-3 p-4">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 className="font-bold text-[#173d50]">ค่าผล / Results</h2>
          <div className="flex items-end gap-1.5">
            <Select className="h-9 w-44" value={fillLot} onChange={(e) => setFillLot(e.target.value)}>
              <option value="">เติมจาก control lot…</option>
              {activeLots.map((l) => <option key={l.id} value={l.id}>{l.controlMaterialName}{l.level ? ` ${l.level}` : ''} · {l.lotNumber}</option>)}
            </Select>
            <Button type="button" variant="secondary" className="h-9" onClick={fillFromLot}>เติมแถว</Button>
            <Button type="button" variant="ghost" className="h-9" onClick={addRow}>+ แถว</Button>
          </div>
        </div>
        <div className="space-y-2">
          {rows.map((row, i) => {
            const analyte = analyteById.get(row.analyteId)
            return (
              <div key={row.id} className="grid grid-cols-[1.2fr_1.2fr_0.9fr_auto] items-center gap-1.5">
                <Select className="h-10" value={row.controlLotId} onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, controlLotId: e.target.value } : x)))}>
                  {activeLots.map((l) => <option key={l.id} value={l.id}>{l.controlMaterialName}{l.level ? ` ${l.level}` : ''} · {l.lotNumber}</option>)}
                </Select>
                <Select className="h-10" value={row.analyteId} onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, analyteId: e.target.value } : x)))}>
                  {activeAnalytes.map((a) => <option key={a.id} value={a.id}>{a.code}{a.unit ? ` (${a.unit})` : ''}</option>)}
                </Select>
                <Input
                  className="mono h-10 text-base font-bold tabular-nums"
                  inputMode={analyte?.dataType === 'qualitative' ? 'text' : 'decimal'}
                  type={analyte?.dataType === 'qualitative' ? 'text' : 'number'}
                  step="any"
                  placeholder={analyte?.dataType === 'qualitative' ? 'valid/pos…' : 'ค่า'}
                  value={row.value}
                  onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))}
                />
                <button type="button" className="rounded p-1.5 text-[#c02a37] hover:bg-[#fff0f1]" aria-label="ลบแถว" onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}><Trash2 className="size-4" /></button>
              </div>
            )
          })}
          {!rows.length ? <p className="rounded-md border border-dashed border-[#cfdee0] px-3 py-6 text-center text-sm text-[#9aafb4]">เลือก control lot แล้วกด &ldquo;เติมแถว&rdquo; หรือ &ldquo;+ แถว&rdquo;</p> : null}
        </div>
        <div className="flex justify-end"><Button disabled={busy || !rows.length}>{busy ? 'กำลังบันทึก…' : 'บันทึก run'}</Button></div>
      </Card>
      </form>
    </div>
  )
}

const SIGMA_TONE: Record<string, 'accepted' | 'warning' | 'rejected' | 'neutral'> = {
  'world-class': 'accepted',
  good: 'accepted',
  marginal: 'warning',
  poor: 'rejected',
  unknown: 'neutral',
}

function SigmaBar({ sigma }: { sigma: number | null }) {
  const pct = sigma == null ? 0 : Math.max(0, Math.min(100, (sigma / 6) * 100))
  const color = sigma == null ? '#cbd5d8' : sigma >= 6 ? '#16a34a' : sigma >= 4 ? '#4d9e63' : sigma >= 3 ? '#d97706' : '#dc2626'
  return (
    <div className="flex items-center gap-2">
      <div className="relative h-2.5 w-28 overflow-hidden rounded-full bg-[#eef3f3]">
        <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="mono text-xs font-bold tabular-nums" style={{ color }}>{sigma == null ? '—' : sigma.toFixed(1)}σ</span>
    </div>
  )
}

function SixSigmaTab({ data }: { data: IqcWorkspace }) {
  if (!data.sixSigma.length) {
    return <Notice tone="info">ยังไม่มี Six Sigma — ตั้งค่า TEa ต่อ analyte (แท็บ จัดการ) และต้องมี mean/SD แล้ว <span className="text-xs">(bias มาจากโมดูล EQA — ตอนนี้ถือเป็น 0)</span></Notice>
  }
  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-[#f6fafa] text-xs text-[#55727c]">
            <tr>
              <th className="px-3 py-2 font-semibold">Analyte</th>
              <th className="px-3 py-2 font-semibold">Lot / Level</th>
              <th className="px-3 py-2 text-right font-semibold">Mean</th>
              <th className="px-3 py-2 text-right font-semibold">CV%</th>
              <th className="px-3 py-2 text-right font-semibold">Bias%</th>
              <th className="px-3 py-2 text-right font-semibold">TEa</th>
              <th className="px-3 py-2 text-right font-semibold">TEa%</th>
              <th className="px-3 py-2 font-semibold">Sigma</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#eef3f3]">
            {data.sixSigma.map((row) => (
              <tr key={row.key}>
                <td className="px-3 py-2 font-semibold text-[#315763]">{row.analyteName}</td>
                <td className="px-3 py-2 text-xs text-[#789097]">{row.lotNumber}{row.level ? ` · ${row.level}` : ''}</td>
                <td className="mono px-3 py-2 text-right tabular-nums">{row.meanValue?.toFixed(2) ?? '—'}</td>
                <td className="mono px-3 py-2 text-right tabular-nums">{row.cv?.toFixed(1) ?? '—'}</td>
                <td className="mono px-3 py-2 text-right tabular-nums">{row.biasPct.toFixed(1)}</td>
                <td className="mono px-3 py-2 text-right tabular-nums">{row.teaValue}{row.teaMode === 'percent' ? '%' : ''}</td>
                <td className="mono px-3 py-2 text-right tabular-nums">{row.teaPct?.toFixed(1) ?? '—'}</td>
                <td className="px-3 py-2"><div className="flex items-center gap-2"><SigmaBar sigma={row.sigma} /><StatusBadge tone={SIGMA_TONE[row.rating]} label={row.rating} /></div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

function pct(value: number | null) {
  return value == null ? '—' : `${(value * 100).toFixed(2)}%`
}
function num(value: number | null, digits = 3) {
  return value == null ? '—' : new Intl.NumberFormat('en-US', { maximumFractionDigits: digits }).format(value)
}

function BudgetCard({ budget }: { budget: IqcUncertaintyBudget }) {
  const [result, setResult] = useState('')
  const ux = budget.expandedUx
  const resultNum = result === '' ? null : Number(result)
  const ur = resultNum != null && ux != null ? resultNum * ux : null
  const meanBand = budget.expandedUx != null ? budget.concentration * budget.expandedUx : null
  const teaPctValue = budget.teaValue != null ? (budget.teaMode === 'percent' ? budget.teaValue / 100 : budget.teaValue / budget.concentration) : null
  const teaBand = teaPctValue != null ? budget.concentration * teaPctValue : null

  return (
    <Card className="space-y-3 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-bold text-[#173d50]">{budget.analyteName} — {budget.measurand}</h3>
          <p className="mt-0.5 text-xs text-[#789097]">at conc. {num(budget.concentration)} {budget.analyteUnit ?? ''} · k={budget.coverageK} · {new Date(budget.evaluatedAt).toLocaleDateString('th-TH')}</p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge tone={budget.meetsRequirement ? 'accepted' : 'warning'} label={budget.meetsRequirement ? 'ครบเกณฑ์ QP' : `n=${budget.iqcN ?? 0} ยังไม่ครบ`} />
          <Button variant="ghost" className="no-print min-h-7 px-2 py-1 text-xs" onClick={() => window.print()}><Printer className="size-3.5" /> พิมพ์</Button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-[#f6fafa] text-[#55727c]">
            <tr><th className="px-2 py-1.5 font-semibold">Component</th><th className="px-2 py-1.5 text-right font-semibold">Value</th><th className="px-2 py-1.5 font-semibold">Distribution</th><th className="px-2 py-1.5 text-right font-semibold">Divisor</th><th className="px-2 py-1.5 text-right font-semibold">SU</th><th className="px-2 py-1.5 text-right font-semibold">RSU</th></tr>
          </thead>
          <tbody className="divide-y divide-[#eef3f3]">
            {budget.components.map((c) => (
              <tr key={c.id}>
                <td className="px-2 py-1.5 font-semibold text-[#315763]">{c.source === 'iqc' ? 'IQC (pooled)' : c.label || c.source} <span className="font-normal text-[#9aafb4]">({c.type})</span></td>
                <td className="mono px-2 py-1.5 text-right tabular-nums">{num(c.value)}</td>
                <td className="px-2 py-1.5">{c.distribution}</td>
                <td className="mono px-2 py-1.5 text-right tabular-nums">{num(c.divisor)}</td>
                <td className="mono px-2 py-1.5 text-right tabular-nums">{num(c.su)}</td>
                <td className="mono px-2 py-1.5 text-right tabular-nums">{pct(c.rsu)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-[#d6e2e3] font-bold text-[#173d50]">
              <td className="px-2 py-1.5" colSpan={5}>Combined U (UC) / Expanded U (UX, k={budget.coverageK})</td>
              <td className="mono px-2 py-1.5 text-right tabular-nums">{pct(budget.combinedUc)} / {pct(budget.expandedUx)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <div className="rounded-md border border-[#cfe0e2] bg-[#f3f9f9] p-3 text-sm">
          <p className="text-[11px] font-bold tracking-wide text-[#3f6470] uppercase">Mean ± (Mean × Ux)</p>
          <p className="mono mt-1 tabular-nums text-[#173d50]">{meanBand != null ? `${num(budget.concentration)} ± ${num(meanBand)}` : '—'} {budget.analyteUnit ?? ''}</p>
        </div>
        <div className="rounded-md border border-[#e0d6c0] bg-[#fdfaf2] p-3 text-sm">
          <p className="text-[11px] font-bold tracking-wide text-[#7a6326] uppercase">Mean ± TEa (acceptance)</p>
          <p className="mono mt-1 tabular-nums text-[#173d50]">{teaBand != null ? `${num(budget.concentration)} ± ${num(teaBand)}` : 'ไม่มี TEa'} {budget.analyteUnit ?? ''}</p>
        </div>
      </div>

      <div className="no-print rounded-md border border-[#d6e2e3] p-3">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-[#55727c]"><Calculator className="size-3.5" /> Calculator — รายงานผล ± UR</p>
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <Field label={`ผลตรวจ${budget.analyteUnit ? ` (${budget.analyteUnit})` : ''}`}><Input className="mono w-40" type="number" step="any" value={result} onChange={(e) => setResult(e.target.value)} /></Field>
          <p className="mono pb-2 text-base font-bold tabular-nums text-[#0b7f76]">{ur != null && resultNum != null ? `${num(resultNum)} ± ${num(ur)} ${budget.analyteUnit ?? ''}` : '—'}</p>
        </div>
        <p className="mt-1 text-[10px] text-[#9aafb4]">expanded uncertainty, coverage factor k={budget.coverageK} (~95%)</p>
      </div>
    </Card>
  )
}

function UncertaintyTab({ data, isAdmin, onOk, onErr }: { data: IqcWorkspace; isAdmin: boolean; onOk: (t: string, d: IqcWorkspace) => void; onErr: (t: string) => void }) {
  return (
    <div className="space-y-4">
      {isAdmin ? <BudgetForm data={data} onOk={onOk} onErr={onErr} /> : null}
      <div className="grid gap-4 xl:grid-cols-2">
        {data.uncertaintyBudgets.map((budget) => <BudgetCard key={budget.id} budget={budget} />)}
      </div>
      {!data.uncertaintyBudgets.length ? <Card className="p-8 text-center text-sm text-[#8198a0]">ยังไม่มี MU budget — {isAdmin ? 'สร้างด้านบน' : 'ให้ Admin สร้าง'}</Card> : null}
    </div>
  )
}

type ManualComp = { id: number; source: string; label: string; value: string; distribution: string; concentration: string }

function BudgetForm({ data, onOk, onErr }: { data: IqcWorkspace; onOk: (t: string, d: IqcWorkspace) => void; onErr: (t: string) => void }) {
  const [analyteId, setAnalyteId] = useState('')
  const [measurand, setMeasurand] = useState('')
  const [concentration, setConcentration] = useState('')
  const [coverageK, setCoverageK] = useState('2')
  const [comps, setComps] = useState<ManualComp[]>([])
  const [busy, setBusy] = useState(false)
  const seq = useMemo(() => ({ n: 1 }), [])

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!analyteId || !measurand.trim() || !concentration) return onErr('กรอก analyte, measurand, concentration')
    setBusy(true)
    try {
      const body = {
        analyteId,
        measurand: measurand.trim(),
        concentration: Number(concentration),
        coverageK: Number(coverageK) || 2,
        components: comps.filter((c) => c.value && c.concentration).map((c) => ({ source: c.source, label: c.label || null, value: Number(c.value), distribution: c.distribution, concentration: Number(c.concentration) })),
      }
      const result = await api<{ iqc: IqcWorkspace }>('/api/iqc/uncertainty', { method: 'POST', body: JSON.stringify(body) })
      onOk('คำนวณ MU budget แล้ว (IQC pooled RSD เติมอัตโนมัติ)', result.iqc)
      setMeasurand(''); setConcentration(''); setComps([])
    } catch (e) {
      onErr(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="space-y-3 p-4">
      <h2 className="font-bold text-[#173d50]">สร้าง MU budget</h2>
      <p className="text-xs text-[#789097]">IQC component (pooled RSD ข้าม lot) เติมให้อัตโนมัติ — เพิ่ม calibrator / EQAS เองได้</p>
      <form onSubmit={submit} className="space-y-3">
        <div className="grid gap-2 md:grid-cols-4">
          <Field label="Analyte"><Select value={analyteId} onChange={(e) => setAnalyteId(e.target.value)} required><option value="">—</option>{data.analytes.map((a) => <option key={a.id} value={a.id}>{a.code}</option>)}</Select></Field>
          <Field label="Measurand"><Input value={measurand} onChange={(e) => setMeasurand(e.target.value)} placeholder="AbsCD4 @ level X" required /></Field>
          <Field label="Concentration (mean)"><Input className="mono" type="number" step="any" value={concentration} onChange={(e) => setConcentration(e.target.value)} required /></Field>
          <Field label="Coverage k"><Input className="mono" type="number" step="any" value={coverageK} onChange={(e) => setCoverageK(e.target.value)} /></Field>
        </div>
        <div>
          <div className="mb-1 flex items-center justify-between"><span className="text-xs font-semibold text-[#58747d]">Type B components (calibrator / EQAS / อื่นๆ)</span><Button type="button" variant="ghost" className="min-h-7 px-2 py-1 text-xs" onClick={() => setComps((c) => [...c, { id: seq.n++, source: 'calibrator', label: '', value: '', distribution: 'normal-k2', concentration: '' }])}>+ เพิ่ม</Button></div>
          <div className="space-y-2">
            {comps.map((c, i) => (
              <div key={c.id} className="grid grid-cols-[1fr_1.2fr_0.8fr_1fr_0.8fr_auto] items-center gap-1.5">
                <Select className="h-9" value={c.source} onChange={(e) => setComps((rs) => rs.map((x, j) => (j === i ? { ...x, source: e.target.value } : x)))}><option value="calibrator">Calibrator</option><option value="eqas">EQAS</option><option value="other">Other</option></Select>
                <Input className="h-9" placeholder="label" value={c.label} onChange={(e) => setComps((rs) => rs.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
                <Input className="mono h-9" type="number" step="any" placeholder="U" value={c.value} onChange={(e) => setComps((rs) => rs.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} />
                <Select className="h-9" value={c.distribution} onChange={(e) => setComps((rs) => rs.map((x, j) => (j === i ? { ...x, distribution: e.target.value } : x)))}><option value="normal">normal</option><option value="normal-k2">normal (k=2)</option><option value="rectangular">rectangular</option><option value="triangular">triangular</option><option value="u-shape">u-shape</option></Select>
                <Input className="mono h-9" type="number" step="any" placeholder="conc." value={c.concentration} onChange={(e) => setComps((rs) => rs.map((x, j) => (j === i ? { ...x, concentration: e.target.value } : x)))} />
                <button type="button" className="rounded p-1.5 text-[#c02a37] hover:bg-[#fff0f1]" aria-label="ลบ" onClick={() => setComps((rs) => rs.filter((_, j) => j !== i))}><Trash2 className="size-4" /></button>
              </div>
            ))}
          </div>
        </div>
        <Button disabled={busy}>{busy ? 'กำลังคำนวณ…' : 'คำนวณ & บันทึก'}</Button>
      </form>
    </Card>
  )
}

function CorrectiveTab({ data, actor, onOk, onErr }: { data: IqcWorkspace; actor: BmActor; onOk: (t: string, d: IqcWorkspace) => void; onErr: (t: string) => void }) {
  const [runId, setRunId] = useState('')
  const [problem, setProblem] = useState('')
  const [rootCause, setRootCause] = useState('')
  const [actionTaken, setActionTaken] = useState('')
  const [busy, setBusy] = useState(false)
  const [showAll, setShowAll] = useState(false)

  const flaggedOf = (r: IqcWorkspace['runs'][number]) => r.results.filter((res) => !res.isVoided && res.status !== 'accepted')
  const runOptions = data.runs.filter((r) => showAll || flaggedOf(r).length > 0)

  async function create(event: React.FormEvent) {
    event.preventDefault()
    if (!runId || !problem.trim()) return onErr('เลือก run และระบุปัญหา')
    setBusy(true)
    try {
      const result = await api<{ iqc: IqcWorkspace }>('/api/iqc/corrective-actions', { method: 'POST', body: JSON.stringify({ runId, problem, rootCause: rootCause || null, actionTaken: actionTaken || null }) })
      onOk('เปิด corrective action แล้ว', result.iqc)
      setProblem(''); setRootCause(''); setActionTaken('')
    } catch (e) {
      onErr(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }
  async function close(id: string) {
    setBusy(true)
    try {
      const result = await api<{ iqc: IqcWorkspace }>(`/api/iqc/corrective-actions/${id}/close`, { method: 'POST', body: JSON.stringify({}) })
      onOk('ปิด corrective action แล้ว', result.iqc)
    } catch (e) {
      onErr(e instanceof Error ? e.message : 'ปิดไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
      <Card className="space-y-3 p-4">
        <h2 className="font-bold text-[#173d50]">เปิด corrective action</h2>
        <form onSubmit={create} className="space-y-3">
          <Field label="Run (เฉพาะที่มีค่า out)">
            <Select value={runId} onChange={(e) => setRunId(e.target.value)} required>
              <option value="">— เลือก run —</option>
              {runOptions.map((r) => {
                const flags = flaggedOf(r)
                const flagText = flags.map((f) => `${f.analyteCode}${f.violatedRules.length ? ` ${f.violatedRules.join('/')}` : ''}`).join(', ')
                return <option key={r.id} value={r.id}>{formatDateTime(r.runDatetime)}{flagText ? ` · ${flagText}` : ''}</option>
              })}
            </Select>
          </Field>
          <label className="flex items-center gap-2 text-xs text-[#58747d]">
            <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> แสดงทุก run (รวมที่ปกติ)
          </label>
          {!runOptions.length ? <p className="text-xs text-[#9aafb4]">ไม่มี run ที่มีค่า out — ติ๊ก &ldquo;แสดงทุก run&rdquo; เพื่อเปิดเอง</p> : null}
          <Field label="ปัญหา / Problem"><Textarea rows={2} value={problem} onChange={(e) => setProblem(e.target.value)} required /></Field>
          <Field label="Root cause"><Textarea rows={2} value={rootCause} onChange={(e) => setRootCause(e.target.value)} /></Field>
          <Field label="Action taken"><Textarea rows={2} value={actionTaken} onChange={(e) => setActionTaken(e.target.value)} /></Field>
          <Button disabled={busy}>บันทึก</Button>
        </form>
      </Card>
      <div className="space-y-3">
        {data.correctiveActions.map((ca) => (
          <Card key={ca.id} className="p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2"><span className="font-bold text-[#315763]">{formatDateTime(ca.runDatetime)}</span><StatusBadge tone={ca.status === 'open' ? 'warning' : 'accepted'} label={ca.status} /></div>
                <p className="mt-1 text-sm text-[#3f5c64]">{ca.problem}</p>
                {ca.rootCause ? <p className="mt-1 text-xs text-[#789097]">Root cause: {ca.rootCause}</p> : null}
                {ca.actionTaken ? <p className="text-xs text-[#789097]">Action: {ca.actionTaken}</p> : null}
                <p className="mt-1 text-[11px] text-[#9aafb4]">โดย {ca.createdByName ?? '-'}</p>
              </div>
              {ca.status === 'open' ? <Button variant="secondary" className="min-h-8 px-3 py-1.5 text-xs" disabled={busy} onClick={() => close(ca.id)}>ปิด</Button> : null}
            </div>
            <div className="mt-3"><AttachmentList module="iqc" entityType="corrective-action" entityId={ca.id} kind="corrective-action" canDelete={actor.role === 'Admin'} /></div>
          </Card>
        ))}
        {!data.correctiveActions.length ? <Card className="p-8 text-center text-sm text-[#8198a0]"><ClipboardList className="mx-auto mb-2 size-6 text-[#b8c9cd]" />ยังไม่มี corrective action</Card> : null}
      </div>
    </div>
  )
}

function ManageTab({ data, onOk, onErr }: { data: IqcWorkspace; onOk: (t: string, d: IqcWorkspace) => void; onErr: (t: string) => void }) {
  async function request(url: string, body: unknown, okText: string, method: 'POST' | 'PATCH' | 'DELETE' = 'POST') {
    try {
      const result = await api<{ iqc: IqcWorkspace }>(url, { method, body: method === 'DELETE' ? undefined : JSON.stringify(body) })
      onOk(okText, result.iqc)
      return true
    } catch (e) {
      onErr(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ')
      return false
    }
  }
  const post = (url: string, body: unknown, okText: string, method: 'POST' | 'PATCH' = 'POST') => request(url, body, okText, method)
  const remove = (url: string, okText: string) => request(url, null, okText, 'DELETE')
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <AnalyteForm onSubmit={(b) => post('/api/iqc/analytes', b, 'เพิ่ม analyte แล้ว')} onUpdate={(id, b) => post(`/api/iqc/analytes/${id}`, b, 'แก้ไข analyte แล้ว', 'PATCH')} onToggle={(id, a) => post(`/api/iqc/analytes/${id}`, { isActive: a }, a ? 'เปิดใช้ analyte แล้ว' : 'ปิด analyte แล้ว', 'PATCH')} onDelete={(id) => remove(`/api/iqc/analytes/${id}`, 'ลบ analyte แล้ว')} analytes={data.analytes} />
      <InstrumentForm onSubmit={(b) => post('/api/iqc/instruments', b, 'เพิ่ม instrument แล้ว')} onUpdate={(id, b) => post(`/api/iqc/instruments/${id}`, b, 'แก้ไข instrument แล้ว', 'PATCH')} onToggle={(id, a) => post(`/api/iqc/instruments/${id}`, { isActive: a }, a ? 'เปิดใช้ instrument แล้ว' : 'ปิด instrument แล้ว', 'PATCH')} onDelete={(id) => remove(`/api/iqc/instruments/${id}`, 'ลบ instrument แล้ว')} instruments={data.instruments} />
      <MaterialForm onSubmit={(b) => post('/api/iqc/materials', b, 'เพิ่ม control material แล้ว')} onUpdate={(id, b) => post(`/api/iqc/materials/${id}`, b, 'แก้ไข control material แล้ว', 'PATCH')} onToggle={(id, a) => post(`/api/iqc/materials/${id}`, { isActive: a }, a ? 'เปิดใช้ material แล้ว' : 'ปิด material แล้ว', 'PATCH')} onDelete={(id) => remove(`/api/iqc/materials/${id}`, 'ลบ control material แล้ว')} materials={data.controlMaterials} />
      <LotForm
        onSubmit={(b) => post('/api/iqc/lots', b, 'เพิ่ม control lot แล้ว')}
        onUpdate={(id, b) => post(`/api/iqc/lots/${id}`, b, 'แก้ไข control lot แล้ว', 'PATCH')}
        onToggle={(id, isActive) => post(`/api/iqc/lots/${id}`, { isActive }, isActive ? 'เปิดใช้ lot แล้ว' : 'ปิด lot แล้ว', 'PATCH')}
        onDelete={(id) => remove(`/api/iqc/lots/${id}`, 'ลบ control lot แล้ว')}
        data={data}
      />
      <SpecForm onSubmit={(b) => post('/api/iqc/specs', b, 'บันทึก spec แล้ว')} data={data} />
      <TeaForm onSubmit={(b) => post('/api/iqc/tea', b, 'บันทึก TEa แล้ว')} data={data} />
    </div>
  )
}

function TeaForm({ onSubmit, data }: { onSubmit: (b: unknown) => Promise<boolean>; data: IqcWorkspace }) {
  const [form, setForm] = useState({ analyteId: '', teaValue: '', teaMode: 'absolute', teaUnit: '', sourceRef: '' })
  const [busy, setBusy] = useState(false)
  return (
    <Card className="space-y-3 p-4 lg:col-span-2">
      <h2 className="font-bold text-[#173d50]">Allowable Total Error (TEa) — สำหรับ Six Sigma</h2>
      <p className="text-xs text-[#789097]">VL (log10): HIV/HCV/CMV = 0.5, HBV = 1.0 (absolute)</p>
      <form className="grid gap-2 md:grid-cols-5" onSubmit={async (e) => {
        e.preventDefault()
        if (!form.analyteId || !form.teaValue) return
        setBusy(true)
        const body = { analyteId: form.analyteId, teaValue: Number(form.teaValue), teaMode: form.teaMode, teaUnit: form.teaUnit || null, sourceRef: form.sourceRef || null }
        if (await onSubmit(body)) setForm({ analyteId: '', teaValue: '', teaMode: 'absolute', teaUnit: '', sourceRef: '' })
        setBusy(false)
      }}>
        <Field label="Analyte"><Select value={form.analyteId} onChange={(e) => setForm({ ...form, analyteId: e.target.value })} required><option value="">—</option>{data.analytes.map((a) => <option key={a.id} value={a.id}>{a.code}</option>)}</Select></Field>
        <Field label="TEa value"><Input className="mono" type="number" step="any" value={form.teaValue} onChange={(e) => setForm({ ...form, teaValue: e.target.value })} required /></Field>
        <Field label="Mode"><Select value={form.teaMode} onChange={(e) => setForm({ ...form, teaMode: e.target.value })}><option value="absolute">Absolute</option><option value="percent">Percent</option></Select></Field>
        <Field label="Unit"><Input value={form.teaUnit} onChange={(e) => setForm({ ...form, teaUnit: e.target.value })} placeholder="log10" /></Field>
        <Field label="Source ref"><Input value={form.sourceRef} onChange={(e) => setForm({ ...form, sourceRef: e.target.value })} /></Field>
        <div className="md:col-span-5"><Button disabled={busy}>บันทึก TEa</Button></div>
      </form>
    </Card>
  )
}

function AnalyteForm({ onSubmit, onUpdate, onToggle, onDelete, analytes }: { onSubmit: (b: unknown) => Promise<boolean>; onUpdate: (id: string, b: unknown) => Promise<boolean>; onToggle: (id: string, isActive: boolean) => Promise<boolean>; onDelete: (id: string) => Promise<boolean>; analytes: IqcWorkspace['analytes'] }) {
  const [form, setForm] = useState({ code: '', name: '', dataType: 'quantitative', scale: 'linear', isAbsolute: false, unit: '', groupLabel: '' })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  function reset() {
    setEditingId(null)
    setForm({ code: '', name: '', dataType: 'quantitative', scale: 'linear', isAbsolute: false, unit: '', groupLabel: '' })
  }
  return (
    <Card className="space-y-3 p-4">
      <h2 className="font-bold text-[#173d50]">{editingId ? 'Edit analyte' : 'Analyte'}</h2>
      <form className="space-y-2" onSubmit={async (e) => { e.preventDefault(); setBusy(true); if (editingId ? await onUpdate(editingId, form) : await onSubmit(form)) reset(); setBusy(false) }}>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Code"><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} required /></Field>
          <Field label="ชื่อ / Name"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></Field>
          <Field label="Data type"><Select value={form.dataType} onChange={(e) => setForm({ ...form, dataType: e.target.value })}><option value="quantitative">Quantitative</option><option value="qualitative">Qualitative</option></Select></Field>
          <Field label="Scale"><Select value={form.scale} onChange={(e) => setForm({ ...form, scale: e.target.value })}><option value="linear">Linear</option><option value="log10">Log10 (VL)</option></Select></Field>
          <Field label="Unit"><Input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="%, cells/µL, IU/mL" /></Field>
          <Field label="Group"><Input value={form.groupLabel} onChange={(e) => setForm({ ...form, groupLabel: e.target.value })} placeholder="CD4 Panel" /></Field>
        </div>
        <label className="flex items-center gap-2 text-sm text-[#3f5c64]"><input type="checkbox" checked={form.isAbsolute} onChange={(e) => setForm({ ...form, isAbsolute: e.target.checked })} /> เป็นค่า absolute count (เช่น AbsCD4 — Trucount มีผล)</label>
        <div className="flex flex-wrap gap-2">
          <Button disabled={busy}>{editingId ? 'บันทึกการแก้ไข' : 'เพิ่ม analyte'}</Button>
          {editingId ? <Button type="button" variant="ghost" disabled={busy} onClick={reset}>ยกเลิก</Button> : null}
        </div>
      </form>
      <ManagedList noun="Analyte" onToggle={onToggle} onEdit={(id) => { const item = analytes.find((a) => a.id === id); if (!item) return; setEditingId(id); setForm({ code: item.code, name: item.name, dataType: item.dataType, scale: item.scale, isAbsolute: item.isAbsolute, unit: item.unit ?? '', groupLabel: item.groupLabel ?? '' }) }} onDelete={(id) => onDelete(id)} items={analytes.map((a) => ({ id: a.id, label: a.code, sublabel: `${a.name}${a.groupLabel ? ` · ${a.groupLabel}` : ''}`, isActive: a.isActive }))} />
    </Card>
  )
}

function InstrumentForm({ onSubmit, onUpdate, onToggle, onDelete, instruments }: { onSubmit: (b: unknown) => Promise<boolean>; onUpdate: (id: string, b: unknown) => Promise<boolean>; onToggle: (id: string, isActive: boolean) => Promise<boolean>; onDelete: (id: string) => Promise<boolean>; instruments: IqcWorkspace['instruments'] }) {
  const [form, setForm] = useState({ code: '', name: '', model: '' })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  function reset() {
    setEditingId(null)
    setForm({ code: '', name: '', model: '' })
  }
  return (
    <Card className="space-y-3 p-4">
      <h2 className="font-bold text-[#173d50]">{editingId ? 'Edit instrument' : 'Instrument'}</h2>
      <form className="grid grid-cols-3 gap-2" onSubmit={async (e) => { e.preventDefault(); setBusy(true); if (editingId ? await onUpdate(editingId, form) : await onSubmit(form)) reset(); setBusy(false) }}>
        <Field label="Code"><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} required /></Field>
        <Field label="Name"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></Field>
        <Field label="Model"><Input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} placeholder="cobas 6800" /></Field>
        <div className="col-span-3 flex flex-wrap gap-2">
          <Button disabled={busy}>{editingId ? 'บันทึกการแก้ไข' : 'เพิ่ม instrument'}</Button>
          {editingId ? <Button type="button" variant="ghost" disabled={busy} onClick={reset}>ยกเลิก</Button> : null}
        </div>
      </form>
      <ManagedList noun="Instrument" onToggle={onToggle} onEdit={(id) => { const item = instruments.find((i) => i.id === id); if (!item) return; setEditingId(id); setForm({ code: item.code, name: item.name, model: item.model ?? '' }) }} onDelete={(id) => onDelete(id)} items={instruments.map((i) => ({ id: i.id, label: i.code, sublabel: `${i.name}${i.model ? ` · ${i.model}` : ''}`, isActive: i.isActive }))} />
    </Card>
  )
}

function MaterialForm({ onSubmit, onUpdate, onToggle, onDelete, materials }: { onSubmit: (b: unknown) => Promise<boolean>; onUpdate: (id: string, b: unknown) => Promise<boolean>; onToggle: (id: string, isActive: boolean) => Promise<boolean>; onDelete: (id: string) => Promise<boolean>; materials: IqcWorkspace['controlMaterials'] }) {
  const [form, setForm] = useState({ name: '', level: '', manufacturer: '' })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  function reset() {
    setEditingId(null)
    setForm({ name: '', level: '', manufacturer: '' })
  }
  return (
    <Card className="space-y-3 p-4">
      <h2 className="font-bold text-[#173d50]">{editingId ? 'Edit control material' : 'Control material'}</h2>
      <form className="grid grid-cols-3 gap-2" onSubmit={async (e) => { e.preventDefault(); setBusy(true); if (editingId ? await onUpdate(editingId, form) : await onSubmit(form)) reset(); setBusy(false) }}>
        <Field label="Name"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></Field>
        <Field label="Level"><Input value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value })} placeholder="HPC/LPC/Normal" /></Field>
        <Field label="Manufacturer"><Input value={form.manufacturer} onChange={(e) => setForm({ ...form, manufacturer: e.target.value })} /></Field>
        <div className="col-span-3 flex flex-wrap gap-2">
          <Button disabled={busy}>{editingId ? 'บันทึกการแก้ไข' : 'เพิ่ม material'}</Button>
          {editingId ? <Button type="button" variant="ghost" disabled={busy} onClick={reset}>ยกเลิก</Button> : null}
        </div>
      </form>
      <ManagedList noun="Control material" onToggle={onToggle} onEdit={(id) => { const item = materials.find((m) => m.id === id); if (!item) return; setEditingId(id); setForm({ name: item.name, level: item.level ?? '', manufacturer: item.manufacturer ?? '' }) }} onDelete={(id) => onDelete(id)} items={materials.map((m) => ({ id: m.id, label: m.name, sublabel: [m.level, m.manufacturer].filter(Boolean).join(' · ') || undefined, isActive: m.isActive }))} />
    </Card>
  )
}

function LotForm({ onSubmit, onUpdate, onToggle, onDelete, data }: { onSubmit: (b: unknown) => Promise<boolean>; onUpdate: (id: string, b: unknown) => Promise<boolean>; onToggle: (id: string, isActive: boolean) => Promise<boolean>; onDelete: (id: string) => Promise<boolean>; data: IqcWorkspace }) {
  const [form, setForm] = useState({ controlMaterialId: '', lotNumber: '', expiryDate: '' })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  function reset() {
    setEditingId(null)
    setForm({ controlMaterialId: '', lotNumber: '', expiryDate: '' })
  }
  return (
    <Card className="space-y-3 p-4">
      <h2 className="font-bold text-[#173d50]">{editingId ? 'Edit control lot' : 'Control lot'}</h2>
      <form className="grid grid-cols-3 gap-2" onSubmit={async (e) => { e.preventDefault(); if (!form.controlMaterialId) return; setBusy(true); if (editingId ? await onUpdate(editingId, { ...form, expiryDate: form.expiryDate || null }) : await onSubmit({ ...form, expiryDate: form.expiryDate || null })) reset(); setBusy(false) }}>
        <Field label="Material"><Select value={form.controlMaterialId} onChange={(e) => setForm({ ...form, controlMaterialId: e.target.value })} required><option value="">—</option>{data.controlMaterials.filter((m) => m.isActive).map((m) => <option key={m.id} value={m.id}>{m.name}{m.level ? ` (${m.level})` : ''}</option>)}</Select></Field>
        <Field label="Lot no."><Input value={form.lotNumber} onChange={(e) => setForm({ ...form, lotNumber: e.target.value })} required /></Field>
        <Field label="Expiry"><Input type="date" value={form.expiryDate} onChange={(e) => setForm({ ...form, expiryDate: e.target.value })} /></Field>
        <div className="col-span-3 flex flex-wrap gap-2">
          <Button disabled={busy}>{editingId ? 'บันทึกการแก้ไข' : 'เพิ่ม lot'}</Button>
          {editingId ? <Button type="button" variant="ghost" disabled={busy} onClick={reset}>ยกเลิก</Button> : null}
        </div>
      </form>
      <ManagedList
        noun="Control lot"
        onToggle={onToggle}
        onEdit={(id) => {
          const item = data.controlLots.find((lot) => lot.id === id)
          if (!item) return
          setEditingId(id)
          setForm({ controlMaterialId: item.controlMaterialId, lotNumber: item.lotNumber, expiryDate: item.expiryDate ?? '' })
        }}
        onDelete={(id) => onDelete(id)}
        items={data.controlLots.map((l) => ({ id: l.id, label: l.lotNumber, sublabel: `${l.controlMaterialName}${l.level ? ` ${l.level}` : ''}${l.expiryDate ? ` · exp ${formatDate(l.expiryDate)}` : ''}`, isActive: l.isActive }))}
      />
    </Card>
  )
}

function SpecForm({ onSubmit, data }: { onSubmit: (b: unknown) => Promise<boolean>; data: IqcWorkspace }) {
  const [form, setForm] = useState({ controlLotId: '', analyteId: '', assignedMean: '', assignedSd: '', expectedQualitative: '' })
  const [busy, setBusy] = useState(false)
  return (
    <Card className="space-y-3 p-4 lg:col-span-2">
      <h2 className="font-bold text-[#173d50]">Assigned spec (mean/SD ของผู้ผลิต)</h2>
      <form className="grid gap-2 md:grid-cols-5" onSubmit={async (e) => {
        e.preventDefault()
        if (!form.controlLotId || !form.analyteId) return
        setBusy(true)
        const body = { controlLotId: form.controlLotId, analyteId: form.analyteId, assignedMean: form.assignedMean === '' ? null : Number(form.assignedMean), assignedSd: form.assignedSd === '' ? null : Number(form.assignedSd), expectedQualitative: form.expectedQualitative || null }
        if (await onSubmit(body)) setForm({ controlLotId: '', analyteId: '', assignedMean: '', assignedSd: '', expectedQualitative: '' })
        setBusy(false)
      }}>
        <Field label="Control lot"><Select value={form.controlLotId} onChange={(e) => setForm({ ...form, controlLotId: e.target.value })} required><option value="">—</option>{data.controlLots.map((l) => <option key={l.id} value={l.id}>{l.controlMaterialName}{l.level ? ` ${l.level}` : ''} · {l.lotNumber}</option>)}</Select></Field>
        <Field label="Analyte"><Select value={form.analyteId} onChange={(e) => setForm({ ...form, analyteId: e.target.value })} required><option value="">—</option>{data.analytes.map((a) => <option key={a.id} value={a.id}>{a.code}</option>)}</Select></Field>
        <Field label="Assigned mean"><Input className="mono" type="number" step="any" value={form.assignedMean} onChange={(e) => setForm({ ...form, assignedMean: e.target.value })} /></Field>
        <Field label="Assigned SD"><Input className="mono" type="number" step="any" value={form.assignedSd} onChange={(e) => setForm({ ...form, assignedSd: e.target.value })} /></Field>
        <Field label="Expected (qual)"><Input value={form.expectedQualitative} onChange={(e) => setForm({ ...form, expectedQualitative: e.target.value })} placeholder="valid/pos" /></Field>
        <div className="md:col-span-5"><Button disabled={busy}>บันทึก spec</Button></div>
      </form>
    </Card>
  )
}
