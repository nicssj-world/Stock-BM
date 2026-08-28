'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, CalendarClock, Calculator, ChevronDown, ClipboardList, Eye, Gauge, Layers3, Lock, LineChart, ListFilter, PlusCircle, Printer, Search, Settings, Sigma, Trash2, Wrench } from 'lucide-react'
import type { BmActor } from '@/lib/bm/types'
import { LAB_LOCK_MIN_POINTS, type IqcCorrectiveAction, type IqcUncertaintyBudget, type IqcWorkspace } from '@/lib/iqc/types'
import { findCorrectiveActionForPoint, runsWithoutCorrectiveActions } from '@/lib/iqc/corrective-actions'
import { hasTestSet, parseTestSets } from '@/lib/iqc/test-sets'
import { formatDate, formatDateTime } from '@/lib/bm/rules'
import { api, Button, Card, Field, Input, Notice, PageHeader, Select, StatCard, StatusBadge, Tabs, Textarea } from '@/components/ui'
import { LjChart } from '@/components/lj-chart'
import { AttachmentList } from '@/components/attachments'
import { ManagedList } from '@/components/managed-list'
import { IqcSettingsCenter } from '@/components/iqc-settings-center'

type Tab = 'charts' | 'enter' | 'sixsigma' | 'uncertainty' | 'corrective' | 'manage'
type NoticeState = { tone: 'success' | 'danger'; text: string } | null
type CorrectiveActionFilter = 'active' | 'open' | 'awaiting-effectiveness' | 'closed' | 'all'
type CorrectiveActionEdit = { problem: string; rootCause: string; actionTaken: string; ownerId: string; dueDate: string }

function nowForDatetimeLocalInput() {
  const now = new Date()
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}

type IqcViewProps = {
  actor: BmActor
  initialData: IqcWorkspace
  initialTab?: Tab
  initialSetup?: string | null
  initialInstrumentId?: string | null
  initialLotId?: string | null
  initialAnalyteId?: string | null
}

export function IqcView({ actor, initialData, initialTab = 'enter', initialSetup = null, initialInstrumentId = null, initialLotId = null, initialAnalyteId = null }: IqcViewProps) {
  const [data, setData] = useState(initialData)
  const [tab, setTab] = useState<Tab>(initialTab)
  const [notice, setNotice] = useState<NoticeState>(null)
  const [focusedCorrectiveActionId, setFocusedCorrectiveActionId] = useState<string | null>(null)
  const canManageIqc = actor.role !== 'Assistant'

  const tabs = [
    { key: 'enter' as const, label: '1. บันทึกผล IQC', icon: PlusCircle },
    { key: 'charts' as const, label: '2. ตรวจสอบผล', icon: LineChart },
    { key: 'corrective' as const, label: '3. จัดการผลผิดปกติ', icon: Wrench },
    ...(canManageIqc ? [{ key: 'manage' as const, label: '4. ตั้งค่าและทบทวน', icon: Settings }] : []),
    { key: 'sixsigma' as const, label: 'วิเคราะห์ Six Sigma', icon: Gauge },
    { key: 'uncertainty' as const, label: 'Uncertainty', icon: Sigma },
  ]

  function ok(text: string, next: IqcWorkspace) {
    setData(next)
    setNotice({ tone: 'success', text })
  }
  function err(text: string) {
    setNotice({ tone: 'danger', text })
  }
  function openCorrectiveAction(id: string) {
    setFocusedCorrectiveActionId(id)
    setTab('corrective')
  }

  const [panel, setPanel] = useState<string>('all')
  const panels = useMemo(() => {
    const set = new Set<string>()
    data.charts.forEach((c) => parseTestSets(c.groupLabel).forEach((name) => set.add(name)))
    data.analytes.filter((a) => a.isActive).forEach((a) => parseTestSets(a.groupLabel).forEach((name) => set.add(name)))
    return [...set].sort()
  }, [data])
  const panelFilterVisible = tab === 'charts' || tab === 'sixsigma' || tab === 'uncertainty'
  const selectedPanel = panel !== 'all' && panels.includes(panel) ? panel : 'all'
  const scoped = useMemo(() => {
    const activePanel = panelFilterVisible ? selectedPanel : 'all'
    const keep = (g: string | null) => activePanel === 'all' || hasTestSet(g, activePanel)
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
        investigate: charts.filter((c) => c.status === 'investigate').length,
        notEvaluated: charts.filter((c) => c.status === 'not_evaluated').length,
      },
    }
  }, [data, panelFilterVisible, selectedPanel])
  const visibleAlerts = useMemo(() => {
    const activeLotIds = new Set(data.controlLots.filter((lot) => lot.isActive).map((lot) => lot.id))
    const scopedChartKeys = new Set(scoped.charts.map((chart) => chart.key))
    const scopedLotIds = new Set(scoped.charts.map((chart) => chart.controlLotId))
    const scopedAnalyteIds = new Set(scoped.analytes.map((analyte) => analyte.id))
    const filterAlertsByTestSet = panelFilterVisible && selectedPanel !== 'all'
    return data.alerts.filter((alert) => {
      if (alert.kind === 'lot-expiring' && !activeLotIds.has(alert.id.slice('lot:'.length))) return false
      if (!filterAlertsByTestSet) return true
      if (alert.kind === 'rejected-trend' || alert.kind === 'investigate-trend') return scopedChartKeys.has(alert.id.slice(alert.kind === 'rejected-trend' ? 'trend:'.length : 'investigate:'.length))
      if (alert.kind === 'lot-expiring') return scopedLotIds.has(alert.id.slice('lot:'.length))
      if (alert.kind === 'control-due') {
        const planId = alert.id.slice('plan:'.length)
        return data.controlPlans.some((plan) => plan.id === planId && scopedAnalyteIds.has(plan.analyteId))
      }
      if (alert.kind === 'capa-overdue') {
        const actionId = alert.id.slice('capa:'.length)
        const action = data.correctiveActions.find((item) => item.id === actionId)
        return !action?.analyteId || scopedAnalyteIds.has(action.analyteId)
      }
      return true
    })
  }, [data, panelFilterVisible, scoped, selectedPanel])

  return (
    <div className="mx-auto max-w-[1500px] space-y-5">
      <PageHeader eyebrow="Internal Quality Control" title="IQC" description="Levey-Jennings, Westgard rules, ควบคุมคุณภาพภายในต่อ analyte / control lot" />
      {notice ? <Notice tone={notice.tone}>{notice.text}</Notice> : null}

      <Tabs tabs={tabs} active={tab} onChange={setTab} />

      {panelFilterVisible && panels.length > 1 ? (
        <Card className="border-[#d6e2e3] bg-[#fbfefe] p-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="flex shrink-0 items-start gap-2">
              <ListFilter className="mt-0.5 size-4 text-[#0b7f76]" aria-hidden="true" />
              <div>
                <p className="text-xs font-bold tracking-[0.12em] text-[#315763] uppercase">ตัวกรองข้อมูล</p>
                <p className="mt-0.5 text-[11px] text-[#789097]">กรองผลตาม Test set</p>
              </div>
            </div>
            <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto pb-0.5" role="group" aria-label="กรองข้อมูลตาม Test set">
              {['all', ...panels].map((p) => {
                const on = selectedPanel === p
                return (
                  <button key={p} type="button" aria-pressed={on} onClick={() => setPanel(p)} className={`shrink-0 rounded-md px-3.5 py-2 text-sm font-bold transition focus-visible:ring-2 focus-visible:ring-[#0b7f76] focus-visible:outline-none ${on ? 'bg-[#0b7f76] text-white shadow-sm' : 'text-[#3f6470] hover:bg-white'}`}>
                    {p === 'all' ? 'ทั้งหมด' : p}
                  </button>
                )
              })}
            </div>
          </div>
          <p className="mt-2 border-t border-[#e5eeee] pt-2 text-[11px] text-[#789097]">กำลังดู: <span className="font-semibold text-[#58747d]">{selectedPanel === 'all' ? 'ทุก Test set' : selectedPanel}</span> · ตัวกรองนี้ใช้กับ ตรวจสอบผล, Six Sigma และ Uncertainty</p>
        </Card>
      ) : null}

      {tab !== 'enter' ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Charts" value={scoped.summary.chartCount} />
        <StatCard label="In-control" value={scoped.summary.inControl} tone="accepted" />
        <StatCard label="Warning" value={scoped.summary.warning} tone="warning" />
        <StatCard label="Rejected" value={scoped.summary.rejected} tone="rejected" hint={`${data.summary.openCorrectiveActions} corrective action ค้าง`} />
        <StatCard label="ต้องตรวจสอบ" value={scoped.summary.investigate ?? 0} tone="investigate" />
        <StatCard label="ยังไม่ประเมิน" value={scoped.summary.notEvaluated ?? 0} tone="not_evaluated" />
      </div> : null}

      {tab !== 'enter' && visibleAlerts.length ? (
        <Card className="p-3">
          <div className="flex flex-wrap gap-2">
            {visibleAlerts.map((alert) => (
              <span key={alert.id} className={`inline-flex max-w-full items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-semibold ${alert.tone === 'rejected' ? 'border-[#efc7cc] bg-[#fff5f6] text-[#c02a37]' : 'border-[#eed4a6] bg-[#fff9ed] text-[#a9700f]'}`}>
                <AlertTriangle className="size-3.5 shrink-0" /> {alert.title} <span className="font-normal opacity-80">· {alert.detail}</span>
              </span>
            ))}
          </div>
        </Card>
      ) : null}

      {tab === 'charts' ? <ChartsOverviewTab data={scoped} isAdmin={canManageIqc} onOk={ok} onErr={err} onOpenCorrectiveAction={openCorrectiveAction} /> : null}
      {tab === 'enter' ? <EnterTab data={scoped} onOk={ok} onErr={err} onDone={() => setTab('charts')} /> : null}
      {tab === 'sixsigma' ? <SixSigmaTab data={scoped} /> : null}
      {tab === 'uncertainty' ? <UncertaintyTab data={scoped} isAdmin={canManageIqc} onOk={ok} onErr={err} /> : null}
      {tab === 'corrective' ? <CorrectiveTab data={data} actor={actor} onOk={ok} onErr={err} focusId={focusedCorrectiveActionId} /> : null}
      {tab === 'manage' && canManageIqc ? <IqcSettingsCenter data={data} actor={actor} initialSetup={initialSetup} initialInstrumentId={initialInstrumentId} initialLotId={initialLotId} initialAnalyteId={initialAnalyteId} onOk={ok} onErr={err} /> : null}
    </div>
  )
}

type ChartStatusFilter = 'attention' | 'all' | 'accepted' | 'warning' | 'investigate' | 'rejected' | 'not_evaluated' | 'unlocked' | 'expiring'
type LotVisibility = 'active' | 'closed'

function chartStatusRank(status: IqcWorkspace['charts'][number]['status']) {
  return status === 'rejected' ? 0 : status === 'investigate' ? 1 : status === 'warning' ? 2 : status === 'not_evaluated' ? 3 : 4
}

function chartStatusLabel(status: IqcWorkspace['charts'][number]['status']) {
  return status === 'accepted' ? 'ผ่าน' : status === 'warning' ? 'แจ้งเตือน' : status === 'investigate' ? 'ต้องตรวจสอบ' : status === 'rejected' ? 'Rejected' : 'ยังไม่ประเมิน'
}

function worstChartStatus(charts: IqcWorkspace['charts']): IqcWorkspace['charts'][number]['status'] {
  return [...charts].sort((a, b) => chartStatusRank(a.status) - chartStatusRank(b.status))[0]?.status ?? 'accepted'
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

function ChartsOverviewTab({ data, isAdmin, onOk, onErr, onOpenCorrectiveAction }: { data: IqcWorkspace; isAdmin: boolean; onOk: (t: string, d: IqcWorkspace) => void; onErr: (t: string) => void; onOpenCorrectiveAction: (id: string) => void }) {
  const [busy, setBusy] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<ChartStatusFilter>('all')
  const [lotVisibility, setLotVisibility] = useState<LotVisibility>('active')
  const [query, setQuery] = useState('')
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [selectedPointId, setSelectedPointId] = useState<string | null>(null)

  async function lockLot(controlLotId: string, charts: IqcWorkspace['charts']) {
    let overrideReason: string | undefined
    const unlocked = charts.filter((chart) => !chart.labLockedAt)
    if (!unlocked.length) return
    const needsOverride = unlocked.some((chart) => chart.n >= 2 && !chart.lockEligible)
    if (needsOverride) {
      const reason = window.prompt('บาง analyte ยังไม่ครบ 20 จุด — ระบุเหตุผลในการ override ก่อน Lock & ปิด Lot:')
      if (reason == null || !reason.trim()) return
      overrideReason = reason.trim()
    }
    setBusy(`lot:${controlLotId}`)
    try {
      const result = await api<{ iqc: IqcWorkspace }>('/api/iqc/lock/lot', {
        method: 'POST',
        body: JSON.stringify({ controlLotId, overrideReason }),
      })
      onOk(needsOverride ? 'Lock และปิด Lot แบบ override แล้ว' : 'Lock และปิด Lot แล้ว', result.iqc)
    } catch (e) {
      onErr(e instanceof Error ? e.message : 'Lock และปิด Lot ไม่สำเร็จ')
    } finally {
      setBusy(null)
    }
  }

  async function unlockLot(controlLotId: string) {
    const reason = window.prompt('ระบุเหตุผลในการปลดล็อคตาราง QC ทั้ง lot:')
    if (reason == null || !reason.trim()) return
    setBusy(`lot:${controlLotId}`)
    try {
      const result = await api<{ iqc: IqcWorkspace }>('/api/iqc/lock/lot', {
        method: 'DELETE',
        body: JSON.stringify({ controlLotId, reason: reason.trim() }),
      })
      onOk('ปลดล็อคทั้ง lot แล้ว', result.iqc)
    } catch (e) {
      onErr(e instanceof Error ? e.message : 'Unlock ทั้ง lot ไม่สำเร็จ')
    } finally {
      setBusy(null)
    }
  }

  async function voidPoint(resultId: string) {
    const reason = window.prompt('ระบุเหตุผลในการ void ผล IQC จุดนี้:')
    if (reason == null || !reason.trim()) return
    setBusy(`point:${resultId}`)
    try {
      const result = await api<{ iqc: IqcWorkspace }>(`/api/iqc/results/${resultId}/void`, {
        method: 'POST',
        body: JSON.stringify({ reason: reason.trim() }),
      })
      setSelectedPointId(null)
      onOk('Void ผล IQC แล้ว และ refresh chart แล้ว', result.iqc)
    } catch (e) {
      onErr(e instanceof Error ? e.message : 'Void result ไม่สำเร็จ')
    } finally {
      setBusy(null)
    }
  }

  async function createPointCorrectiveAction(point: IqcWorkspace['charts'][number]['points'][number], chart: IqcWorkspace['charts'][number], problem: string) {
    setBusy(`point:${point.resultId}`)
    try {
      const result = await api<{ iqc: IqcWorkspace }>('/api/iqc/corrective-actions', {
        method: 'POST',
        body: JSON.stringify({
          runId: point.runId,
          analyteId: chart.analyteId,
          problem,
        }),
      })
      onOk('บันทึก corrective action สำหรับจุดนี้แล้ว', result.iqc)
    } catch (e) {
      onErr(e instanceof Error ? e.message : 'บันทึก corrective action ไม่สำเร็จ')
    } finally {
      setBusy(null)
    }
  }

  if (!data.charts.length) {
    return <Card className="p-8 text-center text-sm text-[#8198a0]">ยังไม่มีข้อมูล IQC — เพิ่ม analyte/control แล้วบันทึกผลที่แท็บบันทึกผล</Card>
  }

  const lotsById = new Map(data.controlLots.map((lot) => [lot.id, lot]))
  const expiringLotIds = new Set(
    data.controlLots
      .filter((lot) => {
        if (!lot.isActive) return false
        const days = daysUntil(lot.expiryDate)
        return days != null && days >= 0 && days <= 30
      })
      .map((lot) => lot.id),
  )
  const visibleLotCharts = data.charts.filter((chart) => lotsById.get(chart.controlLotId)?.isActive === (lotVisibility === 'active'))
  const attentionKeys = new Set(visibleLotCharts.filter((chart) => chart.status !== 'accepted' || expiringLotIds.has(chart.controlLotId)).map((chart) => chart.key))
  const rejectedCount = visibleLotCharts.filter((chart) => chart.status === 'rejected').length
  const warningCount = visibleLotCharts.filter((chart) => chart.status === 'warning').length
  const investigateCount = visibleLotCharts.filter((chart) => chart.status === 'investigate').length
  const notEvaluatedCount = visibleLotCharts.filter((chart) => chart.status === 'not_evaluated').length
  const legacyCharts = visibleLotCharts.filter((chart) => chart.policyProfile !== 'vl-standard-v1')
  const unlockedCount = legacyCharts.filter((chart) => !chart.labLockedAt).length
  const expiringCount = new Set(visibleLotCharts.filter((chart) => expiringLotIds.has(chart.controlLotId)).map((chart) => chart.controlLotId)).size
  const q = query.trim().toLowerCase()
  const filteredCharts = visibleLotCharts
    .filter((chart) => {
      if (statusFilter === 'attention' && !attentionKeys.has(chart.key)) return false
      if (statusFilter === 'accepted' && chart.status !== 'accepted') return false
      if (statusFilter === 'warning' && chart.status !== 'warning') return false
      if (statusFilter === 'investigate' && chart.status !== 'investigate') return false
      if (statusFilter === 'rejected' && chart.status !== 'rejected') return false
      if (statusFilter === 'not_evaluated' && chart.status !== 'not_evaluated') return false
      if (statusFilter === 'unlocked' && (chart.policyProfile === 'vl-standard-v1' || chart.labLockedAt)) return false
      if (statusFilter === 'expiring' && !expiringLotIds.has(chart.controlLotId)) return false
      if (!q) return true
      return [chart.controlMaterialName, chart.level, chart.lotNumber, chart.analyteCode, chart.analyteName, chart.groupLabel].filter(Boolean).join(' ').toLowerCase().includes(q)
    })
    .sort((a, b) => chartStatusRank(a.status) - chartStatusRank(b.status) || a.controlMaterialName.localeCompare(b.controlMaterialName) || a.lotNumber.localeCompare(b.lotNumber) || a.analyteCode.localeCompare(b.analyteCode))
  const selectedChart = filteredCharts.find((chart) => chart.key === selectedKey) ?? null
  const selectedPoint = selectedChart?.points.find((point) => point.resultId === selectedPointId) ?? null
  const selectedRun = selectedPoint ? (data.runs.find((run) => run.id === selectedPoint.runId) ?? null) : null
  const selectedRunResult = selectedRun?.results.find((result) => result.analyteId === selectedChart?.analyteId && result.controlLotId === selectedChart.controlLotId) ?? null
  const linkedCorrectiveAction = selectedPoint && selectedChart ? findCorrectiveActionForPoint(data.correctiveActions, selectedPoint.runId, selectedChart.analyteId) : null
  const grouped = filteredCharts.reduce((map, chart) => {
    const current = map.get(chart.controlLotId) ?? []
    current.push(chart)
    map.set(chart.controlLotId, current)
    return map
  }, new Map<string, IqcWorkspace['charts']>())

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        <div className="grid gap-px bg-[#dbe8e9] sm:grid-cols-2 xl:grid-cols-7">
          <button
            type="button"
            onClick={() => {
              setStatusFilter('attention')
              setSelectedKey(null)
            }}
            className={`bg-white p-4 text-left transition hover:bg-[#f7fbfb] ${statusFilter === 'attention' ? 'ring-2 ring-inset ring-[#0b7f76]' : ''}`}
          >
            <div className="flex items-center gap-2 text-[11px] font-bold tracking-[0.14em] text-[#789097] uppercase">
              <ListFilter className="size-4" /> Needs attention
            </div>
            <div className="mono mt-2 text-2xl font-bold text-[#173d50]">{attentionKeys.size}</div>
            <p className="mt-1 text-xs text-[#789097]">warning, investigate, rejected หรือยังไม่ประเมิน</p>
          </button>
          <button
            type="button"
            onClick={() => {
              setStatusFilter('rejected')
              setSelectedKey(null)
            }}
            className={`bg-white p-4 text-left transition hover:bg-[#fff7f7] ${statusFilter === 'rejected' ? 'ring-2 ring-inset ring-[#c02a37]' : ''}`}
          >
            <div className="flex items-center gap-2 text-[11px] font-bold tracking-[0.14em] text-[#789097] uppercase">
              <AlertTriangle className="size-4" /> Rejected
            </div>
            <div className="mono mt-2 text-2xl font-bold text-[#c02a37]">{rejectedCount}</div>
            <p className="mt-1 text-xs text-[#789097]">out of control</p>
          </button>
          <button
            type="button"
            onClick={() => {
              setStatusFilter('warning')
              setSelectedKey(null)
            }}
            className={`bg-white p-4 text-left transition hover:bg-[#fffaf0] ${statusFilter === 'warning' ? 'ring-2 ring-inset ring-[#a9700f]' : ''}`}
          >
            <div className="flex items-center gap-2 text-[11px] font-bold tracking-[0.14em] text-[#789097] uppercase">
              <AlertTriangle className="size-4" /> Warning
            </div>
            <div className="mono mt-2 text-2xl font-bold text-[#a9700f]">{warningCount}</div>
            <p className="mt-1 text-xs text-[#789097]">Westgard watch</p>
          </button>
          <button
            type="button"
            onClick={() => {
              setStatusFilter('investigate')
              setSelectedKey(null)
            }}
            className={`bg-white p-4 text-left transition hover:bg-[#fffaf0] ${statusFilter === 'investigate' ? 'ring-2 ring-inset ring-[#8f5f1d]' : ''}`}
          >
            <div className="flex items-center gap-2 text-[11px] font-bold tracking-[0.14em] text-[#789097] uppercase">
              <AlertTriangle className="size-4" /> Investigate
            </div>
            <div className="mono mt-2 text-2xl font-bold text-[#8f5f1d]">{investigateCount}</div>
            <p className="mt-1 text-xs text-[#789097]">open investigation</p>
          </button>
          <button
            type="button"
            onClick={() => {
              setStatusFilter('not_evaluated')
              setSelectedKey(null)
            }}
            className={`bg-white p-4 text-left transition hover:bg-[#f7fbfb] ${statusFilter === 'not_evaluated' ? 'ring-2 ring-inset ring-[#789097]' : ''}`}
          >
            <div className="flex items-center gap-2 text-[11px] font-bold tracking-[0.14em] text-[#789097] uppercase">
              <AlertTriangle className="size-4" /> Not evaluated
            </div>
            <div className="mono mt-2 text-2xl font-bold text-[#5b7681]">{notEvaluatedCount}</div>
            <p className="mt-1 text-xs text-[#789097]">baseline not active</p>
          </button>
          <button
            type="button"
            onClick={() => {
              setStatusFilter('expiring')
              setSelectedKey(null)
            }}
            className={`bg-white p-4 text-left transition hover:bg-[#f7fbfb] ${statusFilter === 'expiring' ? 'ring-2 ring-inset ring-[#0b7f76]' : ''}`}
          >
            <div className="flex items-center gap-2 text-[11px] font-bold tracking-[0.14em] text-[#789097] uppercase">
              <CalendarClock className="size-4" /> Expiring lots
            </div>
            <div className="mono mt-2 text-2xl font-bold text-[#173d50]">{expiringCount}</div>
            <p className="mt-1 text-xs text-[#789097]">within 30 days</p>
          </button>
          <button
            type="button"
            onClick={() => {
              setStatusFilter('unlocked')
              setSelectedKey(null)
            }}
            className={`bg-white p-4 text-left transition hover:bg-[#f7fbfb] ${statusFilter === 'unlocked' ? 'ring-2 ring-inset ring-[#0b7f76]' : ''}`}
          >
            <div className="flex items-center gap-2 text-[11px] font-bold tracking-[0.14em] text-[#789097] uppercase">
              <Lock className="size-4" /> Not lab-locked
            </div>
            <div className="mono mt-2 text-2xl font-bold text-[#173d50]">{unlockedCount}</div>
            <p className="mt-1 text-xs text-[#789097]">needs admin review</p>
          </button>
        </div>
      </Card>

      <Card className="p-3">
        <div className="grid gap-3 lg:grid-cols-[1fr_190px_220px]">
          <label className="relative block">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[#789097]" />
            <Input value={query} onChange={(event) => setQuery(event.target.value)} className="pl-9" placeholder="Search control, lot, analyte" />
          </label>
          <Select
            value={lotVisibility}
            onChange={(event) => {
              setLotVisibility(event.target.value as LotVisibility)
              setSelectedKey(null)
              setSelectedPointId(null)
            }}
            aria-label="Lot visibility"
          >
            <option value="active">Active lots</option>
            <option value="closed">Closed lots / History</option>
          </Select>
          <Select
            value={statusFilter}
            onChange={(event) => {
              setStatusFilter(event.target.value as ChartStatusFilter)
              setSelectedKey(null)
              setSelectedPointId(null)
            }}
          >
            <option value="attention">Needs attention</option>
            <option value="all">{lotVisibility === 'active' ? 'All active charts' : 'All closed charts'}</option>
            <option value="rejected">Rejected</option>
            <option value="warning">Warning</option>
            <option value="investigate">ต้องตรวจสอบ</option>
            <option value="not_evaluated">ยังไม่ประเมิน</option>
            <option value="accepted">Accepted</option>
            <option value="expiring">Expiring lots</option>
            <option value="unlocked">Not lab-locked</option>
          </Select>
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(520px,1.25fr)]">
        <div className="space-y-3">
          {filteredCharts.length ? (
            [...grouped.entries()].map(([lotId, charts]) => {
              const lot = lotsById.get(lotId)
              const worst = worstChartStatus(charts)
              const days = daysUntil(lot?.expiryDate ?? null)
              const legacyCharts = charts.filter((chart) => chart.policyProfile !== 'vl-standard-v1')
              const lockedCount = legacyCharts.filter((chart) => chart.labLockedAt).length
              const unlockable = lockedCount > 0
              const hasVlChart = charts.some((chart) => chart.policyProfile === 'vl-standard-v1')
              const lockable = !hasVlChart && charts.some((chart) => !chart.labLockedAt && chart.n >= 2)
              const lotBusy = busy === `lot:${lotId}`
              return (
                <Card key={lotId} className="overflow-hidden">
                  <div className="border-b border-[#e3ebec] bg-[#fbfefe] p-4">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-bold text-[#173d50]">{charts[0]?.controlMaterialName}</h3>
                        {charts[0]?.level ? <span className="rounded-full border border-[#d2dee0] px-2 py-0.5 text-[11px] font-bold text-[#55727c]">{charts[0].level}</span> : null}
                        <StatusBadge tone={worst} label={chartStatusLabel(worst)} />
                        {!lot?.isActive ? <span className="rounded-full border border-[#d2dee0] bg-[#f1f5f5] px-2 py-0.5 text-[11px] font-bold text-[#58747d]">closed</span> : null}
                      </div>
                      <p className="mono mt-1 text-xs text-[#5f7880]">Lot {charts[0]?.lotNumber}</p>
                      {!lot?.isActive && lot?.lockedAt ? (
                        <p className="mt-1 text-xs text-[#789097]">
                          Locked by {lot.lockedByName ?? '-'} · {formatDateTime(lot.lockedAt)}
                        </p>
                      ) : null}
                      {!lot?.isActive && lot?.lockOverrideReason ? (
                        <p className="mt-2 rounded-md border border-[#eed4a6] bg-[#fff9ed] px-2.5 py-2 text-xs text-[#795d2d]">
                          <span className="font-bold text-[#8b5a08]">เหตุผล Override:</span> {lot.lockOverrideReason}
                        </p>
                      ) : null}
                    </div>
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                      {isAdmin ? (
                        <div className="flex flex-wrap items-center gap-2">
                          {lockable ? (
                            <Button variant="secondary" className="min-h-8 px-3 py-1.5 text-xs" disabled={lotBusy} onClick={() => lockLot(lotId, charts)}>
                              <Lock className="size-3.5" /> Lock & ปิด Lot
                            </Button>
                          ) : null}
                          {unlockable ? (
                            <Button variant="danger" className="min-h-8 px-3 py-1.5 text-xs" disabled={lotBusy} onClick={() => unlockLot(lotId)}>
                              <Lock className="size-3.5" /> Unlock ทั้ง Lot
                            </Button>
                          ) : null}
                          {hasVlChart ? <span className="text-xs text-[#0b7f76]">VL ใช้ QC baseline แทน Lock & ปิด Lot</span> : null}
                          {!hasVlChart && !lockable && !unlockable ? <span className="text-xs text-[#789097]">ยังไม่มี analyte ที่ lock ได้</span> : null}
                        </div>
                      ) : null}
                      <div className="ml-auto shrink-0 text-right text-xs text-[#789097]">
                        <div>
                          {charts.length} analyte{charts.length > 1 ? 's' : ''}
                        </div>
                        <div className={lockedCount === legacyCharts.length && legacyCharts.length > 0 ? 'font-bold text-[#18763a]' : 'font-bold text-[#a9700f]'}>
                          {legacyCharts.length ? `${lockedCount}/${legacyCharts.length} Lab locked` : hasVlChart ? 'VL baseline แยกต่างหาก' : 'ยังไม่มี analyte ที่ lock ได้'}
                        </div>
                        {lot?.expiryDate ? <div className={days != null && days <= 30 ? 'font-bold text-[#a9700f]' : ''}>EXP {formatDate(lot.expiryDate)}</div> : null}
                      </div>
                    </div>
                  </div>
                  <div className="divide-y divide-[#eef3f3]">
                    {charts.map((chart) => {
                      const latest = [...chart.points].reverse().find((point) => !point.isVoided)
                      const legacyActiveLimitLabel = chart.activeLimit === 'lab' ? 'LAB Mean/SD' : 'Assigned Mean/SD'
                      const activeLimitLabel = chart.policyProfile === 'vl-standard-v1' && !chart.baselineId
                        ? 'ยังไม่ใช้ตัดสิน · รอ QC baseline'
                        : chart.activeLimit === 'baseline' ? 'QC baseline (lab observed)' : legacyActiveLimitLabel
                      const selected = selectedChart?.key === chart.key
                      return (
                        <div key={chart.key} className={`grid w-full gap-3 px-4 py-3 text-left transition hover:bg-[#f7fbfb] sm:grid-cols-[1fr_auto] ${selected ? 'bg-[#edf8f6] ring-2 ring-inset ring-[#0b7f76]/45' : 'bg-white'}`}>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-bold text-[#173d50]">{chart.analyteCode}</span>
                              <StatusBadge tone={chart.status} label={chartStatusLabel(chart.status)} />
                              {chart.policyProfile === 'vl-standard-v1' ? <span className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${chart.baselineId ? 'border-[#bfe3cf] bg-[#f1fbf4] text-[#18763a]' : 'border-[#d2dee0] bg-[#f6f9f9] text-[#5b7681]'}`}>{chart.baselineId ? 'QC baseline approved' : 'รอ QC baseline'}</span> : !chart.labLockedAt ? <span className="rounded-full border border-[#eed4a6] bg-[#fff9ed] px-2 py-0.5 text-[11px] font-bold text-[#a9700f]">not locked</span> : <span className="rounded-full border border-[#bfe3cf] bg-[#f1fbf4] px-2 py-0.5 text-[11px] font-bold text-[#18763a]">locked</span>}
                            </div>
                            <p className="mt-1 text-xs text-[#789097]">
                              เกณฑ์ที่ใช้: {activeLimitLabel} · n {chart.n} · mean {fmtCompact(chart.mean)} · SD {fmtCompact(chart.sd)}
                              {latest ? ` · latest ${fmtCompact(latest.value)} (${formatDateTime(latest.runDatetime)})` : ''}
                            </p>
                            <p className="mt-1 text-[11px] text-[#58747d]">
                              Assigned: {fmtCompact(chart.assignedMean)} / SD {fmtCompact(chart.assignedSd)} · LAB: {fmtCompact(chart.labMean ?? chart.runningLabMean)} / SD {fmtCompact(chart.labSd ?? chart.runningLabSd)}{chart.labLockedAt ? ` (locked n ${chart.labN ?? chart.runningLabN})` : chart.runningLabMean != null ? ` (คำนวณสด n ${chart.runningLabN} · รอ Lock & ปิด Lot)` : ` (ยังไม่ครบ ${LAB_LOCK_MIN_POINTS} จุด · n ${chart.runningLabN})`}
                            </p>
                          </div>
                          <div className="flex flex-wrap items-center justify-start gap-2 sm:justify-end">
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedKey(chart.key)
                                setSelectedPointId(null)
                              }}
                              className="inline-flex min-h-8 items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-bold text-[#0b7f76] transition hover:bg-[#e1f3f0] focus-visible:ring-2 focus-visible:ring-[#0b7f76] focus-visible:outline-none"
                            >
                              <Eye className="size-4" /> View chart
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </Card>
              )
            })
          ) : (
            <Card className="p-8 text-center text-sm text-[#8198a0]">{lotVisibility === 'active' ? 'No active IQC lots match this filter.' : 'No closed IQC lots match this filter.'}</Card>
          )}
        </div>

        <div className="space-y-2 xl:sticky xl:top-4 xl:self-start">
          {selectedChart ? (
            <>
              <LjChart chart={selectedChart} selectedResultId={selectedPointId} onPointSelect={(point) => setSelectedPointId(point.resultId)} />
              {selectedPoint ? <PointDetailCard key={`${selectedChart.key}:${selectedPoint.resultId}`} chart={selectedChart} point={selectedPoint} run={selectedRun} result={selectedRunResult} correctiveAction={linkedCorrectiveAction} busy={busy === `point:${selectedPoint.resultId}`} onVoid={() => voidPoint(selectedPoint.resultId)} onCreateCorrective={(problem) => createPointCorrectiveAction(selectedPoint, selectedChart, problem)} onOpenCorrectiveAction={onOpenCorrectiveAction} /> : null}
              <div className="flex justify-end">
                  <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-bold ${selectedChart.policyProfile === 'vl-standard-v1' ? selectedChart.baselineId ? 'border-[#bfe3cf] bg-[#f1fbf4] text-[#18763a]' : 'border-[#d2dee0] bg-[#f6f9f9] text-[#5b7681]' : selectedChart.labLockedAt ? 'border-[#bfe3cf] bg-[#f1fbf4] text-[#18763a]' : 'border-[#eed4a6] bg-[#fff9ed] text-[#a9700f]'}`}>
                    <Lock className="size-3.5" /> {selectedChart.policyProfile === 'vl-standard-v1' ? selectedChart.baselineId ? 'QC baseline approved' : 'รอ QC baseline' : selectedChart.labLockedAt ? 'Lab mean/SD locked' : 'Not locked - use lot action'}
                </span>
              </div>
            </>
          ) : (
            <Card className="flex min-h-[320px] flex-col items-center justify-center p-8 text-center">
              <div className="flex size-12 items-center justify-center rounded-lg bg-[#edf8f6] text-[#0b7f76]">
                <Layers3 className="size-6" />
              </div>
              <h3 className="mt-4 font-bold text-[#173d50]">เลือก analyte เพื่อดูกราฟ</h3>
              <p className="mt-2 max-w-sm text-sm leading-6 text-[#789097]">ภาพรวมจะแสดงสถานะและ lot แบบย่อก่อน เพื่อให้ control เยอะ ๆ ยังอ่านง่าย</p>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}

function PointDetailCard({ chart, point, run, result, correctiveAction, busy, onVoid, onCreateCorrective, onOpenCorrectiveAction }: { chart: IqcWorkspace['charts'][number]; point: IqcWorkspace['charts'][number]['points'][number]; run: IqcWorkspace['runs'][number] | null; result: IqcWorkspace['runs'][number]['results'][number] | null; correctiveAction: IqcWorkspace['correctiveActions'][number] | null; busy: boolean; onVoid: () => void; onCreateCorrective: (problem: string) => Promise<void>; onOpenCorrectiveAction: (id: string) => void }) {
  const [problem, setProblem] = useState('')
  const needsAction = point.status === 'warning' || point.status === 'investigate' || point.status === 'rejected'

  async function createCorrectiveAction(event: React.FormEvent) {
    event.preventDefault()
    if (!problem.trim()) return
    await onCreateCorrective(problem.trim())
  }

  return (
    <Card className="space-y-3 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold tracking-[0.14em] text-[#789097] uppercase">Selected point</p>
          <h3 className="mt-1 font-bold text-[#173d50]">
            {chart.analyteCode} · {chart.controlMaterialName} · Lot {chart.lotNumber}
          </h3>
          <p className="mt-1 text-xs text-[#789097]">
            {formatDateTime(point.runDatetime)}
            {run?.instrumentName ? ` · ${run.instrumentName}` : ''}
            {run?.enteredByName ? ` · by ${run.enteredByName}` : ''}
          </p>
        </div>
        <StatusBadge tone={point.isVoided ? 'neutral' : point.status} label={point.isVoided ? 'voided' : point.status} />
      </div>
      <div className="grid gap-2 text-sm sm:grid-cols-3">
        <div className="rounded-md border border-[#e2ecee] bg-[#fbfefe] p-3">
          <p className="text-[11px] font-bold text-[#789097] uppercase">Value</p>
          <p className="mono mt-1 text-lg font-bold tabular-nums text-[#173d50]">
            {fmtCompact(point.value)}
            {chart.unit ? ` ${chart.unit}` : ''}
          </p>
        </div>
        <div className="rounded-md border border-[#e2ecee] bg-[#fbfefe] p-3">
          <p className="text-[11px] font-bold text-[#789097] uppercase">Z-score</p>
          <p className="mono mt-1 text-lg font-bold tabular-nums text-[#173d50]">{point.z == null ? '—' : point.z.toFixed(2)}</p>
        </div>
        <div className="rounded-md border border-[#e2ecee] bg-[#fbfefe] p-3">
          <p className="text-[11px] font-bold text-[#789097] uppercase">Rules</p>
          <p className="mt-1 text-sm font-semibold text-[#173d50]">{point.violatedRules.join(', ') || '-'}</p>
        </div>
      </div>

      {run?.note ? <p className="rounded-md bg-[#f6fafa] px-3 py-2 text-xs text-[#58747d]">Note: {run.note}</p> : null}
      {result?.qualitativeValue ? <p className="text-xs text-[#789097]">Qualitative: {result.qualitativeValue}</p> : null}
      {correctiveAction ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[#eed4a6] bg-[#fff9ed] p-3">
          <div>
            <p className="text-xs font-bold text-[#8b5a08]">มี Corrective action สำหรับจุดนี้แล้ว</p>
            <p className="mt-0.5 text-xs text-[#795d2d]">{correctiveAction.problem}</p>
          </div>
          <Button type="button" variant="secondary" className="min-h-8 px-3 py-1.5 text-xs" onClick={() => onOpenCorrectiveAction(correctiveAction.id)}>
            <Wrench className="size-3.5" /> ไปยัง Corrective action
          </Button>
        </div>
      ) : !point.isVoided && needsAction ? (
        <form onSubmit={createCorrectiveAction} className="space-y-2 rounded-md border border-[#e2ecee] bg-[#fbfefe] p-3">
          <p className="text-xs font-bold text-[#315763]">{point.status === 'investigate' ? 'เปิด investigation สำหรับจุดนี้' : 'บันทึก Corrective action สำหรับจุดนี้'}</p>
          <Textarea rows={2} value={problem} onChange={(event) => setProblem(event.target.value)} placeholder="ระบุปัญหาที่พบ" required />
          <div className="flex justify-end">
            <Button className="min-h-8 px-3 py-1.5 text-xs" disabled={busy}>
              {point.status === 'investigate' ? 'เปิด investigation' : 'บันทึก Corrective action'}
            </Button>
          </div>
        </form>
      ) : null}
      <div className="flex justify-end">
        <Button type="button" variant="danger" className="min-h-8 px-3 py-1.5 text-xs" disabled={busy || point.isVoided} onClick={onVoid}>
          <Trash2 className="size-3.5" /> Void result
        </Button>
      </div>
    </Card>
  )
}

const MONTHS: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
}

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
    d = Number(dmon[1])
    m = MONTHS[dmon[2].slice(0, 3).toLowerCase()] ?? null
    y = Number(dmon[3])
  } else if (iso) {
    y = Number(iso[1])
    m = Number(iso[2]) - 1
    d = Number(iso[3])
  } else if (dmy) {
    d = Number(dmy[1])
    m = Number(dmy[2]) - 1
    y = Number(dmy[3])
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
  const [instrumentId, setInstrumentId] = useState(data.instruments[0]?.id ?? '')
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
    if (!instrumentId) return onErr('เลือกเครื่องมือที่ใช้รันก่อนนำเข้า')
    setBusy(true)
    try {
      const result = await api<{ iqc: IqcWorkspace }>('/api/iqc/import', {
        method: 'POST',
        body: JSON.stringify({
          controlLotId,
          instrumentId: instrumentId || null,
          analyteIds: cols,
          trucountLot: trucountLot || null,
          rows: preview,
        }),
      })
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
      <div className="grid gap-2 md:grid-cols-[1fr_1fr_auto_auto]">
        <Field label="Control lot">
          <Select value={controlLotId} onChange={(e) => setControlLotId(e.target.value)}>
            <option value="">—</option>
            {activeLots.map((l) => (
              <option key={l.id} value={l.id}>
                {l.controlMaterialName}
                {l.level ? ` ${l.level}` : ''} · {l.lotNumber}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="เครื่องมือที่ใช้รัน" hint="ใช้กำหนด scope ของ QC baseline; ต้องเป็นเครื่องมือที่เชื่อมจาก Equipment">
          <Select value={instrumentId} onChange={(e) => setInstrumentId(e.target.value)} required>
            <option value="">เลือกเครื่องมือ</option>
            {data.instruments.filter((instrument) => instrument.isActive).map((instrument) => <option key={instrument.id} value={instrument.id}>{instrument.code} · {instrument.name}</option>)}
          </Select>
        </Field>
        <div className="flex items-end">
          <Button type="button" variant="secondary" className="h-9" onClick={fillCols}>
            เติมคอลัมน์จาก spec
          </Button>
        </div>
        <div className="flex items-end">
          <Button type="button" variant="ghost" className="h-9" onClick={() => setCols((c) => [...c, data.analytes[0]?.id ?? ''])}>
            + คอลัมน์
          </Button>
        </div>
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
              <Select className="h-9 flex-1" value={analyteId} onChange={(e) => setCols((cs) => cs.map((x, j) => (j === i ? e.target.value : x)))}>
                {data.analytes.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.code}
                    {a.unit ? ` (${a.unit})` : ''}
                  </option>
                ))}
              </Select>
              <button type="button" className="rounded p-1.5 text-[#c02a37] hover:bg-[#fff0f1]" aria-label="ลบคอลัมน์" onClick={() => setCols((cs) => cs.filter((_, j) => j !== i))}>
                <Trash2 className="size-4" />
              </button>
            </div>
          ))}
        </div>
      ) : null}
      <Textarea rows={6} className="mono text-xs" value={text} onChange={(e) => setText(e.target.value)} placeholder={'18-May-26\t57.79\t857\t11.4\t169\n19-May-26\t55.78\t868\t11.64\t181'} />
      <div className="flex items-center justify-between">
        <span className="text-xs text-[#789097]">{preview.length ? `อ่านได้ ${preview.length} แถว` : 'ยังไม่มีแถวที่อ่านได้'}</span>
        <Button disabled={busy || !preview.length || !controlLotId || !instrumentId} onClick={submit}>
          {busy ? 'กำลังนำเข้า…' : `นำเข้า ${preview.length || ''} run`}
        </Button>
      </div>
    </Card>
  )
}

type ValueRow = {
  id: number
  controlLotId: string
  analyteId: string
  value: string
}
type ConsumableRow = { id: number; kind: string; lotNumber: string; stockLotId: string }

function EnterTab({ data, onOk, onErr, onDone }: { data: IqcWorkspace; onOk: (t: string, d: IqcWorkspace) => void; onErr: (t: string) => void; onDone: () => void }) {
  const activeAnalytes = useMemo(() => data.analytes.filter((a) => a.isActive), [data.analytes])
  const activeLots = useMemo(() => data.controlLots.filter((l) => l.isActive), [data.controlLots])
  const [instrumentId, setInstrumentId] = useState('')
  const [runDatetime, setRunDatetime] = useState('')
  const [note, setNote] = useState('')
  const [consumables, setConsumables] = useState<ConsumableRow[]>([])
  const [rows, setRows] = useState<ValueRow[]>([])
  const [fillLot, setFillLot] = useState('')
  const [testSet, setTestSet] = useState('')
  const [lotMappingWarning, setLotMappingWarning] = useState('')
  const [busy, setBusy] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const seq = useMemo(() => ({ n: 1 }), [])

  useEffect(() => {
    const timer = window.setTimeout(() => setRunDatetime(nowForDatetimeLocalInput()), 0)
    return () => window.clearTimeout(timer)
  }, [])

  const analyteById = useMemo(() => new Map(data.analytes.map((a) => [a.id, a])), [data.analytes])
  const selectedInstrument = data.instruments.find((instrument) => instrument.id === instrumentId)
  const selectedEquipmentId = selectedInstrument?.equipmentId ?? null
  const availableStockLots = useMemo(
    () => selectedEquipmentId ? data.stockLots.filter((lot) => lot.equipmentIds.includes(selectedEquipmentId)) : data.stockLots,
    [data.stockLots, selectedEquipmentId],
  )
  const selectedControlPlans = useMemo(
    () => data.controlPlans.filter((plan) => plan.isActive && plan.instrumentId === instrumentId),
    [data.controlPlans, instrumentId],
  )
  const plannedAnalyteIds = useMemo(() => new Set(selectedControlPlans.map((plan) => plan.analyteId)), [selectedControlPlans])
  const testSetAnalyteIds = useMemo(() => {
    const groups = new Map<string, Set<string>>()
    for (const analyte of activeAnalytes) {
      for (const testSet of parseTestSets(analyte.groupLabel)) {
        groups.set(testSet, new Set([...(groups.get(testSet) ?? []), analyte.id]))
      }
    }
    return groups
  }, [activeAnalytes])
  const selectedTestSetAnalyteIds = testSet ? testSetAnalyteIds.get(testSet) : undefined
  const testSetOptions = useMemo(
    () => [...testSetAnalyteIds.entries()]
      .filter(([, analyteIds]) => !instrumentId || !plannedAnalyteIds.size || [...analyteIds].some((id) => plannedAnalyteIds.has(id)))
      .map(([name, analyteIds]) => ({ name, count: analyteIds.size })),
    [instrumentId, plannedAnalyteIds, testSetAnalyteIds],
  )
  const availableAnalytes = useMemo(
    () => activeAnalytes.filter((analyte) =>
      (!instrumentId || !plannedAnalyteIds.size || plannedAnalyteIds.has(analyte.id))
      && (!selectedTestSetAnalyteIds || selectedTestSetAnalyteIds.has(analyte.id))),
    [activeAnalytes, instrumentId, plannedAnalyteIds, selectedTestSetAnalyteIds],
  )
  const hasLogScaleResult = rows.some((row) => analyteById.get(row.analyteId)?.scale === 'log10')

  function addRow() {
    setRows((r) => [
      ...r,
      {
        id: seq.n++,
        controlLotId: activeLots[0]?.id ?? '',
        analyteId: availableAnalytes[0]?.id ?? '',
        value: '',
      },
    ])
  }
  function startLot(controlLotId: string, selectedSet = testSet) {
    // Named test-set equivalent kept explicit for legacy callers and deep links:
    // startLot(fillLot, selectedSet)
    if (!controlLotId) {
      setRows([])
      return
    }
    const specs = data.specs.filter((s) => s.controlLotId === controlLotId)
    const selectedSetIds = selectedSet ? testSetAnalyteIds.get(selectedSet) : undefined
    const eligibleAnalyteIds = (specs.length ? specs.map((s) => s.analyteId) : activeAnalytes.map((a) => a.id))
      .filter((analyteId) => (!instrumentId || !plannedAnalyteIds.size || plannedAnalyteIds.has(analyteId)) && (!selectedSetIds || selectedSetIds.has(analyteId)))
    const added = eligibleAnalyteIds.map((analyteId) => ({
      id: seq.n++,
      controlLotId,
      analyteId,
      value: '',
    }))
    setRows(added)
  }
  function startTestSet(selectedSet: string) {
    const selectedSetIds = testSetAnalyteIds.get(selectedSet) ?? new Set<string>()
    const selectedAnalytes = activeAnalytes.filter((analyte) => selectedSetIds.has(analyte.id) && (!instrumentId || !plannedAnalyteIds.size || plannedAnalyteIds.has(analyte.id)))
    const panelTokens = selectedSet.toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length >= 3)
    const panelLots = activeLots.filter((lot) => panelTokens.some((token) => lot.controlMaterialName.toLowerCase().includes(token)))
    const unmapped: string[] = []
    const added = selectedAnalytes.map((analyte) => {
      const token = `${analyte.code} ${analyte.name}`.toLowerCase()
      // A panel with one control lot (for example CD4 Low) uses that lot for
      // every analyte in the panel. Multi-level panels such as HIV-VL match
      // the analyte's level to the corresponding control lot instead.
      const controlLot = panelLots.length === 1
        ? panelLots[0]
        : panelLots.find((lot) => {
          // A combined material level such as "HPC/LPC" is one physical
          // control kit, but must be usable for both HIV-VL (HPC) and
          // HIV-VL (LPC) result rows.
          const levels = (lot.level ?? '')
            .toLowerCase()
            .split(/[\\/|,;+]+/)
            .map((level) => level.trim())
            .filter(Boolean)
          return levels.some((level) => token.includes(level))
        })
      if (!controlLot) unmapped.push(analyte.code)
      return { id: seq.n++, controlLotId: controlLot?.id ?? '', analyteId: analyte.id, value: '' }
    })
    setRows(added)
    setLotMappingWarning(unmapped.length ? `ยังไม่พบ Control lot ที่มี Level ตรงกับ: ${unmapped.join(', ')}` : '')
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    const values = rows
      .filter((r) => r.controlLotId && r.analyteId && r.value.trim())
      .map((r) => {
        const analyte = analyteById.get(r.analyteId)
        if (analyte?.dataType === 'qualitative')
          return {
            controlLotId: r.controlLotId,
            analyteId: r.analyteId,
            qualitativeValue: r.value.trim(),
          }
        return {
          controlLotId: r.controlLotId,
          analyteId: r.analyteId,
          numericValue: Number(r.value),
        }
      })
    if (!values.length) return onErr('กรอกค่าผลอย่างน้อย 1 รายการ')
    setBusy(true)
    try {
      const result = await api<{ iqc: IqcWorkspace }>('/api/iqc/runs', {
        method: 'POST',
        body: JSON.stringify({
          instrumentId,
          runDatetime: new Date(runDatetime).toISOString(),
          note: note || null,
          consumables: consumables
            .filter((c) => c.lotNumber.trim())
            .map((c) => ({
              kind: c.kind,
              lotNumber: c.lotNumber.trim(),
              stockLotId: c.stockLotId || null,
              appliesScope: c.kind === 'trucount-tube' ? 'absolute-only' : 'all',
            })),
          values,
        }),
      })
      onOk('บันทึก run แล้ว', result.iqc)
      setRunDatetime(nowForDatetimeLocalInput())
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
      <Card className="border-[#b9ded8] bg-[#f1faf8] p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-bold text-[#173d50]">บันทึก IQC ประจำวัน</h2>
            <p className="mt-1 text-sm text-[#58747d]">เลือก Control lot เพียงครั้งเดียว ระบบจะเตรียมรายการตรวจทั้งหมดของล็อตนั้นให้กรอก</p>
          </div>
          <div className="flex items-center gap-2 text-xs font-semibold text-[#0b7f76]">
            <span className="rounded-full bg-white px-2.5 py-1">1 เลือกลอต</span>
            <span>→</span>
            <span className="rounded-full bg-white px-2.5 py-1">2 กรอกผล</span>
            <span>→</span>
            <span className="rounded-full bg-white px-2.5 py-1">3 ตรวจสอบผล</span>
          </div>
        </div>
      </Card>
      <div className="flex justify-end">
        <Button type="button" variant="ghost" onClick={() => setShowImport((v) => !v)}>
          {showImport ? 'ซ่อนการนำเข้า' : 'นำเข้าจากตาราง / Paste import'}
        </Button>
      </div>
      {showImport ? <ImportPanel data={data} onOk={onOk} onErr={onErr} /> : null}
      <form onSubmit={submit} className="grid gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
        <Card className="space-y-3 p-4">
          <h2 className="font-bold text-[#173d50]">Run context</h2>
          <Field label="วันเวลา run / Run datetime">
            <Input type="datetime-local" value={runDatetime} onChange={(e) => setRunDatetime(e.target.value)} required />
          </Field>
          <Field label="เครื่อง / Instrument">
            <Select value={instrumentId} required onChange={(e) => {
              setInstrumentId(e.target.value)
              setFillLot('')
              setTestSet('')
              setRows([])
            }}>
              <option value="">— ไม่ระบุ —</option>
              {data.instruments
                .filter((i) => i.isActive)
                .map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.code} · {i.name}
                    {i.model ? ` (${i.model})` : ''}
                  </option>
                ))}
            </Select>
          </Field>
          {instrumentId ? <div className={`rounded-lg border px-3 py-2 text-xs ${selectedControlPlans.length ? 'border-[#b9ded8] bg-[#f1faf8] text-[#176d65]' : 'border-[#eed4a6] bg-[#fff9ed] text-[#8b5a08]'}`}>
            {selectedControlPlans.length
              ? <>Test ที่กำหนดสำหรับเครื่องนี้: <span className="font-bold">{selectedControlPlans.map((plan) => plan.analyteCode).join(', ')}</span></>
              : 'ยังไม่ได้กำหนด test สำหรับเครื่องนี้ — ไปที่ ตั้งค่าล็อตและเกณฑ์ > Control plan'}
          </div> : null}
          {selectedInstrument?.equipmentId ? (
            <div className={`rounded-lg border px-3 py-2 text-xs ${selectedInstrument.equipmentStatus === 'maintenance' || selectedInstrument.equipmentStatus === 'out_of_service' ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-[#dbe8e8] bg-[#f4f9f8] text-[#41656d]'}`}>
              {selectedInstrument.equipmentStatus === 'maintenance' || selectedInstrument.equipmentStatus === 'out_of_service' ? 'คำเตือน: เครื่องมืออยู่ระหว่างซ่อมหรือหยุดใช้ · ' : ''}
              <Link className="font-semibold underline" href={`/equipment?view=registry&equipment=${selectedInstrument.equipmentId}`}>
                {selectedInstrument.equipmentCode} · {selectedInstrument.equipmentName}
              </Link>
            </div>
          ) : null}
          <div>
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs font-semibold text-[#58747d]">Consumable lots</span>
              <Button type="button" variant="ghost" className="min-h-7 px-2 py-1 text-xs" onClick={() => setConsumables((c) => [...c, { id: seq.n++, kind: 'staining-reagent', lotNumber: '', stockLotId: '' }])}>
                + เพิ่ม
              </Button>
            </div>
            <div className="space-y-2">
              {consumables.map((c, i) => (
                <div key={c.id} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)_minmax(0,0.8fr)_auto] gap-1.5">
                  <Select className="h-9" value={c.kind} onChange={(e) => setConsumables((rows) => rows.map((x, j) => (j === i ? { ...x, kind: e.target.value } : x)))}>
                    <option value="staining-reagent">Staining reagent</option>
                    <option value="trucount-tube">Trucount tube</option>
                    <option value="mastermix">Mastermix</option>
                    <option value="reagent">Reagent</option>
                    <option value="other">Other</option>
                  </Select>
                  <Select className="h-9" value={c.stockLotId} onChange={(e) => {
                    const stockLot = data.stockLots.find((lot) => lot.id === e.target.value)
                    setConsumables((rows) => rows.map((x, j) => (j === i ? { ...x, stockLotId: e.target.value, lotNumber: stockLot?.lotNumber ?? x.lotNumber } : x)))
                  }}>
                    <option value="">พิมพ์ lot เอง</option>
                    {availableStockLots.map((lot) => <option key={lot.id} value={lot.id}>{lot.itemCode} · {lot.itemName} · LOT {lot.lotNumber}</option>)}
                  </Select>
                  <Input className="h-9" placeholder="Lot no." value={c.lotNumber} readOnly={Boolean(c.stockLotId)} onChange={(e) => setConsumables((rows) => rows.map((x, j) => (j === i ? { ...x, lotNumber: e.target.value } : x)))} />
                  <button type="button" className="rounded p-1.5 text-[#c02a37] hover:bg-[#fff0f1]" aria-label="ลบ" onClick={() => setConsumables((rows) => rows.filter((_, j) => j !== i))}>
                    <Trash2 className="size-4" />
                  </button>
                </div>
              ))}
              {!consumables.length ? <p className="text-[11px] text-[#9aafb4]">เช่น Trucount tube lot, staining reagent lot (ช่วยตามรอย abs-count shift)</p> : null}
            </div>
          </div>
          <Field label="หมายเหตุ / Note">
            <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
        </Card>

        <Card className="space-y-3 p-4">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <h2 className="font-bold text-[#173d50]">2. กรอกผลตรวจ</h2>
            <div className="flex items-end gap-1.5">
              <Select className="h-9 w-48" value={testSet} disabled={!instrumentId} onChange={(e) => {
                const selectedSet = e.target.value
                setTestSet(selectedSet)
                setFillLot('')
                if (selectedSet) startTestSet(selectedSet)
                else setRows([])
              }}>
                <option value="">ทุก test / ไม่เลือกชุด</option>
                {testSetOptions.map((option) => <option key={option.name} value={option.name}>{option.name} ({option.count} รายการ)</option>)}
              </Select>
              {!testSet ? <Select className="h-9 w-56" value={fillLot} disabled={!instrumentId} onChange={(e) => {
                const controlLotId = e.target.value
                setFillLot(controlLotId)
                startLot(controlLotId)
              }}>
                <option value="">1. เลือก Control lot…</option>
                {activeLots.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.controlMaterialName}
                    {l.level ? ` ${l.level}` : ''} · {l.lotNumber}
                  </option>
                ))}
              </Select> : null}
              <Button type="button" variant="ghost" className="h-9" onClick={addRow}>
                + เพิ่มรายการ
              </Button>
            </div>
          </div>
          {testSet ? <p className={`text-xs ${lotMappingWarning ? 'text-[#c02a37]' : 'text-[#176d65]'}`}>{lotMappingWarning || 'ระบบจับคู่ Control lot ตาม Level ของแต่ละ analyte ให้อัตโนมัติ'}</p> : null}
          {hasLogScaleResult ? <p className="rounded-md border border-[#b9ded8] bg-[#f1faf8] px-3 py-2 text-xs text-[#176d65]">สำหรับ Viral load ให้กรอกค่า <strong>Copies/mL หรือ IU/mL</strong> ตาม unit ของ analyte — ระบบคำนวณ log10 เพื่อใช้พล็อตกราฟและประเมิน Westgard ให้อัตโนมัติ</p> : null}
          <div className="space-y-2">
            {rows.map((row, i) => {
              const analyte = analyteById.get(row.analyteId)
              const isBelowLodNormal = /(?:HIV|HBV|HCV)-VL\s*\(Normal\)$/i.test(analyte?.code ?? '')
              return (
                <div key={row.id} className="grid grid-cols-[1.2fr_1.2fr_0.9fr_auto] items-center gap-1.5">
                  <Select className="h-10" value={row.controlLotId} disabled={!instrumentId || Boolean(testSet && row.controlLotId)} onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, controlLotId: e.target.value } : x)))}>
                    {!row.controlLotId ? <option value="">ไม่พบ lot ที่ตรงกับ Level</option> : null}
                    {activeLots.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.controlMaterialName}
                        {l.level ? ` ${l.level}` : ''} · {l.lotNumber}
                      </option>
                    ))}
                  </Select>
                  <Select className="h-10" value={row.analyteId} disabled={!instrumentId} onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, analyteId: e.target.value } : x)))}>
                    {availableAnalytes.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.code}
                        {a.unit ? ` (${a.unit})` : ''}
                      </option>
                    ))}
                  </Select>
                  {isBelowLodNormal ? <Select className="h-10 text-sm" disabled={!instrumentId} value={row.value} onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))}>
                    <option value="">เลือกผล Normal…</option>
                    <option value="Not detected">ต่ำกว่า LOD / Not detected</option>
                    <option value="Detected / ≥ LOD">Detected / ≥ LOD</option>
                  </Select> : <Input className="mono h-10 text-base font-bold tabular-nums" disabled={!instrumentId} inputMode={analyte?.dataType === 'qualitative' ? 'text' : 'decimal'} type={analyte?.dataType === 'qualitative' ? 'text' : 'number'} step="any" placeholder={analyte?.dataType === 'qualitative' ? 'valid/pos…' : analyte?.scale === 'log10' ? (/^(?:HBV|HCV)-VL/i.test(analyte?.code ?? '') ? 'IU/mL' : analyte.unit ?? 'Copies/mL') : 'ค่า'} value={row.value} onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} />}
                  <button type="button" className="rounded p-1.5 text-[#c02a37] hover:bg-[#fff0f1]" aria-label="ลบแถว" onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}>
                    <Trash2 className="size-4" />
                  </button>
                </div>
              )
            })}
            {!rows.length ? <p className="rounded-md border border-dashed border-[#cfdee0] px-3 py-6 text-center text-sm text-[#9aafb4]">เริ่มจากเลือก Control lot ด้านบน ระบบจะเติมรายการตรวจให้โดยอัตโนมัติ</p> : null}
          </div>
          <div className="flex justify-end">
            <Button disabled={busy || !instrumentId || !rows.length}>{busy ? 'กำลังบันทึก…' : 'บันทึก run'}</Button>
          </div>
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
      <span className="mono text-xs font-bold tabular-nums" style={{ color }}>
        {sigma == null ? '—' : sigma.toFixed(1)}σ
      </span>
    </div>
  )
}

function SixSigmaTab({ data }: { data: IqcWorkspace }) {
  if (!data.sixSigma.length) {
    return <Notice tone="info">ยังไม่มี Six Sigma — ตั้งค่า TEa ต่อ analyte (แท็บ จัดการ) และต้องมี mean/SD แล้ว</Notice>
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
              <th className="px-3 py-2 text-right font-semibold">Bias% / EQA</th>
              <th className="px-3 py-2 text-right font-semibold">TEa</th>
              <th className="px-3 py-2 text-right font-semibold">TEa%</th>
              <th className="px-3 py-2 font-semibold">Sigma</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#eef3f3]">
            {data.sixSigma.map((row) => (
              <tr key={row.key}>
                <td className="px-3 py-2 font-semibold text-[#315763]">{row.analyteName}</td>
                <td className="px-3 py-2 text-xs text-[#789097]">
                  {row.lotNumber}
                  {row.level ? ` · ${row.level}` : ''}
                </td>
                <td className="mono px-3 py-2 text-right tabular-nums">{row.meanValue?.toFixed(2) ?? '—'}</td>
                <td className="mono px-3 py-2 text-right tabular-nums">{row.cv?.toFixed(1) ?? '—'}</td>
                <td className="mono px-3 py-2 text-right tabular-nums">{row.biasPct != null ? `${row.biasPct.toFixed(1)} (${row.biasSampleCount})` : '—'}</td>
                <td className="mono px-3 py-2 text-right tabular-nums">
                  {row.teaValue}
                  {row.teaMode === 'percent' ? '%' : ''}
                </td>
                <td className="mono px-3 py-2 text-right tabular-nums">{row.teaPct?.toFixed(1) ?? '—'}</td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <SigmaBar sigma={row.sigma} />
                    <StatusBadge tone={SIGMA_TONE[row.rating]} label={row.rating} />
                  </div>
                </td>
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
          <h3 className="font-bold text-[#173d50]">
            {budget.analyteName} — {budget.measurand}
          </h3>
          <p className="mt-0.5 text-xs text-[#789097]">
            at conc. {num(budget.concentration)} {budget.analyteUnit ?? ''} · k=
            {budget.coverageK} · {new Date(budget.evaluatedAt).toLocaleDateString('th-TH')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge tone={budget.meetsRequirement ? 'accepted' : 'warning'} label={budget.meetsRequirement ? 'ครบเกณฑ์ QP' : `n=${budget.iqcN ?? 0} ยังไม่ครบ`} />
          <Button variant="ghost" className="no-print min-h-7 px-2 py-1 text-xs" onClick={() => window.print()}>
            <Printer className="size-3.5" /> พิมพ์
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-[#f6fafa] text-[#55727c]">
            <tr>
              <th className="px-2 py-1.5 font-semibold">Component</th>
              <th className="px-2 py-1.5 text-right font-semibold">Value</th>
              <th className="px-2 py-1.5 font-semibold">Distribution</th>
              <th className="px-2 py-1.5 text-right font-semibold">Divisor</th>
              <th className="px-2 py-1.5 text-right font-semibold">SU</th>
              <th className="px-2 py-1.5 text-right font-semibold">RSU</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#eef3f3]">
            {budget.components.map((c) => (
              <tr key={c.id}>
                <td className="px-2 py-1.5 font-semibold text-[#315763]">
                  {c.source === 'iqc' ? 'IQC (pooled)' : c.label || c.source} <span className="font-normal text-[#9aafb4]">({c.type})</span>
                </td>
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
              <td className="px-2 py-1.5" colSpan={5}>
                Combined U (UC) / Expanded U (UX, k={budget.coverageK})
              </td>
              <td className="mono px-2 py-1.5 text-right tabular-nums">
                {pct(budget.combinedUc)} / {pct(budget.expandedUx)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <div className="rounded-md border border-[#cfe0e2] bg-[#f3f9f9] p-3 text-sm">
          <p className="text-[11px] font-bold tracking-wide text-[#3f6470] uppercase">Mean ± (Mean × Ux)</p>
          <p className="mono mt-1 tabular-nums text-[#173d50]">
            {meanBand != null ? `${num(budget.concentration)} ± ${num(meanBand)}` : '—'} {budget.analyteUnit ?? ''}
          </p>
        </div>
        <div className="rounded-md border border-[#e0d6c0] bg-[#fdfaf2] p-3 text-sm">
          <p className="text-[11px] font-bold tracking-wide text-[#7a6326] uppercase">Mean ± TEa (acceptance)</p>
          <p className="mono mt-1 tabular-nums text-[#173d50]">
            {teaBand != null ? `${num(budget.concentration)} ± ${num(teaBand)}` : 'ไม่มี TEa'} {budget.analyteUnit ?? ''}
          </p>
        </div>
      </div>

      <div className="no-print rounded-md border border-[#d6e2e3] p-3">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-[#55727c]">
          <Calculator className="size-3.5" /> Calculator — รายงานผล ± UR
        </p>
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <Field label={`ผลตรวจ${budget.analyteUnit ? ` (${budget.analyteUnit})` : ''}`}>
            <Input className="mono w-40" type="number" step="any" value={result} onChange={(e) => setResult(e.target.value)} />
          </Field>
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
        {data.uncertaintyBudgets.map((budget) => (
          <BudgetCard key={budget.id} budget={budget} />
        ))}
      </div>
      {!data.uncertaintyBudgets.length ? <Card className="p-8 text-center text-sm text-[#8198a0]">ยังไม่มี MU budget — {isAdmin ? 'สร้างด้านบน' : 'ให้ Admin สร้าง'}</Card> : null}
    </div>
  )
}

type ManualComp = {
  id: number
  source: string
  label: string
  value: string
  distribution: string
  concentration: string
}

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
        components: comps
          .filter((c) => c.value && c.concentration)
          .map((c) => ({
            source: c.source,
            label: c.label || null,
            value: Number(c.value),
            distribution: c.distribution,
            concentration: Number(c.concentration),
          })),
      }
      const result = await api<{ iqc: IqcWorkspace }>('/api/iqc/uncertainty', {
        method: 'POST',
        body: JSON.stringify(body),
      })
      onOk('คำนวณ MU budget แล้ว (IQC pooled RSD เติมอัตโนมัติ)', result.iqc)
      setMeasurand('')
      setConcentration('')
      setComps([])
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
          <Field label="Analyte">
            <Select value={analyteId} onChange={(e) => setAnalyteId(e.target.value)} required>
              <option value="">—</option>
              {data.analytes.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.code}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Measurand">
            <Input value={measurand} onChange={(e) => setMeasurand(e.target.value)} placeholder="AbsCD4 @ level X" required />
          </Field>
          <Field label="Concentration (mean)">
            <Input className="mono" type="number" step="any" value={concentration} onChange={(e) => setConcentration(e.target.value)} required />
          </Field>
          <Field label="Coverage k">
            <Input className="mono" type="number" step="any" value={coverageK} onChange={(e) => setCoverageK(e.target.value)} />
          </Field>
        </div>
        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-xs font-semibold text-[#58747d]">Type B components (calibrator / EQAS / อื่นๆ)</span>
            <Button
              type="button"
              variant="ghost"
              className="min-h-7 px-2 py-1 text-xs"
              onClick={() =>
                setComps((c) => [
                  ...c,
                  {
                    id: seq.n++,
                    source: 'calibrator',
                    label: '',
                    value: '',
                    distribution: 'normal-k2',
                    concentration: '',
                  },
                ])
              }
            >
              + เพิ่ม
            </Button>
          </div>
          <div className="space-y-2">
            {comps.map((c, i) => (
              <div key={c.id} className="grid grid-cols-[1fr_1.2fr_0.8fr_1fr_0.8fr_auto] items-center gap-1.5">
                <Select className="h-9" value={c.source} onChange={(e) => setComps((rs) => rs.map((x, j) => (j === i ? { ...x, source: e.target.value } : x)))}>
                  <option value="calibrator">Calibrator</option>
                  <option value="eqas">EQAS</option>
                  <option value="other">Other</option>
                </Select>
                <Input className="h-9" placeholder="label" value={c.label} onChange={(e) => setComps((rs) => rs.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
                <Input className="mono h-9" type="number" step="any" placeholder="U" value={c.value} onChange={(e) => setComps((rs) => rs.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} />
                <Select className="h-9" value={c.distribution} onChange={(e) => setComps((rs) => rs.map((x, j) => (j === i ? { ...x, distribution: e.target.value } : x)))}>
                  <option value="normal">normal</option>
                  <option value="normal-k2">normal (k=2)</option>
                  <option value="rectangular">rectangular</option>
                  <option value="triangular">triangular</option>
                  <option value="u-shape">u-shape</option>
                </Select>
                <Input className="mono h-9" type="number" step="any" placeholder="conc." value={c.concentration} onChange={(e) => setComps((rs) => rs.map((x, j) => (j === i ? { ...x, concentration: e.target.value } : x)))} />
                <button type="button" className="rounded p-1.5 text-[#c02a37] hover:bg-[#fff0f1]" aria-label="ลบ" onClick={() => setComps((rs) => rs.filter((_, j) => j !== i))}>
                  <Trash2 className="size-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
        <Button disabled={busy}>{busy ? 'กำลังคำนวณ…' : 'คำนวณ & บันทึก'}</Button>
      </form>
    </Card>
  )
}

function CorrectiveTab({ data, actor, onOk, onErr, focusId }: { data: IqcWorkspace; actor: BmActor; onOk: (t: string, d: IqcWorkspace) => void; onErr: (t: string) => void; focusId: string | null }) {
  const [runId, setRunId] = useState('')
  const [problem, setProblem] = useState('')
  const [rootCause, setRootCause] = useState('')
  const [actionTaken, setActionTaken] = useState('')
  const [ownerId, setOwnerId] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [busy, setBusy] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const [actionFilter, setActionFilter] = useState<CorrectiveActionFilter>('active')
  const [query, setQuery] = useState('')
  const [expandedActionIds, setExpandedActionIds] = useState<Set<string>>(new Set())
  const [visibleActionCount, setVisibleActionCount] = useState(20)
  const [editingActionId, setEditingActionId] = useState<string | null>(null)
  const [editingAction, setEditingAction] = useState<CorrectiveActionEdit>({ problem: '', rootCause: '', actionTaken: '', ownerId: '', dueDate: '' })

  const controlLotLabels = useMemo(() => new Map(data.controlLots.map((lot) => [lot.id, `${lot.controlMaterialName}${lot.level ? ` ${lot.level}` : ''} · ${lot.lotNumber}`])), [data.controlLots])
  const runById = useMemo(() => new Map(data.runs.map((run) => [run.id, run])), [data.runs])
  const flaggedOf = (r: IqcWorkspace['runs'][number]) => r.results.filter((res) => !res.isVoided && ['warning', 'investigate', 'rejected'].includes(res.status))
  const runOptions = runsWithoutCorrectiveActions(data.runs, data.correctiveActions).filter((r) => showAll || flaggedOf(r).length > 0)
  const actionCounts = useMemo(() => ({
    open: data.correctiveActions.filter((action) => action.status === 'open').length,
    awaitingEffectiveness: data.correctiveActions.filter((action) => action.status === 'awaiting-effectiveness').length,
    closed: data.correctiveActions.filter((action) => action.status === 'closed').length,
  }), [data.correctiveActions])
  const effectiveActionFilter = focusId && actionFilter === 'active' ? 'all' : actionFilter
  const filteredActions = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase()
    return data.correctiveActions.filter((action) => {
      const statusMatches = effectiveActionFilter === 'all'
        || (effectiveActionFilter === 'active' && action.status !== 'closed')
        || action.status === effectiveActionFilter
      const textMatches = !normalizedQuery || [action.problem, action.analyteName, action.ownerName, action.createdByName]
        .filter((value): value is string => Boolean(value))
        .some((value) => value.toLocaleLowerCase().includes(normalizedQuery))
      return statusMatches && textMatches
    })
  }, [data.correctiveActions, effectiveActionFilter, query])
  const focusedActionIndex = focusId ? filteredActions.findIndex((action) => action.id === focusId) : -1
  const visibleActions = filteredActions.slice(0, Math.max(visibleActionCount, focusedActionIndex + 1))
  useEffect(() => {
    if (!focusId) return
    document.getElementById(`corrective-action-${focusId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [focusId, data.correctiveActions])
  function lotLabel(controlLotId: string) {
    return controlLotLabels.get(controlLotId) ?? 'Control'
  }
  function summarizeResults(results: IqcWorkspace['runs'][number]['results'], includeRules: boolean) {
    const grouped = new Map<string, string[]>()
    for (const result of results.filter((res) => !res.isVoided)) {
      const ruleText = includeRules && result.violatedRules.length ? ` ${result.violatedRules.join('/')}` : ''
      grouped.set(result.controlLotId, [...(grouped.get(result.controlLotId) ?? []), `${result.analyteCode}${ruleText}`])
    }
    return [...grouped.entries()].map(([controlLotId, analytes]) => `${lotLabel(controlLotId)} · ${analytes.join(', ')}`).join(' | ')
  }
  function runOptionLabel(run: IqcWorkspace['runs'][number]) {
    const flags = flaggedOf(run)
    const summary = flags.length ? summarizeResults(flags, true) : summarizeResults(run.results, false)
    return `${formatDateTime(run.runDatetime)}${summary ? ` · ${summary}` : ''}`
  }

  async function create(event: React.FormEvent) {
    event.preventDefault()
    if (!runId || !problem.trim()) return onErr('เลือก run และระบุปัญหา')
    setBusy(true)
    try {
      const result = await api<{ iqc: IqcWorkspace }>('/api/iqc/corrective-actions', {
        method: 'POST',
        body: JSON.stringify({
          runId,
          problem,
          rootCause: rootCause || null,
          actionTaken: actionTaken || null,
          ownerId: ownerId || null,
          dueDate: dueDate || null,
        }),
      })
      onOk('เปิด corrective action แล้ว', result.iqc)
      setProblem('')
      setRootCause('')
      setActionTaken('')
      setOwnerId('')
      setDueDate('')
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
      onOk('ส่ง CAPA เพื่อรอยืนยันผลการแก้ไขแล้ว', result.iqc)
    } catch (e) {
      onErr(e instanceof Error ? e.message : 'ปิดไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }
  function startEditing(ca: IqcCorrectiveAction) {
    setEditingActionId(ca.id)
    setEditingAction({
      problem: ca.problem,
      rootCause: ca.rootCause ?? '',
      actionTaken: ca.actionTaken ?? '',
      ownerId: ca.ownerId ?? '',
      dueDate: ca.dueDate ?? '',
    })
    setExpandedActionIds((ids) => new Set(ids).add(ca.id))
  }
  async function saveEditing(event: React.FormEvent) {
    event.preventDefault()
    if (!editingActionId || !editingAction.problem.trim()) return onErr('ระบุปัญหา / Problem ก่อนบันทึก')
    setBusy(true)
    try {
      const result = await api<{ iqc: IqcWorkspace }>(`/api/iqc/corrective-actions/${editingActionId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          problem: editingAction.problem.trim(),
          rootCause: editingAction.rootCause.trim() || null,
          actionTaken: editingAction.actionTaken.trim() || null,
          ownerId: editingAction.ownerId || null,
          dueDate: editingAction.dueDate || null,
        }),
      })
      setEditingActionId(null)
      onOk('แก้ไข corrective action แล้ว', result.iqc)
    } catch (e) {
      onErr(e instanceof Error ? e.message : 'แก้ไข corrective action ไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }
  async function submitForReview(ca: IqcCorrectiveAction) {
    if (!ca.rootCause || !ca.actionTaken) {
      startEditing(ca)
      onErr('กรอก Root cause และ Action taken ก่อนส่งตรวจผล')
      return
    }
    await close(ca.id)
  }
  async function verify(id: string) {
    const effective = window.confirm('ยืนยันว่าการแก้ไขนี้มีประสิทธิผลหรือไม่?\nกด OK = effective, Cancel = ineffective')
    const note = window.prompt('บันทึกผลการยืนยันการแก้ไข:')
    if (!note?.trim()) return
    setBusy(true)
    try {
      const result = await api<{ iqc: IqcWorkspace }>(`/api/iqc/corrective-actions/${id}/close`, {
        method: 'POST',
        body: JSON.stringify({
          effectivenessOutcome: effective ? 'effective' : 'ineffective',
          effectivenessNote: note.trim(),
        }),
      })
      onOk(effective ? 'ยืนยันผลการแก้ไขแล้ว และปิด CAPA' : 'บันทึกว่า ineffective และเปิด CAPA ต่อ', result.iqc)
    } catch (e) {
      onErr(e instanceof Error ? e.message : 'ยืนยันผลการแก้ไขไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }
  async function remove(id: string) {
    if (!window.confirm('ลบ Corrective action นี้ใช่ไหม?\n\nรายการและไฟล์แนบทั้งหมดจะถูกลบถาวร')) return
    setBusy(true)
    try {
      const result = await api<{ iqc: IqcWorkspace }>(`/api/iqc/corrective-actions/${id}`, { method: 'DELETE' })
      setExpandedActionIds((ids) => {
        const next = new Set(ids)
        next.delete(id)
        return next
      })
      onOk('ลบ corrective action แล้ว', result.iqc)
    } catch (e) {
      onErr(e instanceof Error ? e.message : 'ลบ corrective action ไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }
  function toggleExpanded(id: string) {
    setExpandedActionIds((ids) => {
      const next = new Set(ids)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  function selectActionFilter(value: CorrectiveActionFilter) {
    setActionFilter(value)
    setVisibleActionCount(20)
  }
  function updateQuery(value: string) {
    setQuery(value)
    setVisibleActionCount(20)
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
      <Card className="space-y-3 p-4">
        <h2 className="font-bold text-[#173d50]">เปิด corrective action</h2>
        <form onSubmit={create} className="space-y-3">
          <Field label="Run (เฉพาะที่มีค่า out)">
            <Select value={runId} onChange={(e) => setRunId(e.target.value)} required>
              <option value="">— เลือก run —</option>
              {runOptions.map((r) => (
                <option key={r.id} value={r.id}>
                  {runOptionLabel(r)}
                </option>
              ))}
            </Select>
          </Field>
          <label className="flex items-center gap-2 text-xs text-[#58747d]">
            <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> แสดงทุก run (รวมที่ปกติ)
          </label>
          {!runOptions.length ? <p className="text-xs text-[#9aafb4]">ไม่มี run ที่ยังไม่มี corrective action — ติ๊ก &ldquo;แสดงทุก run&rdquo; เพื่อดู run ปกติที่ยังไม่ได้บันทึก</p> : null}
          <Field label="ปัญหา / Problem">
            <Textarea rows={2} value={problem} onChange={(e) => setProblem(e.target.value)} required />
          </Field>
          <Field label="Root cause">
            <Textarea rows={2} value={rootCause} onChange={(e) => setRootCause(e.target.value)} />
          </Field>
          <Field label="Action taken">
            <Textarea rows={2} value={actionTaken} onChange={(e) => setActionTaken(e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="ผู้รับผิดชอบ">
              <Select value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
                <option value="">— ยังไม่กำหนด —</option>
                {data.assignableUsers.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.displayName}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Due date">
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </Field>
          </div>
          <Button disabled={busy}>บันทึก</Button>
        </form>
      </Card>
      <div className="space-y-3">
        <Card className="space-y-3 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-bold text-[#173d50]">รายการ Corrective action</h2>
              <p className="mt-0.5 text-xs text-[#789097]">แสดง {visibleActions.length} จาก {filteredActions.length} รายการที่ตรงเงื่อนไข · กดรายการเพื่อดูรายละเอียดและไฟล์แนบ</p>
            </div>
            <div className="flex flex-wrap gap-1">
              {([
                ['active', `กำลังดำเนินการ ${actionCounts.open + actionCounts.awaitingEffectiveness}`],
                ['open', `Open ${actionCounts.open}`],
                ['awaiting-effectiveness', `รอยืนยันผลการแก้ไข ${actionCounts.awaitingEffectiveness}`],
                ['closed', `Closed ${actionCounts.closed}`],
                ['all', `ทั้งหมด ${data.correctiveActions.length}`],
              ] as [CorrectiveActionFilter, string][]).map(([value, label]) => (
                <button key={value} type="button" aria-pressed={effectiveActionFilter === value} onClick={() => selectActionFilter(value)} className={`rounded-full border px-2.5 py-1 text-[11px] font-bold transition focus-visible:ring-2 focus-visible:ring-[#0b7f76] focus-visible:outline-none ${effectiveActionFilter === value ? 'border-[#0b7f76] bg-[#e6f5f2] text-[#08766e]' : 'border-[#d6e2e3] bg-white text-[#58747d] hover:bg-[#f3f9f9]'}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          <Input value={query} onChange={(event) => updateQuery(event.target.value)} placeholder="ค้นหาปัญหา, analyte, ผู้รับผิดชอบ หรือผู้บันทึก" aria-label="ค้นหา corrective action" />
        </Card>
        {visibleActions.map((ca) => {
          const isExpanded = ca.id === focusId || expandedActionIds.has(ca.id)
          const run = runById.get(ca.runId)
          const needsCompletion = ca.status === 'open' && (!ca.rootCause || !ca.actionTaken)
          return (
          <div key={ca.id} id={ca.id === focusId ? `corrective-action-${focusId}` : undefined}>
            <Card className="overflow-hidden">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <button type="button" onClick={() => toggleExpanded(ca.id)} aria-expanded={isExpanded} className="min-w-0 flex-1 p-4 text-left focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#0b7f76] focus-visible:outline-none">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-[#315763]">{formatDateTime(ca.runDatetime)}</span>
                    <StatusBadge tone={ca.status === 'closed' ? 'accepted' : 'warning'} label={ca.status} />
                    {needsCompletion ? <span className="rounded-full border border-[#eed4a6] bg-[#fff9ed] px-2 py-0.5 text-[10px] font-bold text-[#a9700f]">ข้อมูลไม่ครบ</span> : null}
                    <ChevronDown className={`size-4 shrink-0 text-[#789097] transition-transform ${isExpanded ? 'rotate-180' : ''}`} aria-hidden="true" />
                  </div>
                  {run ? <p className="mt-1 truncate text-xs font-semibold text-[#58747d]">{summarizeResults(flaggedOf(run), true) || summarizeResults(run.results, false)}</p> : null}
                  <p className="mt-1 truncate text-sm text-[#3f5c64]">{ca.problem}</p>
                  <p className="mt-1 text-[11px] text-[#9aafb4]">โดย {ca.createdByName ?? '-'}{ca.ownerName ? ` · ผู้รับผิดชอบ ${ca.ownerName}` : ''}</p>
                </button>
                <div className="flex shrink-0 items-center gap-1 p-3">
                  {ca.status === 'open' ? (
                    <Button variant="secondary" className="min-h-8 px-3 py-1.5 text-xs" disabled={busy} onClick={() => void submitForReview(ca)}>
                      {needsCompletion ? 'กรอกก่อนส่งตรวจผล' : 'ส่งตรวจผล'}
                    </Button>
                  ) : null}
                  {ca.status === 'awaiting-effectiveness' ? (
                    <Button variant="secondary" className="min-h-8 px-3 py-1.5 text-xs" disabled={busy} onClick={() => verify(ca.id)}>
                      ยืนยันผลการแก้ไข
                    </Button>
                  ) : null}
                  <Button variant="danger" className="min-h-8 px-2 py-1.5" disabled={busy} onClick={() => void remove(ca.id)} aria-label={`ลบ corrective action ${ca.problem}`}>
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>
              {isExpanded ? (
                <div className="border-t border-[#e8efef] px-4 pb-4 pt-3">
                  {editingActionId === ca.id ? (
                    <form className="space-y-3" onSubmit={saveEditing}>
                      <p className="text-xs font-bold text-[#315763]">แก้ไข Corrective action</p>
                      <Field label="ปัญหา / Problem"><Textarea rows={2} value={editingAction.problem} onChange={(event) => setEditingAction({ ...editingAction, problem: event.target.value })} required /></Field>
                      <Field label="Root cause"><Textarea rows={2} value={editingAction.rootCause} onChange={(event) => setEditingAction({ ...editingAction, rootCause: event.target.value })} required /></Field>
                      <Field label="Action taken"><Textarea rows={2} value={editingAction.actionTaken} onChange={(event) => setEditingAction({ ...editingAction, actionTaken: event.target.value })} required /></Field>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <Field label="ผู้รับผิดชอบ"><Select value={editingAction.ownerId} onChange={(event) => setEditingAction({ ...editingAction, ownerId: event.target.value })}><option value="">— ยังไม่กำหนด —</option>{data.assignableUsers.map((user) => <option key={user.id} value={user.id}>{user.displayName}</option>)}</Select></Field>
                        <Field label="Due date"><Input type="date" value={editingAction.dueDate} onChange={(event) => setEditingAction({ ...editingAction, dueDate: event.target.value })} /></Field>
                      </div>
                      <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="ghost" disabled={busy} onClick={() => setEditingActionId(null)}>ยกเลิก</Button><Button disabled={busy}>บันทึกการแก้ไข</Button></div>
                    </form>
                  ) : (
                    <>
                      {needsCompletion ? <Notice tone="warning">กรอก Root cause และ Action taken ก่อนส่งตรวจผล</Notice> : null}
                      {ca.rootCause ? <p className="mt-1 text-xs text-[#789097]">Root cause: {ca.rootCause}</p> : null}
                      {ca.actionTaken ? <p className="text-xs text-[#789097]">Action: {ca.actionTaken}</p> : null}
                      {ca.ownerName || ca.dueDate ? (
                        <p className="text-xs text-[#789097]">
                          Owner: {ca.ownerName ?? '-'} · Due: {formatDate(ca.dueDate)}
                        </p>
                      ) : null}
                      {ca.effectivenessNote ? (
                        <p className="text-xs text-[#789097]">
                          ผลการยืนยันการแก้ไข: {ca.effectivenessOutcome} · {ca.effectivenessNote}
                          {ca.effectivenessVerifiedByName ? ` · ตรวจโดย ${ca.effectivenessVerifiedByName}` : ''}
                          {ca.effectivenessVerifiedAt ? ` (${formatDateTime(ca.effectivenessVerifiedAt)})` : ''}
                        </p>
                      ) : null}
                      {ca.status !== 'closed' ? <div className="mt-3 flex justify-end"><Button variant="secondary" className="min-h-8 px-3 py-1.5 text-xs" disabled={busy} onClick={() => startEditing(ca)}>แก้ไข</Button></div> : null}
                    </>
                  )}
                  <div className="mt-3">
                    <AttachmentList module="iqc" entityType="corrective-action" entityId={ca.id} kind="corrective-action" canDelete={actor.role === 'Admin'} />
                  </div>
                </div>
              ) : null}
            </Card>
          </div>
        )
        })}
        {filteredActions.length > visibleActions.length ? (
          <div className="flex justify-center">
            <Button variant="secondary" onClick={() => setVisibleActionCount((count) => count + 20)}>แสดงเพิ่มอีก {Math.min(20, filteredActions.length - visibleActions.length)} รายการ</Button>
          </div>
        ) : null}
        {!filteredActions.length ? (
          <Card className="p-8 text-center text-sm text-[#8198a0]">
            <ClipboardList className="mx-auto mb-2 size-6 text-[#b8c9cd]" />
            {data.correctiveActions.length ? 'ไม่พบ corrective action ที่ตรงเงื่อนไข' : 'ยังไม่มี corrective action'}
          </Card>
        ) : null}
      </div>
    </div>
  )
}

function ManageTab({ data, onOk, onErr }: { data: IqcWorkspace; onOk: (t: string, d: IqcWorkspace) => void; onErr: (t: string) => void }) {
  async function request(url: string, body: unknown, okText: string, method: 'POST' | 'PATCH' | 'DELETE' = 'POST') {
    try {
      const result = await api<{ iqc: IqcWorkspace }>(url, {
        method,
        body: method === 'DELETE' ? undefined : JSON.stringify(body),
      })
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
      <SettingsDisclosure title="Analyte / ชุดทดสอบ"><AnalyteForm onSubmit={(b) => post('/api/iqc/analytes', b, 'เพิ่ม analyte แล้ว')} onUpdate={(id, b) => post(`/api/iqc/analytes/${id}`, b, 'แก้ไข analyte แล้ว', 'PATCH')} onToggle={(id, a) => post(`/api/iqc/analytes/${id}`, { isActive: a }, a ? 'เปิดใช้ analyte แล้ว' : 'ปิด analyte แล้ว', 'PATCH')} onDelete={(id) => remove(`/api/iqc/analytes/${id}`, 'ลบ analyte แล้ว')} analytes={data.analytes} /></SettingsDisclosure>
      <SettingsDisclosure title="เครื่องมือ IQC"><Card className="space-y-2 p-4">
        <h2 className="font-bold text-[#173d50]">เครื่องมือ IQC</h2>
        <p className="text-sm text-[#58747d]">เลือกเครื่องจากทะเบียน Equipment เท่านั้น เพื่อใช้ข้อมูลเครื่องและสถานะเดียวกันทั้งระบบ</p>
        <Link className="inline-flex text-sm font-bold text-[#0b7f76] underline" href="/equipment?view=registry">ไปที่ทะเบียน Equipment เพื่อเปิดใช้กับ IQC</Link>
        <div className="divide-y divide-[#eef3f3] rounded-md border border-[#e3ebec] text-xs">
          {data.instruments.map((instrument) => {
            const tests = data.controlPlans.filter((plan) => plan.isActive && plan.instrumentId === instrument.id)
            return <div key={instrument.id} className="p-2.5">
              <p className="font-bold text-[#315763]">{instrument.code} · {instrument.name}</p>
              <p className="mt-1 text-[#58747d]">Test: {tests.length ? tests.map((plan) => plan.analyteCode).join(', ') : 'ยังไม่ได้กำหนด'}</p>
            </div>
          })}
          {!data.instruments.length ? <p className="p-2.5 text-[#789097]">ยังไม่มีเครื่องที่เปิดใช้กับ IQC</p> : null}
        </div>
      </Card></SettingsDisclosure>
      <SettingsDisclosure title="Control material"><MaterialForm onSubmit={(b) => post('/api/iqc/materials', b, 'เพิ่ม control material แล้ว')} onUpdate={(id, b) => post(`/api/iqc/materials/${id}`, b, 'แก้ไข control material แล้ว', 'PATCH')} onToggle={(id, a) => post(`/api/iqc/materials/${id}`, { isActive: a }, a ? 'เปิดใช้ material แล้ว' : 'ปิด material แล้ว', 'PATCH')} onDelete={(id) => remove(`/api/iqc/materials/${id}`, 'ลบ control material แล้ว')} materials={data.controlMaterials} /></SettingsDisclosure>
      <SettingsDisclosure title="Control lot"><LotForm onSubmit={(b) => post('/api/iqc/lots', b, 'เพิ่ม control lot แล้ว')} onUpdate={(id, b) => post(`/api/iqc/lots/${id}`, b, 'แก้ไข control lot แล้ว', 'PATCH')} onToggle={(id, isActive) => post(`/api/iqc/lots/${id}`, { isActive }, isActive ? 'เปิดใช้ lot แล้ว' : 'ปิด lot แล้ว', 'PATCH')} onDelete={(id) => remove(`/api/iqc/lots/${id}`, 'ลบ control lot แล้ว')} data={data} /></SettingsDisclosure>
      <SettingsDisclosure title="Assigned spec"><SpecForm onSubmit={(b) => post('/api/iqc/specs', b, 'บันทึก spec แล้ว')} data={data} /></SettingsDisclosure>
      <SettingsDisclosure title="TEa / Six Sigma"><TeaForm onSubmit={(b) => post('/api/iqc/tea', b, 'บันทึก TEa แล้ว')} data={data} /></SettingsDisclosure>
      <SettingsDisclosure title="Control plan" className="lg:col-span-2"><ControlPlanForm onSubmit={(b) => post('/api/iqc/control-plans', b, 'บันทึก Control plan แล้ว')} data={data} /></SettingsDisclosure>
    </div>
  )
}

function SettingsDisclosure({ title, children, className = '' }: { title: string; children: React.ReactNode; className?: string }) {
  const [open, setOpen] = useState(false)
  return <section className={className}>
    <button type="button" className="flex w-full items-center justify-between rounded-lg border border-[#d6e2e3] bg-white px-4 py-3 text-left font-bold text-[#173d50] hover:bg-[#f7fbfb]" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
      {title}<ChevronDown className={`size-4 text-[#58747d] transition-transform ${open ? 'rotate-180' : ''}`} />
    </button>
    {open ? <div className="mt-2">{children}</div> : null}
  </section>
}

const CONTROL_PLAN_RULES = ['1-2s', '1-3s', '2-2s', 'R-4s', '4-1s', '10x']

function ControlPlanForm({ onSubmit, data }: { onSubmit: (b: unknown) => Promise<boolean>; data: IqcWorkspace }) {
  const [analyteId, setAnalyteId] = useState('')
  const [testSet, setTestSet] = useState('')
  const [instrumentId, setInstrumentId] = useState('')
  const [enforceLevels, setEnforceLevels] = useState(true)
  const [frequency, setFrequency] = useState('daily')
  const [rules, setRules] = useState<string[]>(CONTROL_PLAN_RULES)
  const [busy, setBusy] = useState(false)
  const testSets = useMemo(() => [...new Set(data.analytes.filter((analyte) => analyte.isActive).flatMap((analyte) => parseTestSets(analyte.groupLabel)))].sort(), [data.analytes])
  const selectedAnalyteIds = testSet
    ? data.analytes.filter((analyte) => analyte.isActive && hasTestSet(analyte.groupLabel, testSet)).map((analyte) => analyte.id)
    : analyteId ? [analyteId] : []
  const availableLevels = useMemo(() => [...new Set(data.controlLots.filter((lot) => lot.isActive && lot.level).map((lot) => lot.level!))].sort(), [data.controlLots])
  const [selectedLevels, setSelectedLevels] = useState<string[]>(availableLevels)
  const toggleRule = (rule: string) => setRules((current) => (current.includes(rule) ? current.filter((item) => item !== rule) : [...current, rule]))
  const toggleLevel = (level: string) => setSelectedLevels((current) => current.includes(level) ? current.filter((item) => item !== level) : [...current, level])
  return (
    <Card className="space-y-3 p-4 lg:col-span-2">
      <div>
        <h2 className="font-bold text-[#173d50]">Control plan ต่อ assay / instrument</h2>
        <p className="text-xs text-[#789097]">กำหนดระดับ control ที่ต้องรัน และ Westgard rules ที่ใช้กับ instrument นั้น</p>
      </div>
      <form
        className="grid gap-2 md:grid-cols-4"
        onSubmit={async (event) => {
          event.preventDefault()
          const requiredLevels = enforceLevels ? selectedLevels : []
          if (!selectedAnalyteIds.length || !instrumentId || !rules.length) return
          setBusy(true)
          try {
            if (
              await onSubmit({
              analyteIds: selectedAnalyteIds,
              instrumentId,
              requiredLevels,
              frequency,
              westgardRules: rules,
              })
            ) {
              setAnalyteId('')
              setTestSet('')
              setInstrumentId('')
              setEnforceLevels(true)
              setSelectedLevels(availableLevels)
            }
          } finally {
            setBusy(false)
          }
        }}
      >
        <Field label="ชุดทดสอบ / Test set">
          <Select value={testSet} onChange={(event) => { setTestSet(event.target.value); setAnalyteId('') }}>
            <option value="">— เลือกทีละ test —</option>
            {testSets.map((name) => <option key={name} value={name}>{name} ({data.analytes.filter((analyte) => analyte.isActive && hasTestSet(analyte.groupLabel, name)).length} รายการ)</option>)}
          </Select>
        </Field>
        <Field label="Analyte">
          <Select value={analyteId} onChange={(event) => { setAnalyteId(event.target.value); setTestSet('') }} required={!testSet} disabled={Boolean(testSet)}>
            <option value="">—</option>
            {data.analytes
              .filter((item) => item.isActive)
              .map((item) => (
                <option key={item.id} value={item.id}>
                  {item.code} · {item.name}
                </option>
              ))}
          </Select>
        </Field>
        <Field label="Instrument">
          <Select value={instrumentId} onChange={(event) => setInstrumentId(event.target.value)} required>
            <option value="">—</option>
            {data.instruments
              .filter((item) => item.isActive)
              .map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
          </Select>
        </Field>
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-[#58747d]">Required levels</label>
          <label className="flex min-h-10 items-center gap-2 rounded-md border border-[#d6e2e3] bg-white px-3 text-sm text-[#315763]">
            <input type="checkbox" checked={enforceLevels} onChange={(event) => setEnforceLevels(event.target.checked)} />
            บังคับระดับ Control
          </label>
          {enforceLevels ? (
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-[#58747d]">
              {availableLevels.map((level) => <label key={level} className="flex items-center gap-1"><input type="checkbox" checked={selectedLevels.includes(level)} onChange={() => toggleLevel(level)} /> {level}</label>)}
              {!availableLevels.length ? <span>ยังไม่มีระดับ Control ที่ใช้งานอยู่</span> : null}
            </div>
          ) : <p className="text-xs text-[#789097]">ไม่บังคับระดับ ระบบจะไม่เตือนหรือขวางการบันทึก run เพราะระดับ Control ไม่ครบ</p>}
        </div>
        <Field label="Frequency">
          <Select value={frequency} onChange={(event) => setFrequency(event.target.value)}>
            <option value="daily">อย่างน้อยวันละครั้ง</option>
            <option value="per-run">ทุก IQC run</option>
          </Select>
        </Field>
        <div className="md:col-span-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#58747d]">
          {CONTROL_PLAN_RULES.map((rule) => (
            <label key={rule} className="flex items-center gap-1">
              <input type="checkbox" checked={rules.includes(rule)} onChange={() => toggleRule(rule)} /> {rule}
            </label>
          ))}
        </div>
        {testSet ? <p className="md:col-span-4 text-xs text-[#176d65]">จะกำหนด Control plan ให้ครบ {selectedAnalyteIds.length} รายการในชุด {testSet}</p> : null}
        <div className="md:col-span-4">
          <Button disabled={busy}>{busy ? 'กำลังบันทึก…' : 'บันทึก Control plan'}</Button>
        </div>
      </form>
      {data.controlPlans.length ? (
        <div className="divide-y divide-[#eef3f3] rounded-md border border-[#e9eff0] text-xs">
          {data.controlPlans.map((plan) => (
            <div key={plan.id} className="flex flex-wrap justify-between gap-2 p-2">
              <span className="font-semibold text-[#315763]">
                {plan.analyteCode} · {plan.instrumentName}
              </span>
              <span>
                {plan.frequency} · {plan.requiredLevels.length ? plan.requiredLevels.join(', ') : 'ไม่บังคับระดับ'} · {plan.westgardRules.join(', ')}
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </Card>
  )
}

function TeaForm({ onSubmit, data }: { onSubmit: (b: unknown) => Promise<boolean>; data: IqcWorkspace }) {
  const [form, setForm] = useState({
    analyteId: '',
    testSet: '',
    teaValue: '',
    teaMode: 'absolute',
    teaUnit: '',
    sourceRef: '',
  })
  const [busy, setBusy] = useState(false)
  const [showSavedTea, setShowSavedTea] = useState(false)
  const testSets = useMemo(() => [...new Set(data.analytes.filter((analyte) => analyte.isActive).flatMap((analyte) => parseTestSets(analyte.groupLabel)))].sort(), [data.analytes])
  const selectedAnalyteIds = form.testSet
    ? data.analytes.filter((analyte) => analyte.isActive && hasTestSet(analyte.groupLabel, form.testSet)).map((analyte) => analyte.id)
    : form.analyteId ? [form.analyteId] : []
  return (
    <Card className="space-y-3 p-4 lg:col-span-2">
      <h2 className="font-bold text-[#173d50]">Allowable Total Error (TEa) — สำหรับ Six Sigma</h2>
      <p className="text-xs text-[#789097]">VL (log10): HIV/HCV/CMV = 0.5, HBV = 1.0 (absolute)</p>
      <form
        className="grid gap-2 md:grid-cols-5"
        onSubmit={async (e) => {
          e.preventDefault()
          if (!selectedAnalyteIds.length || !form.teaValue) return
          setBusy(true)
          const body = {
            analyteIds: selectedAnalyteIds,
            teaValue: Number(form.teaValue),
            teaMode: form.teaMode,
            teaUnit: form.teaUnit || null,
            sourceRef: form.sourceRef || null,
          }
          if (await onSubmit(body))
            setForm({
              analyteId: '',
              testSet: '',
              teaValue: '',
              teaMode: 'absolute',
              teaUnit: '',
              sourceRef: '',
            })
          setBusy(false)
        }}
      >
        <Field label="ชุดทดสอบ / Test set">
          <Select value={form.testSet} onChange={(e) => setForm({ ...form, testSet: e.target.value, analyteId: '' })}>
            <option value="">— เลือกทีละ test —</option>
            {testSets.map((name) => <option key={name} value={name}>{name} ({data.analytes.filter((analyte) => analyte.isActive && hasTestSet(analyte.groupLabel, name)).length} รายการ)</option>)}
          </Select>
        </Field>
        <Field label="Analyte">
          <Select value={form.analyteId} onChange={(e) => setForm({ ...form, analyteId: e.target.value, testSet: '' })} required={!form.testSet} disabled={Boolean(form.testSet)}>
            <option value="">—</option>
            {data.analytes.map((a) => (
              <option key={a.id} value={a.id}>
                {a.code}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="TEa value">
          <Input className="mono" type="number" step="any" value={form.teaValue} onChange={(e) => setForm({ ...form, teaValue: e.target.value })} required />
        </Field>
        <Field label="Mode">
          <Select value={form.teaMode} onChange={(e) => setForm({ ...form, teaMode: e.target.value })}>
            <option value="absolute">Absolute</option>
            <option value="percent">Percent</option>
          </Select>
        </Field>
        <Field label="Unit">
          <Input value={form.teaUnit} onChange={(e) => setForm({ ...form, teaUnit: e.target.value })} placeholder="log10" />
        </Field>
        <Field label="Source ref">
          <Input value={form.sourceRef} onChange={(e) => setForm({ ...form, sourceRef: e.target.value })} />
        </Field>
        {form.testSet ? <p className="md:col-span-5 text-xs text-[#176d65]">จะกำหนด TEa ให้ครบ {selectedAnalyteIds.length} รายการในชุด {form.testSet}</p> : null}
        <div className="md:col-span-5">
          <Button disabled={busy}>บันทึก TEa</Button>
        </div>
      </form>
      {data.teaSpecs.length ? (
        <div className="rounded-md border border-[#e2ecee]">
          <button type="button" onClick={() => setShowSavedTea((value) => !value)} className="flex w-full items-center justify-between bg-[#f8fbfb] px-3 py-2 text-left text-xs font-bold text-[#315763]">
            <span>TEa ที่ตั้งค่าแล้ว ({data.teaSpecs.length})</span>
            <span className="text-[#0b7f76]">{showSavedTea ? 'ซ่อน' : 'แสดง'}</span>
          </button>
          {showSavedTea ? <div className="overflow-x-auto border-t border-[#e2ecee]">
          <table className="w-full min-w-[640px] text-left text-xs">
            <thead className="border-b border-[#edf2f2] text-[#789097]">
              <tr>
                <th className="px-3 py-2 font-semibold">ชุดทดสอบ</th>
                <th className="px-3 py-2 font-semibold">Analyte</th>
                <th className="px-3 py-2 font-semibold">TEa</th>
                <th className="px-3 py-2 font-semibold">Source ref</th>
                <th className="px-3 py-2 font-semibold">สถานะ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#edf2f2] text-[#3f5c64]">
              {data.teaSpecs.map((spec) => {
                const analyte = data.analytes.find((item) => item.id === spec.analyteId)
                return (
                  <tr key={spec.id}>
                    <td className="px-3 py-2 text-[#789097]">{analyte?.groupLabel ?? '—'}</td>
                    <td className="px-3 py-2 font-semibold">{spec.analyteCode}</td>
                    <td className="px-3 py-2 mono">{spec.teaValue} {spec.teaMode === 'percent' ? '%' : ''}{spec.teaUnit ? ` ${spec.teaUnit}` : ''}</td>
                    <td className="px-3 py-2 text-[#789097]">{spec.sourceRef ?? '—'}</td>
                    <td className="px-3 py-2"><span className={spec.isActive ? 'text-[#187746]' : 'text-[#789097]'}>{spec.isActive ? 'ใช้งาน' : 'ปิด'}</span></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          </div> : null}
        </div>
      ) : <p className="text-xs text-[#789097]">ยังไม่มี TEa ที่บันทึกไว้</p>}
    </Card>
  )
}

function AnalyteForm({ onSubmit, onUpdate, onToggle, onDelete, analytes }: { onSubmit: (b: unknown) => Promise<boolean>; onUpdate: (id: string, b: unknown) => Promise<boolean>; onToggle: (id: string, isActive: boolean) => Promise<boolean>; onDelete: (id: string) => Promise<boolean>; analytes: IqcWorkspace['analytes'] }) {
  const [form, setForm] = useState({
    code: '',
    name: '',
    dataType: 'quantitative',
    scale: 'linear',
    isAbsolute: false,
    unit: '',
    groupLabel: '',
  })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const existingTestSets = useMemo(
    () => [...new Set(analytes.flatMap((analyte) => parseTestSets(analyte.groupLabel)))].sort((a, b) => a.localeCompare(b)),
    [analytes],
  )
  function reset() {
    setEditingId(null)
    setForm({
      code: '',
      name: '',
      dataType: 'quantitative',
      scale: 'linear',
      isAbsolute: false,
      unit: '',
      groupLabel: '',
    })
  }
  return (
    <Card className="space-y-3 p-4">
      <h2 className="font-bold text-[#173d50]">{editingId ? 'Edit analyte' : 'Analyte'}</h2>
      <form
        className="space-y-2"
        onSubmit={async (e) => {
          e.preventDefault()
          setBusy(true)
          if (editingId ? await onUpdate(editingId, form) : await onSubmit(form)) reset()
          setBusy(false)
        }}
      >
        <div className="grid grid-cols-2 gap-2">
          <Field label="Code">
            <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} required />
          </Field>
          <Field label="ชื่อ / Name">
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </Field>
          <Field label="Data type">
            <Select value={form.dataType} onChange={(e) => setForm({ ...form, dataType: e.target.value, scale: e.target.value === 'qualitative' ? 'linear' : form.scale })}>
              <option value="quantitative">Quantitative</option>
              <option value="qualitative">Qualitative</option>
            </Select>
          </Field>
          {form.dataType === 'qualitative' ? (
            <Field label="Scale" hint="Qualitative ไม่ใช้ scale">
              <div className="flex min-h-11 items-center rounded-md border border-[#d9e5e6] bg-[#f3f6f6] px-3 text-sm text-[#8ba0a5]" aria-label="Scale ไม่ใช้กับ Qualitative">ไม่ใช้กับ Qualitative</div>
            </Field>
          ) : (
            <Field label="Scale" hint="Log10 ใช้กับ viral load ที่เป็นตัวเลข">
              <Select value={form.scale} onChange={(e) => setForm({ ...form, scale: e.target.value })}>
                <option value="linear">Linear</option>
                <option value="log10">Log10 (VL)</option>
              </Select>
            </Field>
          )}
          <Field label="Unit">
            <Input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="%, cells/µL, IU/mL" />
          </Field>
          <Field label="ชุดทดสอบ / Test set">
            <Input list="iqc-existing-test-sets" value={form.groupLabel} onChange={(e) => setForm({ ...form, groupLabel: e.target.value })} placeholder="เลือกชุดที่มีอยู่ หรือพิมพ์ชื่อชุดใหม่" />
            <datalist id="iqc-existing-test-sets">
              {existingTestSets.map((testSet) => <option key={testSet} value={testSet} />)}
            </datalist>
            {existingTestSets.length ? <p className="mt-1 text-[11px] text-[#789097]">เลือกจากรายการได้ หรือคั่นด้วย | เมื่อต้องการใช้มากกว่า 1 ชุด</p> : null}
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm text-[#3f5c64]">
          <input type="checkbox" checked={form.isAbsolute} onChange={(e) => setForm({ ...form, isAbsolute: e.target.checked })} /> เป็นค่า absolute count (เช่น AbsCD4 — Trucount มีผล)
        </label>
        <div className="flex flex-wrap gap-2">
          <Button disabled={busy}>{editingId ? 'บันทึกการแก้ไข' : 'เพิ่ม analyte'}</Button>
          {editingId ? (
            <Button type="button" variant="ghost" disabled={busy} onClick={reset}>
              ยกเลิก
            </Button>
          ) : null}
        </div>
      </form>
      <ManagedList
        noun="Analyte"
        onToggle={onToggle}
        onEdit={(id) => {
          const item = analytes.find((a) => a.id === id)
          if (!item) return
          setEditingId(id)
          setForm({
            code: item.code,
            name: item.name,
            dataType: item.dataType,
            scale: item.scale,
            isAbsolute: item.isAbsolute,
            unit: item.unit ?? '',
            groupLabel: item.groupLabel ?? '',
          })
        }}
        onDelete={(id) => onDelete(id)}
        items={analytes.map((a) => ({
          id: a.id,
          label: a.code,
          sublabel: `${a.name}${a.groupLabel ? ` · ${a.groupLabel}` : ''}`,
          isActive: a.isActive,
        }))}
      />
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
      <form
        className="grid grid-cols-3 gap-2"
        onSubmit={async (e) => {
          e.preventDefault()
          setBusy(true)
          if (editingId ? await onUpdate(editingId, form) : await onSubmit(form)) reset()
          setBusy(false)
        }}
      >
        <Field label="Code">
          <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} required />
        </Field>
        <Field label="Name">
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        </Field>
        <Field label="Model">
          <Input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} placeholder="cobas 6800" />
        </Field>
        <div className="col-span-3 flex flex-wrap gap-2">
          <Button disabled={busy}>{editingId ? 'บันทึกการแก้ไข' : 'เพิ่ม instrument'}</Button>
          {editingId ? (
            <Button type="button" variant="ghost" disabled={busy} onClick={reset}>
              ยกเลิก
            </Button>
          ) : null}
        </div>
      </form>
      <ManagedList
        noun="Instrument"
        onToggle={onToggle}
        onEdit={(id) => {
          const item = instruments.find((i) => i.id === id)
          if (!item) return
          setEditingId(id)
          setForm({
            code: item.code,
            name: item.name,
            model: item.model ?? '',
          })
        }}
        onDelete={(id) => onDelete(id)}
        items={instruments.map((i) => ({
          id: i.id,
          label: i.code,
          sublabel: `${i.name}${i.model ? ` · ${i.model}` : ''}`,
          isActive: i.isActive,
        }))}
      />
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
      <form
        className="grid grid-cols-3 gap-2"
        onSubmit={async (e) => {
          e.preventDefault()
          setBusy(true)
          if (editingId ? await onUpdate(editingId, form) : await onSubmit(form)) reset()
          setBusy(false)
        }}
      >
        <Field label="Name">
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        </Field>
        <Field label="Level">
          <Input value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value })} placeholder="HPC/LPC/Normal" />
        </Field>
        <Field label="Manufacturer">
          <Input value={form.manufacturer} onChange={(e) => setForm({ ...form, manufacturer: e.target.value })} />
        </Field>
        <div className="col-span-3 flex flex-wrap gap-2">
          <Button disabled={busy}>{editingId ? 'บันทึกการแก้ไข' : 'เพิ่ม material'}</Button>
          {editingId ? (
            <Button type="button" variant="ghost" disabled={busy} onClick={reset}>
              ยกเลิก
            </Button>
          ) : null}
        </div>
      </form>
      <ManagedList
        noun="Control material"
        onToggle={onToggle}
        onEdit={(id) => {
          const item = materials.find((m) => m.id === id)
          if (!item) return
          setEditingId(id)
          setForm({
            name: item.name,
            level: item.level ?? '',
            manufacturer: item.manufacturer ?? '',
          })
        }}
        onDelete={(id) => onDelete(id)}
        items={materials.map((m) => ({
          id: m.id,
          label: m.name,
          sublabel: [m.level, m.manufacturer].filter(Boolean).join(' · ') || undefined,
          isActive: m.isActive,
        }))}
      />
    </Card>
  )
}

function LotForm({ onSubmit, onUpdate, onToggle, onDelete, data }: { onSubmit: (b: unknown) => Promise<boolean>; onUpdate: (id: string, b: unknown) => Promise<boolean>; onToggle: (id: string, isActive: boolean) => Promise<boolean>; onDelete: (id: string) => Promise<boolean>; data: IqcWorkspace }) {
  const [form, setForm] = useState({
    controlMaterialId: '',
    lotNumber: '',
    expiryDate: '',
    stockLotId: '',
  })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [equipmentId, setEquipmentId] = useState('')
  const [busy, setBusy] = useState(false)
  const visibleStockLots = equipmentId ? data.stockLots.filter((lot) => lot.equipmentIds.includes(equipmentId)) : data.stockLots
  function reset() {
    setEditingId(null)
    setEquipmentId('')
    setForm({ controlMaterialId: '', lotNumber: '', expiryDate: '', stockLotId: '' })
  }
  return (
    <Card className="space-y-3 p-4">
      <h2 className="font-bold text-[#173d50]">{editingId ? 'Edit control lot' : 'Control lot'}</h2>
      <form
        className="grid grid-cols-3 gap-2"
        onSubmit={async (e) => {
          e.preventDefault()
          if (!form.controlMaterialId) return
          setBusy(true)
          if (
            editingId
              ? await onUpdate(editingId, {
                  ...form,
                  expiryDate: form.expiryDate || null,
                })
              : await onSubmit({ ...form, expiryDate: form.expiryDate || null })
          )
            reset()
          setBusy(false)
        }}
      >
        <Field label="Material">
          <Select value={form.controlMaterialId} onChange={(e) => setForm({ ...form, controlMaterialId: e.target.value })} required>
            <option value="">—</option>
            {data.controlMaterials
              .filter((m) => m.isActive)
              .map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                  {m.level ? ` (${m.level})` : ''}
                </option>
              ))}
          </Select>
        </Field>
        <Field label="Lot no.">
          <Input value={form.lotNumber} onChange={(e) => setForm({ ...form, lotNumber: e.target.value })} readOnly={Boolean(form.stockLotId)} required />
        </Field>
        <Field label="Expiry">
          <Input type="date" value={form.expiryDate} onChange={(e) => setForm({ ...form, expiryDate: e.target.value })} readOnly={Boolean(form.stockLotId)} />
        </Field>
        <Field label="เครื่องมือ (กรองน้ำยา)">
          <Select value={equipmentId} onChange={(e) => setEquipmentId(e.target.value)}>
            <option value="">ทุกเครื่องมือ</option>
            {data.instruments.filter((instrument) => instrument.isActive && instrument.equipmentId).map((instrument) => <option key={instrument.id} value={instrument.equipmentId!}>{instrument.code} · {instrument.name}</option>)}
          </Select>
        </Field>
        <Field label="Link lot ในคลัง">
          <Select value={form.stockLotId} onChange={(e) => {
            const stockLot = data.stockLots.find((lot) => lot.id === e.target.value)
            setForm({ ...form, stockLotId: e.target.value, lotNumber: stockLot?.lotNumber ?? form.lotNumber, expiryDate: stockLot?.expiryDate ?? form.expiryDate })
          }}>
            <option value="">ไม่เชื่อม / กรอกเอง</option>
            {visibleStockLots.map((lot) => <option key={lot.id} value={lot.id}>{lot.itemCode} · {lot.itemName} · LOT {lot.lotNumber}</option>)}
          </Select>
        </Field>
        <div className="col-span-3 flex flex-wrap gap-2">
          <Button disabled={busy}>{editingId ? 'บันทึกการแก้ไข' : 'เพิ่ม lot'}</Button>
          {editingId ? (
            <Button type="button" variant="ghost" disabled={busy} onClick={reset}>
              ยกเลิก
            </Button>
          ) : null}
        </div>
      </form>
      <ManagedList
        noun="Control lot"
        onToggle={onToggle}
        onEdit={(id) => {
          const item = data.controlLots.find((lot) => lot.id === id)
          if (!item) return
          setEditingId(id)
          setForm({
            controlMaterialId: item.controlMaterialId,
            lotNumber: item.lotNumber,
            expiryDate: item.expiryDate ?? '',
            stockLotId: item.stockLotId ?? '',
          })
        }}
        onDelete={(id) => onDelete(id)}
        items={data.controlLots.map((l) => ({
          id: l.id,
          label: l.lotNumber,
          sublabel: `${l.controlMaterialName}${l.level ? ` ${l.level}` : ''}${l.expiryDate ? ` · exp ${formatDate(l.expiryDate)}` : ''}`,
          isActive: l.isActive,
        }))}
      />
    </Card>
  )
}

function SpecForm({ onSubmit, data }: { onSubmit: (b: unknown) => Promise<boolean>; data: IqcWorkspace }) {
  const [form, setForm] = useState({
    controlLotId: '',
    analyteId: '',
    assignedMean: '',
    assignedSd: '',
    expectedQualitative: '',
    changeReason: '',
  })
  const [busy, setBusy] = useState(false)
  const lotSpecs = data.specs.filter((s) => s.controlLotId === form.controlLotId)
  const selectedAnalyteIsLog = data.analytes.find((a) => a.id === form.analyteId)?.scale === 'log10'
  return (
    <Card className="space-y-3 p-4 lg:col-span-2">
      <h2 className="font-bold text-[#173d50]">Assigned spec (mean/SD ของผู้ผลิต)</h2>
      <p className="text-xs text-[#789097]">สำหรับ Viral load (log10 scale): กรอก Assigned mean/SD เป็นค่า <strong>log10</strong> ตามที่ certificate ระบุโดยตรง — ระบบไม่แปลงค่านี้ให้ (การแปลง log10 อัตโนมัติใช้เฉพาะตอนบันทึกผล IQC ประจำวันจากค่า Copies/mL หรือ IU/mL เท่านั้น)</p>
      <form
        className="grid gap-2 md:grid-cols-5"
        onSubmit={async (e) => {
          e.preventDefault()
          if (!form.controlLotId || !form.analyteId) return
          setBusy(true)
          const body = {
            controlLotId: form.controlLotId,
            analyteId: form.analyteId,
            assignedMean: form.assignedMean === '' ? null : Number(form.assignedMean),
            assignedSd: form.assignedSd === '' ? null : Number(form.assignedSd),
            expectedQualitative: form.expectedQualitative || null,
            changeReason: form.changeReason || null,
          }
          if (await onSubmit(body))
            setForm({
              controlLotId: '',
              analyteId: '',
              assignedMean: '',
              assignedSd: '',
              expectedQualitative: '',
              changeReason: '',
            })
          setBusy(false)
        }}
      >
        <Field label="Control lot">
          <Select value={form.controlLotId} onChange={(e) => setForm({ ...form, controlLotId: e.target.value })} required>
            <option value="">—</option>
            {data.controlLots.map((l) => (
              <option key={l.id} value={l.id}>
                {l.controlMaterialName}
                {l.level ? ` ${l.level}` : ''} · {l.lotNumber}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Analyte">
          <Select value={form.analyteId} onChange={(e) => setForm({ ...form, analyteId: e.target.value })} required>
            <option value="">—</option>
            {data.analytes.map((a) => (
              <option key={a.id} value={a.id}>
                {a.code}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={selectedAnalyteIsLog ? 'Assigned mean (log10)' : 'Assigned mean'} hint={selectedAnalyteIsLog ? 'กรอกเป็นค่า log10 จาก certificate — ห้ามกรอกค่า Copies/mL หรือ IU/mL ดิบ' : undefined}>
          <Input className="mono" type="number" step="any" value={form.assignedMean} onChange={(e) => setForm({ ...form, assignedMean: e.target.value })} placeholder={selectedAnalyteIsLog ? 'เช่น 4.98' : undefined} />
        </Field>
        <Field label={selectedAnalyteIsLog ? 'Assigned SD (log10)' : 'Assigned SD'} hint={selectedAnalyteIsLog ? 'กรอกเป็นค่า log10 (เช่น ±0.5 log)' : undefined}>
          <Input className="mono" type="number" step="any" value={form.assignedSd} onChange={(e) => setForm({ ...form, assignedSd: e.target.value })} placeholder={selectedAnalyteIsLog ? 'เช่น 0.15' : undefined} />
        </Field>
        <Field label="Expected (qual)">
          <Input value={form.expectedQualitative} onChange={(e) => setForm({ ...form, expectedQualitative: e.target.value })} placeholder="valid/pos" />
        </Field>
        <Field label="เหตุผลแก้ไข Spec" hint="ต้องระบุเมื่อแก้ไข spec ที่มีอยู่แล้ว">
          <Input value={form.changeReason} onChange={(e) => setForm({ ...form, changeReason: e.target.value })} placeholder="เช่น แก้ตาม certificate ผู้ผลิต" />
        </Field>
        <div className="md:col-span-5">
          <Button disabled={busy}>บันทึก spec</Button>
        </div>
      </form>
      {form.controlLotId ? (
        <div className="space-y-1.5 border-t border-[#e9eff0] pt-3">
          <p className="text-xs font-semibold text-[#58747d]">Spec ที่กรอกแล้วของ Lot นี้ ({lotSpecs.length})</p>
          {lotSpecs.length ? (
            <div className="max-h-72 space-y-1.5 overflow-auto pr-1">
              {lotSpecs.map((s) => {
                const analyte = data.analytes.find((a) => a.id === s.analyteId)
                return (
                  <div key={s.id} className="flex items-center justify-between gap-2 rounded-md border border-[#e3ebec] bg-white px-2.5 py-1.5 text-xs">
                    <span className="min-w-0 truncate">
                      <span className="font-semibold text-[#315763]">{analyte?.code ?? s.analyteId}</span>
                      <span className="text-[#9aafb4]">
                        {' '}
                        · Assigned {fmtCompact(s.assignedMean)} / SD {fmtCompact(s.assignedSd)}
                        {s.expectedQualitative ? ` · Expected ${s.expectedQualitative}` : ''}
                        {' · ใช้เกณฑ์: '}
                        {s.activeLimit === 'lab' ? 'LAB' : 'Assigned'}
                      </span>
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      className="min-h-7 shrink-0 px-2 py-1 text-xs"
                      onClick={() =>
                        setForm({
                          ...form,
                          analyteId: s.analyteId,
                          assignedMean: s.assignedMean == null ? '' : String(s.assignedMean),
                          assignedSd: s.assignedSd == null ? '' : String(s.assignedSd),
                          expectedQualitative: s.expectedQualitative ?? '',
                          changeReason: '',
                        })
                      }
                    >
                      แก้ไข
                    </Button>
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="px-1 py-3 text-center text-xs text-[#9aafb4]">ยังไม่มี spec สำหรับ Lot นี้</p>
          )}
        </div>
      ) : null}
    </Card>
  )
}
