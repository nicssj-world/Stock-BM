'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { CheckCircle2, ChevronRight, Pencil, Printer, Trash2, X } from 'lucide-react'
import type { BmActor } from '@/lib/bm/types'
import type { EqaResult, EqaRound, EqaWorkspace } from '@/lib/eqa/types'
import { analyteDefaultUnit, analyteScopeOptions, roundProgress, roundReceiptIssues, roundStatusIndex, type EqaReadinessTarget } from '@/lib/eqa/rules'
import { parseTestSets } from '@/lib/iqc/test-sets'
import { formatDate } from '@/lib/bm/rules'
import { api, Button, Card, Field, Input, Select, StatusBadge, Textarea } from '@/components/ui'
import { AttachmentList } from '@/components/attachments'
import { GeneratePlannedRoundsButton } from '@/components/eqa/planned-rounds'
import { ApprovalPanel, OUTCOME_TONE, STATUS_TONE, UserSelect, type EqaFocus, type Update } from '@/components/eqa/shared'

type EqaRoundFilter = 'active' | 'closed' | 'all'

const ROUND_STATUS_LABELS: Record<EqaRound['status'], string> = {
  scheduled: 'รอรับตัวอย่าง', received: 'กำลังลงผล', submitted: 'รอผลประเมิน', evaluated: 'รอลงนาม', closed: 'ปิดรอบแล้ว',
}
const OUTCOME_LABELS: Record<EqaResult['outcome'], string> = {
  acceptable: 'ผ่าน (acceptable)', warning: 'ไม่ผ่าน (warning)', unacceptable: 'ไม่ผ่าน (unacceptable)', 'not-evaluated': 'รอประเมิน',
}

function outcomeSelectClass(outcome: EqaResult['outcome']) {
  if (outcome === 'unacceptable') return 'bg-red-100 text-red-800'
  if (outcome === 'warning') return 'bg-amber-100 text-amber-800'
  if (outcome === 'acceptable') return 'bg-emerald-100 text-emerald-800'
  return 'bg-slate-100 text-slate-800'
}

// The global page Notice banner lives above the tabs, which is out of view
// once the user has scrolled into a round card lower down the (possibly
// long, 6-rounds-a-year) list -- so save actions inside a card also get
// this local, transient confirmation right next to the button that was clicked.
function useSavedFlash(): [boolean, () => void] {
  const [saved, setSaved] = useState(false)
  useEffect(() => {
    if (!saved) return
    const id = setTimeout(() => setSaved(false), 2500)
    return () => clearTimeout(id)
  }, [saved])
  return [saved, () => setSaved(true)]
}

function SavedFlash({ show }: { show: boolean }) {
  if (!show) return null
  return <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#2f7d44]"><CheckCircle2 className="size-3.5" /> บันทึกแล้ว</span>
}

function copiesToLog10(value: string | null) {
  const raw = (value ?? '').trim()
  if (!raw || /^[<>]/.test(raw)) return null
  const copies = Number(raw.replace(/,/g, '').replace(/\s*(?:copies|iu)\/?ml\s*$/i, ''))
  return Number.isFinite(copies) && copies > 0 ? Math.log10(copies) : null
}

function EqaSubmittedValue({ value, unit, isLogScale }: { value: string | null; unit: string | null; isLogScale: boolean }) {
  const log10 = isLogScale ? copiesToLog10(value) : null
  return <><span>{value ?? '-'} {unit ?? ''}</span>{log10 != null ? <span className="ml-1.5 whitespace-nowrap rounded bg-[#e8f5f3] px-1.5 py-0.5 text-[10px] font-semibold text-[#176d65]">log10 {log10.toFixed(3)}</span> : null}</>
}

// Fields for a step the round hasn't reached yet are hidden rather than
// rendered disabled -- an empty scheduled round used to dump the receipt,
// results, summary, and approval sections on screen at once, which read as
// "everything is required right now" instead of "do these in order."
function StepLocked({ text }: { text: string }) {
  return <p className="mt-3 rounded-md border border-dashed border-[#dbe6e7] bg-[#fbfdfd] px-3 py-2 text-xs text-[#91a3a7]">{text}</p>
}

export function RoundsTab({ data, actor, focus, onNavigate, onOk, onErr }: { data: EqaWorkspace; actor: BmActor; focus?: EqaFocus | null; onNavigate: (target: EqaReadinessTarget) => void; onOk: Update; onErr: (text: string) => void }) {
  const planYears = useMemo(() => [...new Set(data.rounds.map((round) => round.planYear).filter((year): year is number => year != null))].sort((a, b) => b - a), [data.rounds])
  const planItemsByYear = useMemo(() => data.annualPlans.flatMap((plan) => plan.items.map((item) => ({ ...item, planYear: plan.planYear }))), [data.annualPlans])
  const [yearFilter, setYearFilter] = useState<number | 'all'>(planYears[0] ?? 'all')
  const [statusFilter, setStatusFilter] = useState<EqaRoundFilter>('active')
  const [query, setQuery] = useState('')
  const [visibleCount, setVisibleCount] = useState(10)

  // A deep link must always be able to reach its target, even if it falls
  // outside whatever filter/visible-count the user currently has set.
  const focusedRound = focus?.roundId ? (data.rounds.find((round) => round.id === focus.roundId) ?? null) : null
  const effectiveYear = focusedRound && yearFilter !== 'all' && focusedRound.planYear !== yearFilter ? 'all' : yearFilter
  const effectiveStatus = focusedRound && statusFilter !== 'all' && (statusFilter === 'active' ? focusedRound.status === 'closed' : focusedRound.status !== 'closed') ? 'all' : statusFilter

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase()
    return data.rounds.filter((round) => {
      const yearMatches = effectiveYear === 'all' || round.planYear === effectiveYear
      const statusMatches = effectiveStatus === 'all' || (effectiveStatus === 'active' ? round.status !== 'closed' : round.status === 'closed')
      const textMatches = !normalizedQuery || [round.planItemName, round.schemeName, round.roundLabel, round.providerName, ...round.results.map((result) => result.sampleCode)]
        .filter((value): value is string => Boolean(value)).some((value) => value.toLocaleLowerCase().includes(normalizedQuery))
      return yearMatches && statusMatches && textMatches
    })
  }, [data.rounds, effectiveYear, effectiveStatus, query])
  const focusedIndex = focusedRound ? filtered.findIndex((round) => round.id === focusedRound.id) : -1
  const visible = filtered.slice(0, Math.max(visibleCount, focusedIndex + 1))

  const groups = useMemo(() => {
    const map = new Map<string, { key: string; label: string; planItem: (typeof planItemsByYear)[number] | null; rounds: EqaRound[] }>()
    for (const round of visible) {
      const key = round.planItemId ?? 'unassigned'
      const planItem = round.planItemId ? (planItemsByYear.find((item) => item.id === round.planItemId) ?? null) : null
      const existing = map.get(key)
      if (existing) existing.rounds.push(round)
      else map.set(key, { key, label: round.planItemName ?? 'ยังไม่จัดเข้าปี', planItem, rounds: [round] })
    }
    return [...map.values()]
  }, [visible, planItemsByYear])

  // Rounds keep their own collapsed state locally (so per-round toggling
  // doesn't disturb sibling cards mid-edit); this bump signal is how a
  // group-level "collapse all/expand all" reaches down into each card
  // without lifting -- and thus losing -- their in-progress form state.
  const [groupCollapseSignal, setGroupCollapseSignal] = useState<Record<string, { signal: number; value: boolean }>>({})
  function collapseGroup(key: string, value: boolean) {
    setGroupCollapseSignal((prev) => ({ ...prev, [key]: { signal: (prev[key]?.signal ?? 0) + 1, value } }))
  }

  if (!data.rounds.length) return <Card className="p-8 text-center text-sm text-[#8198a0]">ยังไม่มี round — สร้างอัตโนมัติได้จากแท็บแผนรายปี หรือให้ Admin สร้างจากแท็บจัดการ</Card>

  const activeCount = data.rounds.filter((round) => round.status !== 'closed').length
  const closedCount = data.rounds.length - activeCount

  function selectYear(value: string) { setYearFilter(value === 'all' ? 'all' : Number(value)); setVisibleCount(10) }
  function selectStatus(value: EqaRoundFilter) { setStatusFilter(value); setVisibleCount(10) }
  function updateQuery(value: string) { setQuery(value); setVisibleCount(10) }

  return <div className="space-y-3">
    <div className="px-1"><p className="text-xs font-bold text-[#0b7f76]">ขั้นตอนที่ 2–3 · รับตัวอย่าง ลงผล และบันทึกผลประเมิน</p><p className="mt-1 text-sm text-[#6a838c]">เปิดทีละรอบแล้วทำตามแถบขั้นตอน ระบบจะสรุปผ่านเมื่อทุกผลเป็น acceptable เท่านั้น</p></div>
    <Card className="space-y-2 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Select className="h-9 w-28" value={String(yearFilter)} onChange={(event) => selectYear(event.target.value)} aria-label="ปีของแผน">
          <option value="all">ทุกปี</option>
          {planYears.map((year) => <option key={year} value={year}>{year + 543}</option>)}
        </Select>
        <div className="flex flex-wrap gap-1">
          {([['active', `กำลังดำเนินการ ${activeCount}`], ['closed', `ปิดรอบแล้ว ${closedCount}`], ['all', `ทั้งหมด ${data.rounds.length}`]] as [EqaRoundFilter, string][]).map(([value, label]) => (
            <button key={value} type="button" aria-pressed={effectiveStatus === value} onClick={() => selectStatus(value)} className={`rounded-full border px-2.5 py-1 text-[11px] font-bold transition focus-visible:ring-2 focus-visible:ring-[#0b7f76] focus-visible:outline-none ${effectiveStatus === value ? 'border-[#0b7f76] bg-[#e6f5f2] text-[#08766e]' : 'border-[#d6e2e3] bg-white text-[#58747d] hover:bg-[#f3f9f9]'}`}>{label}</button>
          ))}
        </div>
      </div>
      <Input value={query} onChange={(event) => updateQuery(event.target.value)} placeholder="ค้นหารายการแผน, round, provider, หรือ sample code" aria-label="ค้นหา round" />
    </Card>
    {groups.map((group) => (
      <div key={group.key} className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 px-1">
          <p className="text-sm font-bold text-[#315763]">{group.label}{group.planItem?.expectedRounds != null ? <span className="ml-1 font-normal text-[#8ba0a5]">({data.rounds.filter((round) => round.planItemId === group.planItem!.id).length}/{group.planItem.expectedRounds} รอบ)</span> : null}</p>
          <div className="flex items-center gap-2">
            {group.rounds.length > 1 ? <div className="flex gap-1">
              <Button type="button" variant="ghost" className="min-h-6 px-2 py-0.5 text-[11px]" onClick={() => collapseGroup(group.key, true)}>ย่อทั้งหมด</Button>
              <Button type="button" variant="ghost" className="min-h-6 px-2 py-0.5 text-[11px]" onClick={() => collapseGroup(group.key, false)}>ขยายทั้งหมด</Button>
            </div> : null}
            {group.planItem ? <GeneratePlannedRoundsButton item={group.planItem} planYear={group.planItem.planYear} itemRounds={data.rounds.filter((round) => round.planItemId === group.planItem!.id)} onOk={onOk} onErr={onErr} /> : null}
          </div>
        </div>
        {group.rounds.map((round) => <div key={round.id} id={`eqa-round-${round.id}`}><RoundCard round={round} data={data} actor={actor} focus={focus} onNavigate={onNavigate} onOk={onOk} onErr={onErr} forceCollapsed={groupCollapseSignal[group.key]} /></div>)}
      </div>
    ))}
    {filtered.length > visible.length ? <div className="flex justify-center"><Button variant="secondary" onClick={() => setVisibleCount((count) => count + 10)}>แสดงเพิ่มอีก {Math.min(10, filtered.length - visible.length)} รายการ</Button></div> : null}
    {!filtered.length ? <Card className="p-8 text-center text-sm text-[#8198a0]">ไม่พบ round ที่ตรงเงื่อนไข</Card> : null}
  </div>
}

function RoundProgressStrip({ round, onNavigate, lockedSteps }: { round: EqaRound; onNavigate: (target: EqaReadinessTarget) => void; lockedSteps?: Set<string> }) {
  const steps = roundProgress(round)
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {steps.map((step, index) => <div key={step.key} className="flex items-center gap-1.5">{step.done ? (
        <span key={step.key} className="inline-flex items-center gap-1 rounded-full border border-[#bfe3d8] bg-[#eefaf5] px-2 py-0.5 text-[11px] font-semibold text-[#2f7d44]">
          <CheckCircle2 className="size-3" /> {step.label}
        </span>
      ) : step.target && !lockedSteps?.has(step.key) ? (
        <button key={step.key} type="button" onClick={() => onNavigate(step.target!)} className="rounded-full border border-[#eed4a6] bg-[#fff9ed] px-2 py-0.5 text-[11px] font-semibold text-[#a9700f] underline decoration-dotted hover:bg-[#fff3dc]">
          {step.label}
        </button>
      ) : (
        <span key={step.key} className="rounded-full border border-[#eed4a6] bg-[#fff9ed] px-2 py-0.5 text-[11px] font-semibold text-[#a9700f]">{step.label}</span>
      )}{index < steps.length - 1 ? <ChevronRight className="size-4 shrink-0 text-[#8ba0a5]" aria-hidden="true" /> : null}</div>)}
    </div>
  )
}

function RoundCard({ round, data, actor, focus, onNavigate, onOk, onErr, forceCollapsed }: { round: EqaRound; data: EqaWorkspace; actor: BmActor; focus?: EqaFocus | null; onNavigate: (target: EqaReadinessTarget) => void; onOk: Update; onErr: (text: string) => void; forceCollapsed?: { signal: number; value: boolean } }) {
  const [showReceipt, setShowReceipt] = useState(false)
  const isFocused = focus?.roundId === round.id
  const allStepsDone = roundProgress(round).every((step) => step.done)
  // A round nobody has touched yet (still "scheduled", no receipt or
  // results) is just as safe to start collapsed as a finished one -- plan
  // items with up to 6 rounds/year otherwise render a wall of empty forms.
  const untouched = round.status === 'scheduled' && !round.sampleReceivedDate && !round.externalSentDate && round.results.length === 0
  const [collapsed, setCollapsed] = useState(allStepsDone || untouched)
  const [appliedCollapseSignal, setAppliedCollapseSignal] = useState<number | null>(null)
  if (forceCollapsed && forceCollapsed.signal !== appliedCollapseSignal) {
    setAppliedCollapseSignal(forceCollapsed.signal)
    setCollapsed(forceCollapsed.value)
  }
  const showDetails = !collapsed || isFocused
  // Adjusting state during render (not in an effect) when the focus target
  // changes, per React's "you might not need an Effect" pattern -- this is
  // the one-time "open the receipt editor because a readiness link pointed
  // here" action, not a DOM sync, so it doesn't belong in the effect below.
  const [appliedFocus, setAppliedFocus] = useState<EqaFocus | null | undefined>(undefined)
  if (isFocused && focus !== appliedFocus) {
    setAppliedFocus(focus)
    if (focus?.open === 'receipt') setShowReceipt(true)
  }
  useEffect(() => {
    if (!isFocused) return
    const targetId = focus?.open === 'result' ? `eqa-round-${round.id}-results` : focus?.open === 'summary' ? `eqa-round-${round.id}-summary` : `eqa-round-${round.id}`
    document.getElementById(targetId)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [focus, isFocused, round.id])
  const [busy, setBusy] = useState(false)
  const [panelSaving, setPanelSaving] = useState(false)
  const [confirmingEvaluation, setConfirmingEvaluation] = useState(false)
  const [updatingOutcomeId, setUpdatingOutcomeId] = useState<string | null>(null)
  const [resultForm, setResultForm] = useState({ analyte: '', sampleCode: '', submittedValue: '', unit: '', ctValue: '', assignedValue: '', evaluationScore: '', outcome: 'not-evaluated', iqcAnalyteId: '' })
  const [roundIqcPanelId, setRoundIqcPanelId] = useState(() => round.results.find((result) => result.iqcAnalyteId)?.iqcAnalyteId ?? '')
  const [editingResult, setEditingResult] = useState<EqaResult | null>(null)
  const [summaryNote, setSummaryNote] = useState(round.summaryNote ?? '')
  const analyteOptions = useMemo(() => analyteScopeOptions(data.schemes.find((scheme) => scheme.id === round.schemeId)?.analyteScope), [data.schemes, round.schemeId])
  const iqcPanels = useMemo(() => {
    const panels = new Map<string, { id: string; count: number }>()
    data.iqcAnalytes.forEach((analyte) => {
      // Keep the selector usable immediately after a hot reload or for legacy
      // workspace payloads that predate groupLabel. The persisted link remains
      // the same IQC analyte id; this only supplies its panel label.
      const panelNames = parseTestSets(analyte.groupLabel)
      const fallbackPanel = analyte.code.replace(/\s*\((HPC|LPC|Normal)\)\s*$/i, '').trim()
      ;(panelNames.length ? panelNames : fallbackPanel ? [fallbackPanel] : []).forEach((panel) => {
      const current = panels.get(panel)
      panels.set(panel, { id: current?.id ?? analyte.id, count: (current?.count ?? 0) + 1 })
      })
    })
    return [...panels.entries()].map(([name, panel]) => ({ name, ...panel })).sort((a, b) => a.name.localeCompare(b.name))
  }, [data.iqcAnalytes])
  const savedIqcPanel = iqcPanels.find((panel) => round.results.some((result) => result.iqcAnalyteId === panel.id)) ?? null
  function selectAnalyte(analyte: string) { setResultForm((form) => ({ ...form, analyte, unit: analyteDefaultUnit(analyte, data.iqcAnalytes) })) }
  function editResult(result: EqaResult) { setEditingResult(result); setResultForm({ analyte: result.analyte, sampleCode: result.sampleCode ?? '', submittedValue: result.submittedValue ?? '', unit: result.unit ?? '', ctValue: result.ctValue == null ? '' : String(result.ctValue), assignedValue: result.assignedValue ?? '', evaluationScore: result.evaluationScore == null ? '' : String(result.evaluationScore), outcome: result.outcome, iqcAnalyteId: result.iqcAnalyteId ?? '' }) }
  function resetResult() { setEditingResult(null); setResultForm({ analyte: '', sampleCode: '', submittedValue: '', unit: '', ctValue: '', assignedValue: '', evaluationScore: '', outcome: 'not-evaluated', iqcAnalyteId: '' }) }
  async function saveResult(event?: React.SyntheticEvent) { event?.preventDefault(); if (!resultForm.sampleCode.trim() || !resultForm.submittedValue.trim()) return onErr('กรอกรหัสตัวอย่างและผลที่ส่งให้ครบก่อนบันทึก'); setBusy(true); const body = { ...resultForm, sampleCode: resultForm.sampleCode || null, submittedValue: resultForm.submittedValue || null, unit: resultForm.unit || null, ctValue: resultForm.ctValue ? Number(resultForm.ctValue) : null, assignedValue: resultForm.assignedValue || null, evaluationScore: resultForm.evaluationScore ? Number(resultForm.evaluationScore) : null, iqcAnalyteId: resultForm.iqcAnalyteId || null }; try { const result = await api<{ eqa: EqaWorkspace }>(editingResult ? `/api/eqa/results/${editingResult.id}` : '/api/eqa/results', { method: editingResult ? 'PATCH' : 'POST', body: JSON.stringify(editingResult ? body : { roundId: round.id, ...body }) }); onOk(editingResult ? 'แก้ไขผลแล้ว' : 'เพิ่มผลแล้ว', result.eqa); resetResult() } catch (error) { onErr(error instanceof Error ? error.message : 'บันทึกผลไม่สำเร็จ') } finally { setBusy(false) } }
  async function updateOutcome(result: EqaResult, outcome: EqaResult['outcome']) { if (outcome === result.outcome) return; setUpdatingOutcomeId(result.id); try { const response = await api<{ eqa: EqaWorkspace }>(`/api/eqa/results/${result.id}`, { method: 'PATCH', body: JSON.stringify({ analyte: result.analyte, sampleCode: result.sampleCode, submittedValue: result.submittedValue, unit: result.unit, ctValue: result.ctValue, assignedValue: result.assignedValue, evaluationScore: result.evaluationScore, outcome, iqcAnalyteId: result.iqcAnalyteId }) }); onOk('อัปเดต Outcome แล้ว', response.eqa) } catch (error) { onErr(error instanceof Error ? error.message : 'อัปเดต Outcome ไม่สำเร็จ') } finally { setUpdatingOutcomeId(null) } }
  async function saveRoundIqcPanel() { if (!round.results.length) return; setPanelSaving(true); try { const updates = await Promise.all(round.results.map((result) => api<{ eqa: EqaWorkspace }>(`/api/eqa/results/${result.id}`, { method: 'PATCH', body: JSON.stringify({ analyte: result.analyte, sampleCode: result.sampleCode, submittedValue: result.submittedValue, unit: result.unit, ctValue: result.ctValue, assignedValue: result.assignedValue, evaluationScore: result.evaluationScore, outcome: result.outcome, iqcAnalyteId: roundIqcPanelId || null }) }))); onOk(roundIqcPanelId ? 'เชื่อม IQC panel ให้ผล EQA ทั้งรอบแล้ว' : 'ยกเลิกการเชื่อม IQC panel ทั้งรอบแล้ว', updates.at(-1)!.eqa) } catch (error) { onErr(error instanceof Error ? error.message : 'บันทึก IQC panel ไม่สำเร็จ') } finally { setPanelSaving(false) } }
  async function removeResult(result: EqaResult) { if (!window.confirm(`ลบผล ${result.sampleCode ?? result.analyte} ใช่ไหม?`)) return; try { const response = await api<{ eqa: EqaWorkspace }>(`/api/eqa/results/${result.id}`, { method: 'DELETE' }); onOk('ลบผลแล้ว', response.eqa) } catch (error) { onErr(error instanceof Error ? error.message : 'ลบผลไม่สำเร็จ') } }
  const [summarySaved, flashSummarySaved] = useSavedFlash()
  async function saveSummary() { try { const result = await api<{ eqa: EqaWorkspace }>(`/api/eqa/rounds/${round.id}/summary`, { method: 'PATCH', body: JSON.stringify({ summaryNote: summaryNote || null }) }); onOk('บันทึกหมายเหตุสรุปผลรอบแล้ว', result.eqa); flashSummarySaved() } catch (error) { onErr(error instanceof Error ? error.message : 'บันทึกไม่สำเร็จ') } }
  async function confirmEvaluation() { setConfirmingEvaluation(true); try { const result = await api<{ eqa: EqaWorkspace }>(`/api/eqa/rounds/${round.id}/evaluate`, { method: 'POST', body: JSON.stringify({ summaryNote: summaryNote || null }) }); onOk('บันทึกผลประเมินและสรุปผลแล้ว', result.eqa) } catch (error) { onErr(error instanceof Error ? error.message : 'บันทึกผลประเมินไม่สำเร็จ') } finally { setConfirmingEvaluation(false) } }
  // Status normally auto-advances (receipt saved -> received, analyst
  // confirms -> submitted, the provider outcomes are confirmed -> evaluated, technical manager
  // confirms -> closed), so it doubles as how far through the round we are.
  // Data that already exists always stays visible even if it's "ahead of"
  // the stored status -- e.g. an older round entered before this gating
  // existed -- so this never hides something the user already filled in.
  const statusIndex = roundStatusIndex(round.status)
  const showResults = statusIndex >= 1 || round.results.length > 0
  const canAddResults = statusIndex <= roundStatusIndex('submitted')
  const showSummary = statusIndex >= 2 || round.summaryOutcome !== 'not-evaluated' || Boolean(round.summaryNote)
  const showApproval = statusIndex >= 1 || round.approvals.length > 0
  const canAttachCertificate = statusIndex >= roundStatusIndex('submitted')
  const analystConfirmed = round.approvals.some((approval) => approval.approvalRole === 'analyst' && approval.signatureAttachmentId)
  const technicalManagerReady = statusIndex >= roundStatusIndex('evaluated') && analystConfirmed
  const lockedApprovalRoles = [
    ...(analystConfirmed ? ['analyst' as const] : []),
    ...(!technicalManagerReady ? ['technical-manager' as const] : []),
  ]
  const nextStep = roundProgress(round).find((step) => !step.done)
  const nextAction = nextStep?.label ?? 'รอบนี้ดำเนินการครบแล้ว'
  const lockedSteps = useMemo(() => new Set<string>([...(showResults ? [] : ['results']), ...(showSummary ? [] : ['summary'])]), [showResults, showSummary])
  return <Card className="p-4">
    <div className="flex flex-wrap items-start justify-between gap-2"><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-bold text-[#173d50]">{round.planItemName ?? round.schemeName} · {round.roundLabel}</h3><StatusBadge tone={STATUS_TONE[round.status]} label={ROUND_STATUS_LABELS[round.status]} />{!round.planItemId ? <StatusBadge tone="warning" label="ยังไม่จัดเข้าปี" /> : null}<Button type="button" variant="ghost" className="min-h-6 px-2 py-0.5 text-[11px]" onClick={() => setCollapsed(!collapsed)}>{showDetails ? 'ซ่อนรายละเอียด' : 'แสดงรายละเอียด'}</Button></div><p className="mt-1 text-xs text-[#789097]">{round.providerName} · ปี {round.planYear ? round.planYear + 543 : '-'} · รับ {formatDate(round.sampleReceivedDate)} · ส่ง {formatDate(round.submissionDate)}</p><div className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-[#dce7e8] bg-[#f8fbfb] px-2.5 py-1 text-xs"><span className="font-bold text-[#55727c]">ขั้นตอนถัดไป</span><span className={nextStep ? 'font-bold text-[#a9700f]' : 'font-bold text-[#2f7d44]'}>{nextAction}</span></div><RoundProgressStrip round={round} onNavigate={onNavigate} lockedSteps={lockedSteps} /></div><div className="flex flex-wrap gap-2"><Button variant="secondary" className="min-h-9 px-3 text-xs" onClick={() => { setCollapsed(false); setShowReceipt(!showReceipt) }}>{showReceipt ? 'ซ่อนแบบรับตัวอย่าง' : '1. กรอกแบบรับตัวอย่าง'}</Button><Link href={`/eqa/report/round-receipt/${round.id}?tab=rounds`} className="inline-flex items-center gap-1 rounded-md border border-[#b8c8cc] bg-white px-3 py-2 text-xs font-bold text-[#173d50]"><Printer className="size-4" /> Fm-QP-LAB-19/02</Link></div></div>
    {showDetails ? <>
    {showReceipt ? <ReceiptEditor round={round} data={data} onOk={onOk} onErr={onErr} /> : null}
    {showResults ? <div id={`eqa-round-${round.id}-results`}>
    <div className="mt-3 flex flex-wrap items-start justify-between gap-2"><div><p className="text-sm font-bold text-[#315763]">2. ลงผลที่ส่งให้ผู้จัด EQA</p><p className="mt-0.5 text-xs text-[#789097]">กรอกผลของแต่ละตัวอย่างก่อน จากนั้นจึงบันทึกผลประเมินที่ได้รับจากผู้จัด</p></div>{round.results.length ? <StatusBadge tone={round.results.some((result) => result.outcome === 'not-evaluated') ? 'warning' : 'accepted'} label={round.results.some((result) => result.outcome === 'not-evaluated') ? 'รอผลประเมินบางรายการ' : 'มีผลประเมินแล้ว'} /> : null}</div>
    {round.results.length ? (
      <div className="mt-3 overflow-x-auto rounded-md border border-[#e9eff0]">
        <table className="w-full min-w-[850px] text-left text-xs">
          <thead className="bg-[#f6fafa] text-[#55727c]">
            <tr>
              <th className="p-2">รหัสตัวอย่าง</th>
              <th className="p-2">รายการทดสอบ</th>
              <th className="p-2">ผลที่ส่ง</th>
              <th className="p-2">Ct</th>
              <th className="p-2">ค่าอ้างอิงจากผู้จัด</th>
              <th className="p-2">คะแนนจากผู้จัด</th>
              <th className="p-2">ผลประเมินจากผู้จัด</th>
              <th className="p-2">จัดการ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#eef3f3]">
            {round.results.map((result) => {
              const isEditing = editingResult?.id === result.id
              const isLogScale = data.iqcAnalytes.find((analyte) => analyte.id === result.iqcAnalyteId)?.scale === 'log10' || /\b(?:HIV|HBV|HCV)[\w-]*\s*VL\b/i.test(result.analyte)
              return (
                <tr key={result.id} className={isEditing ? 'bg-[#f6fafa]' : undefined}>
                  <td className="p-2 font-semibold">
                    {isEditing ? <Input aria-label={`Sample ${result.id}`} className="min-w-28" value={resultForm.sampleCode} onChange={(event) => setResultForm({ ...resultForm, sampleCode: event.target.value })} /> : result.sampleCode ?? '-'}
                  </td>
                  <td className="p-2">
                    {isEditing ? (analyteOptions.length ? <Select aria-label={`Analyte ${result.id}`} value={resultForm.analyte} onChange={(event) => selectAnalyte(event.target.value)}>{!analyteOptions.includes(resultForm.analyte) ? <option value={resultForm.analyte}>{resultForm.analyte}</option> : null}{analyteOptions.map((analyte) => <option key={analyte} value={analyte}>{analyte}</option>)}</Select> : <Input aria-label={`Analyte ${result.id}`} value={resultForm.analyte} onChange={(event) => setResultForm({ ...resultForm, analyte: event.target.value })} />) : result.analyte}
                  </td>
                  <td className="p-2">
                    {isEditing ? <div className="flex min-w-48 gap-1"><Input aria-label={`Submitted value ${result.id}`} value={resultForm.submittedValue} onChange={(event) => setResultForm({ ...resultForm, submittedValue: event.target.value })} /><Input aria-label={`Unit ${result.id}`} className="w-16" value={resultForm.unit} onChange={(event) => setResultForm({ ...resultForm, unit: event.target.value })} /></div> : <EqaSubmittedValue value={result.submittedValue} unit={result.unit} isLogScale={isLogScale} />}
                  </td>
                  <td className="p-2">
                    {isEditing ? <Input aria-label={`Ct ${result.id}`} type="number" step="any" className="min-w-20" value={resultForm.ctValue} onChange={(event) => setResultForm({ ...resultForm, ctValue: event.target.value })} /> : result.ctValue ?? '-'}
                  </td>
                  <td className="p-2">
                    {isEditing ? <Input aria-label={`Assigned value ${result.id}`} className="min-w-32" placeholder="Positive / Negative" value={resultForm.assignedValue} onChange={(event) => setResultForm({ ...resultForm, assignedValue: event.target.value })} /> : result.assignedValue ?? '-'}
                  </td>
                  <td className="p-2">
                    {isEditing ? <Input aria-label={`Score ${result.id}`} type="number" step="any" className="min-w-20" value={resultForm.evaluationScore} onChange={(event) => setResultForm({ ...resultForm, evaluationScore: event.target.value })} /> : result.evaluationScore ?? '-'}
                  </td>
                  <td className="p-2">
                    {isEditing ? (
                      <Select aria-label={`Outcome ${result.sampleCode ?? result.analyte}`} value={resultForm.outcome} onChange={(event) => setResultForm({ ...resultForm, outcome: event.target.value })}>
                        {Object.entries(OUTCOME_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                      </Select>
                    ) : (
                      <Select aria-label={`Outcome ${result.sampleCode ?? result.analyte}`} className={`min-w-36 rounded-full border-0 px-3 py-1.5 text-xs font-semibold ${outcomeSelectClass(result.outcome)}`} value={result.outcome} disabled={updatingOutcomeId === result.id} onChange={(event) => updateOutcome(result, event.target.value as EqaResult['outcome'])}>
                        {Object.entries(OUTCOME_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                      </Select>
                    )}
                  </td>
                  <td className="p-2">
                    <div className="flex gap-1">
                      {isEditing ? <><Button className="min-h-7 px-2 py-1 text-xs" disabled={busy} onClick={() => saveResult()}>บันทึก</Button><Button variant="ghost" className="min-h-7 px-2 py-1" title="ยกเลิก" onClick={resetResult}><X className="size-3.5" /></Button></> : <><Button variant="ghost" className="min-h-7 px-2 py-1" title="แก้ไขผล" onClick={() => editResult(result)}><Pencil className="size-3.5" /></Button><Button variant="danger" className="min-h-7 px-2 py-1" onClick={() => removeResult(result)}><Trash2 className="size-3.5" /></Button></>}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    ) : null}
    {round.results.length ? <div className="mt-3 flex flex-wrap items-end gap-2 rounded-md border border-[#d6e2e3] bg-[#f8fbfb] p-3"><Field label="เชื่อม EQA รอบนี้กับ IQC panel (ใช้คำนวณ Bias / Six Sigma)"><Select className="min-w-64" value={roundIqcPanelId} onChange={(event) => setRoundIqcPanelId(event.target.value)}><option value="">— ยังไม่เชื่อม —</option>{iqcPanels.map((panel) => <option key={panel.name} value={panel.id}>{panel.name} ({panel.count} รายการ)</option>)}</Select></Field><Button type="button" disabled={panelSaving} onClick={saveRoundIqcPanel}>{panelSaving ? 'กำลังบันทึก…' : 'บันทึกให้ทั้งรอบ'}</Button>{savedIqcPanel ? <span className="mb-2 inline-flex items-center rounded-full border border-[#b9e2c7] bg-[#effaf2] px-2 py-1 text-xs font-bold text-[#187746]">✓ เชื่อมแล้ว: {savedIqcPanel.name}</span> : <span className="mb-2 text-xs font-semibold text-[#9a6b16]">ยังไม่ได้เชื่อม</span>}<p className="max-w-md pb-2 text-[11px] text-[#789097]">Bias จะใช้กับทุก level ใน panel นี้; สำหรับ Viral load ระบบแปลงเฉพาะผลที่ส่งจาก Copies/mL เป็น log10 ส่วนค่าอ้างอิงจากผู้จัดให้กรอกเป็น log10</p></div> : null}
    {!editingResult && canAddResults ? <form onSubmit={saveResult} className="mt-3 grid items-end gap-2 md:grid-cols-4 xl:grid-cols-10"><Field label="รหัสตัวอย่าง"><Input value={resultForm.sampleCode} onChange={(event) => setResultForm({ ...resultForm, sampleCode: event.target.value })} required /></Field><Field label="รายการทดสอบ">{analyteOptions.length ? <Select value={resultForm.analyte} onChange={(event) => selectAnalyte(event.target.value)} required><option value="">— เลือกรายการทดสอบ —</option>{analyteOptions.map((analyte) => <option key={analyte} value={analyte}>{analyte}</option>)}</Select> : <Input value={resultForm.analyte} onChange={(event) => setResultForm({ ...resultForm, analyte: event.target.value })} required />}</Field><Field label="ผลที่ส่ง"><Input value={resultForm.submittedValue} onChange={(event) => setResultForm({ ...resultForm, submittedValue: event.target.value })} required /></Field><Field label="หน่วย"><Input value={resultForm.unit} onChange={(event) => setResultForm({ ...resultForm, unit: event.target.value })} /></Field><Field label="เชื่อม IQC panel"><Select value={resultForm.iqcAnalyteId} onChange={(event) => setResultForm({ ...resultForm, iqcAnalyteId: event.target.value })}><option value="">— ไม่ใช้ Six Sigma —</option>{iqcPanels.map((panel) => <option key={panel.name} value={panel.id}>{panel.name}</option>)}</Select></Field><Field label="Ct"><Input type="number" step="any" value={resultForm.ctValue} onChange={(event) => setResultForm({ ...resultForm, ctValue: event.target.value })} /></Field><div className="flex gap-1"><Button disabled={busy}>+ เพิ่มผลที่ส่ง</Button></div></form> : null}
    </div> : <StepLocked text="กรอกและบันทึกแบบรับตัวอย่างก่อน จึงจะบันทึกผลได้" />}
    {showSummary ? <div id={`eqa-round-${round.id}-summary`} className="mt-3 rounded-lg border border-[#d6e2e3] bg-[#f8fbfb] p-3"><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-sm font-bold text-[#315763]">3. บันทึกผลประเมินและสรุปผลอัตโนมัติ</p><p className="mt-0.5 text-xs text-[#789097]">acceptable ทุกตัวอย่าง = ผ่าน · warning หรือ unacceptable อย่างใดอย่างหนึ่ง = ไม่ผ่าน</p></div><StatusBadge tone={OUTCOME_TONE[round.summaryOutcome === 'pass' ? 'acceptable' : round.summaryOutcome === 'fail' ? 'unacceptable' : 'not-evaluated']} label={round.summaryOutcome === 'pass' ? 'ผ่านเกณฑ์' : round.summaryOutcome === 'fail' ? 'ไม่ผ่านเกณฑ์' : 'รอผลประเมิน'} /></div><div className="mt-3 grid gap-2 md:grid-cols-[200px_1fr_auto]"><Field label="สรุปผลรอบ (ระบบคำนวณ)"><Input value={round.summaryOutcome === 'pass' ? 'ผ่านเกณฑ์' : round.summaryOutcome === 'fail' ? 'ไม่ผ่านเกณฑ์' : 'ยังไม่ประเมิน'} readOnly /></Field><Field label="หมายเหตุ/การปรับปรุงแก้ไข"><Textarea rows={2} value={summaryNote} onChange={(event) => setSummaryNote(event.target.value)} /></Field><div className="flex items-end gap-2">{round.status === 'submitted' ? <Button className="self-end" disabled={confirmingEvaluation} onClick={confirmEvaluation}>บันทึกผลประเมินและสรุปผล</Button> : <><Button className="self-end" onClick={saveSummary}>บันทึกหมายเหตุ</Button><SavedFlash show={summarySaved} /></>}</div></div></div> : showResults ? <StepLocked text="ให้ผู้ทำการตรวจวิเคราะห์ลงนามรับรองผลที่ส่งก่อน จึงจะบันทึกผลประเมินและสรุปผลได้" /> : null}
    {showApproval ? <>
    {canAttachCertificate ? <div className="mt-3"><AttachmentList module="eqa" entityType="eqa-round" entityId={round.id} kind="eqa-certificate" canDelete={actor.role === 'Admin'} label="Certificate / รายงานผล" /></div> : null}
    <ApprovalPanel actor={actor} data={data} type="round-receipt" entityId={round.id} state={round.documentState} approvals={round.approvals} readiness={roundReceiptIssues(round)} analystId={round.analystId} lockedRoles={lockedApprovalRoles} onNavigate={onNavigate} onOk={onOk} onErr={onErr} />
    {!technicalManagerReady ? <StepLocked text="การลงนามของผู้จัดการวิชาการจะแสดงหลังบันทึกผลประเมินและสรุปผลรอบ" /> : null}
    </> : null}
    </> : null}
  </Card>
}

const RECEIPT_MISSING_RING = 'ring-2 ring-inset ring-[#eed4a6] border-[#eed4a6]'

function ReceiptEditor({ round, data, onOk, onErr }: { round: EqaRound; data: EqaWorkspace; onOk: Update; onErr: (text: string) => void }) {
  const [form, setForm] = useState({ planItemId: round.planItemId ?? '', externalSentDate: round.externalSentDate ?? '', sampleReceivedDate: round.sampleReceivedDate ?? '', packageCondition: round.packageCondition ?? '', packageNote: round.packageNote ?? '', receivedTemperature: round.receivedTemperature ?? '', receivedTemperatureNote: round.receivedTemperatureNote ?? '', sampleCondition: round.sampleCondition ?? '', sampleConditionNote: round.sampleConditionNote ?? '', storageCondition: round.storageCondition ?? '', storageTemperatureC: round.storageTemperatureC == null ? '' : String(round.storageTemperatureC), storageNote: round.storageNote ?? '', specimenType: round.specimenType ?? '', receiverId: round.receiverId ?? '', analystId: round.analystId ?? '', analysisDate: round.analysisDate ?? '', submissionDate: round.submissionDate ?? '', submissionMethod: round.submissionMethod ?? '', otherDetails: round.otherDetails ?? '' })
  const [busy, setBusy] = useState(false)
  const [saved, flashSaved] = useSavedFlash()
  const [movingPlanItem, setMovingPlanItem] = useState(false)
  const hasPlanItem = Boolean(round.planItemId)
  const showPlanItemSelect = !hasPlanItem || movingPlanItem

  // These are exactly the fields roundReceiptReadiness() (lib/eqa/rules.ts)
  // gates approval on -- rather than making them HTML `required` (which would
  // block saving a receipt that's filled in over several days), missing ones
  // just get an amber ring so the gap is visible without blocking the save.
  const missing = {
    externalSentDate: !form.externalSentDate, sampleReceivedDate: !form.sampleReceivedDate, packageCondition: !form.packageCondition,
    packageNote: form.packageCondition === 'unacceptable' && !form.packageNote, receivedTemperature: !form.receivedTemperature,
    receivedTemperatureNote: form.receivedTemperature === 'other' && !form.receivedTemperatureNote,
    sampleCondition: !form.sampleCondition, sampleConditionNote: form.sampleCondition === 'unacceptable' && !form.sampleConditionNote,
    storageCondition: !form.storageCondition, storageTemperatureC: form.storageCondition === 'refrigerated' && !form.storageTemperatureC,
    storageNote: form.storageCondition === 'other' && !form.storageNote, specimenType: !form.specimenType, receiverId: !form.receiverId,
    analystId: !form.analystId, analysisDate: !form.analysisDate, submissionDate: !form.submissionDate, submissionMethod: !form.submissionMethod,
  }
  const missingCount = (showPlanItemSelect && !form.planItemId ? 1 : 0) + Object.values(missing).filter(Boolean).length

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (showPlanItemSelect && !form.planItemId) return onErr('เลือกรายการในแผนรายปีก่อนบันทึก')
    setBusy(true)
    const body: Record<string, unknown> = {
      externalSentDate: form.externalSentDate || null, sampleReceivedDate: form.sampleReceivedDate || null, packageCondition: form.packageCondition || null, packageNote: form.packageNote || null,
      receivedTemperature: form.receivedTemperature || null, receivedTemperatureNote: form.receivedTemperatureNote || null, sampleCondition: form.sampleCondition || null, sampleConditionNote: form.sampleConditionNote || null,
      storageCondition: form.storageCondition || null, storageTemperatureC: form.storageTemperatureC ? Number(form.storageTemperatureC) : null, storageNote: form.storageNote || null, specimenType: form.specimenType || null,
      receiverId: form.receiverId || null, analystId: form.analystId || null, analysisDate: form.analysisDate || null, submissionDate: form.submissionDate || null, submissionMethod: form.submissionMethod || null, otherDetails: form.otherDetails || null,
    }
    if (showPlanItemSelect) body.planItemId = form.planItemId
    try { const result = await api<{ eqa: EqaWorkspace }>(`/api/eqa/rounds/${round.id}/receipt`, { method: 'PATCH', body: JSON.stringify(body) }); onOk('บันทึกแบบรับตัวอย่างแล้ว', result.eqa); setMovingPlanItem(false); flashSaved() }
    catch (error) { onErr(error instanceof Error ? error.message : 'บันทึกไม่สำเร็จ') } finally { setBusy(false) }
  }
  const allItems = data.annualPlans.flatMap((plan) => plan.items.map((item) => ({ ...item, planYear: plan.planYear })))
  return <form onSubmit={submit} className="mt-3 space-y-3 rounded-md border border-[#dce7e8] bg-[#fbfdfd] p-3">
    <div className="flex flex-wrap items-start justify-between gap-2 rounded-md border border-[#e3ebec] bg-white px-3 py-2"><div><p className="text-sm font-bold text-[#315763]">1. รับตัวอย่างและบันทึกข้อมูล</p><p className="mt-0.5 text-[11px] text-[#789097]">บันทึกได้หลายครั้งระหว่างรอข้อมูลครบ ระบบจะไฮไลต์ช่องที่ยังขาดให้</p></div>{missingCount ? <span className="text-xs font-semibold text-[#a9700f]">ยังกรอกไม่ครบ · ขาดอีก {missingCount} ช่อง</span> : <span className="text-xs font-semibold text-[#2f7d44]">ข้อมูลรับตัวอย่างครบแล้ว · ไปขั้นตอนลงผลได้</span>}
    </div>
    <p className="text-xs font-bold text-[#55727c]">ข้อมูลพัสดุและสภาพตัวอย่าง</p>
    <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
    {showPlanItemSelect ? (
      <Field label="รายการในแผนรายปี">
        <Select className={!form.planItemId ? RECEIPT_MISSING_RING : ''} value={form.planItemId} onChange={(event) => setForm({ ...form, planItemId: event.target.value })} required={!hasPlanItem}>
          <option value="">—</option>{allItems.map((item) => <option key={item.id} value={item.id}>{item.planYear + 543} · {item.sampleSetName}</option>)}
        </Select>
        {hasPlanItem ? <Button type="button" variant="ghost" className="mt-1 min-h-7 px-2 py-1 text-xs" onClick={() => { setMovingPlanItem(false); setForm({ ...form, planItemId: round.planItemId ?? '' }) }}>ยกเลิกการย้าย</Button> : null}
      </Field>
    ) : (
      <Field label="รายการในแผนรายปี">
        <p className="rounded-md border border-[#e3ebec] bg-[#f6f8f9] px-3 py-2 text-sm text-[#173d50]">{round.planYear ? round.planYear + 543 : '-'} · {round.planItemName ?? '-'}</p>
        <Button type="button" variant="ghost" className="mt-1 min-h-7 px-2 py-1 text-xs" onClick={() => setMovingPlanItem(true)}>ย้ายรายการแผน</Button>
      </Field>
    )}
    <Field label="วันที่องค์กรส่ง"><Input className={missing.externalSentDate ? RECEIPT_MISSING_RING : ''} type="date" value={form.externalSentDate} onChange={(event) => setForm({ ...form, externalSentDate: event.target.value })} /></Field>
    <Field label="วันที่รับตัวอย่าง"><Input className={missing.sampleReceivedDate ? RECEIPT_MISSING_RING : ''} type="date" value={form.sampleReceivedDate} onChange={(event) => setForm({ ...form, sampleReceivedDate: event.target.value })} /></Field>
    <Field label="สภาพห่อ"><Select className={missing.packageCondition ? RECEIPT_MISSING_RING : ''} value={form.packageCondition} onChange={(event) => setForm({ ...form, packageCondition: event.target.value })}><option value="">—</option><option value="acceptable">เรียบร้อย</option><option value="unacceptable">ไม่เรียบร้อย</option></Select></Field>
    <Field label="รายละเอียดสภาพห่อ" hint={form.packageCondition === 'unacceptable' ? 'จำเป็นเมื่อเลือกไม่เรียบร้อย' : undefined}><Input className={missing.packageNote ? RECEIPT_MISSING_RING : ''} value={form.packageNote} onChange={(event) => setForm({ ...form, packageNote: event.target.value })} /></Field>
    <Field label="อุณหภูมิขณะรับ"><Select className={missing.receivedTemperature ? RECEIPT_MISSING_RING : ''} value={form.receivedTemperature} onChange={(event) => setForm({ ...form, receivedTemperature: event.target.value })}><option value="">—</option><option value="refrigerated">แช่เย็น</option><option value="room">อุณหภูมิห้อง</option><option value="other">อื่นๆ</option></Select></Field>
    <Field label="รายละเอียดอุณหภูมิ" hint={form.receivedTemperature === 'other' ? 'จำเป็นเมื่อเลือกอื่นๆ' : undefined}><Input className={missing.receivedTemperatureNote ? RECEIPT_MISSING_RING : ''} value={form.receivedTemperatureNote} onChange={(event) => setForm({ ...form, receivedTemperatureNote: event.target.value })} /></Field>
    <Field label="สภาพตัวอย่าง"><Select className={missing.sampleCondition ? RECEIPT_MISSING_RING : ''} value={form.sampleCondition} onChange={(event) => setForm({ ...form, sampleCondition: event.target.value })}><option value="">—</option><option value="acceptable">เรียบร้อย</option><option value="unacceptable">ไม่เรียบร้อย</option></Select></Field>
    <Field label="รายละเอียดสภาพตัวอย่าง" hint={form.sampleCondition === 'unacceptable' ? 'จำเป็นเมื่อเลือกไม่เรียบร้อย' : undefined}><Input className={missing.sampleConditionNote ? RECEIPT_MISSING_RING : ''} value={form.sampleConditionNote} onChange={(event) => setForm({ ...form, sampleConditionNote: event.target.value })} /></Field>
    <div className="xl:col-span-2">
      <span className="mb-1 block text-xs font-semibold text-[#58747d]">ระบุการเก็บตัวอย่าง</span>
      <div className={`flex min-h-10 flex-wrap items-center gap-x-5 gap-y-2 rounded-md border bg-white px-3 py-2 text-sm text-[#173d50] ${missing.storageCondition ? RECEIPT_MISSING_RING : 'border-[#cfdee0]'}`}>
        <label className="inline-flex flex-wrap items-center gap-2">
          <input type="checkbox" checked={form.storageCondition === 'refrigerated'} onChange={() => setForm({ ...form, storageCondition: form.storageCondition === 'refrigerated' ? '' : 'refrigerated' })} className="size-4 accent-[#0b7f76]" />
          <span>แช่เย็นที่อุณหภูมิ</span>
          <Input type="number" step="any" aria-label="อุณหภูมิที่เก็บตัวอย่าง" value={form.storageTemperatureC} onChange={(event) => setForm({ ...form, storageTemperatureC: event.target.value })} className={`w-24 px-2 py-1 ${missing.storageTemperatureC ? RECEIPT_MISSING_RING : ''}`} />
          <span>°C</span>
        </label>
        <label className="inline-flex items-center gap-2">
          <input type="checkbox" checked={form.storageCondition === 'room'} onChange={() => setForm({ ...form, storageCondition: form.storageCondition === 'room' ? '' : 'room' })} className="size-4 accent-[#0b7f76]" />
          <span>เก็บที่อุณหภูมิห้อง</span>
        </label>
        <label className="inline-flex flex-wrap items-center gap-2">
          <input type="checkbox" checked={form.storageCondition === 'other'} onChange={() => setForm({ ...form, storageCondition: form.storageCondition === 'other' ? '' : 'other' })} className="size-4 accent-[#0b7f76]" />
          <span>อื่นๆ</span>
          {form.storageCondition === 'other' ? <Input aria-label="รายละเอียดการเก็บตัวอย่างแบบอื่นๆ" value={form.storageNote} onChange={(event) => setForm({ ...form, storageNote: event.target.value })} className={`w-40 px-2 py-1 ${missing.storageNote ? RECEIPT_MISSING_RING : ''}`} /> : null}
        </label>
      </div>
    </div>
    <div className="md:col-span-2 xl:col-span-4 border-t border-[#e3ebec] pt-2"><p className="text-xs font-bold text-[#55727c]">ผู้รับผิดชอบและการส่งผล</p></div>
    <Field label="ชนิดตัวอย่าง"><Input className={missing.specimenType ? RECEIPT_MISSING_RING : ''} value={form.specimenType} onChange={(event) => setForm({ ...form, specimenType: event.target.value })} /></Field>
    <Field label="ผู้รับตัวอย่าง"><UserSelect className={missing.receiverId ? RECEIPT_MISSING_RING : ''} users={data.users} value={form.receiverId} onChange={(value) => setForm({ ...form, receiverId: value })} /></Field>
    <Field label="ผู้ตรวจวิเคราะห์"><UserSelect className={missing.analystId ? RECEIPT_MISSING_RING : ''} users={data.users} value={form.analystId} onChange={(value) => setForm({ ...form, analystId: value })} /></Field>
    <Field label="วันที่ตรวจวิเคราะห์"><Input className={missing.analysisDate ? RECEIPT_MISSING_RING : ''} type="date" value={form.analysisDate} onChange={(event) => setForm({ ...form, analysisDate: event.target.value })} /></Field>
    <Field label="วันที่ส่งผล"><Input className={missing.submissionDate ? RECEIPT_MISSING_RING : ''} type="date" value={form.submissionDate} onChange={(event) => setForm({ ...form, submissionDate: event.target.value })} /></Field>
    <Field label="วิธีส่งผล"><Input className={missing.submissionMethod ? RECEIPT_MISSING_RING : ''} value={form.submissionMethod} onChange={(event) => setForm({ ...form, submissionMethod: event.target.value })} /></Field>
  </div><Field label="รายละเอียดอื่นๆ"><Textarea rows={2} value={form.otherDetails} onChange={(event) => setForm({ ...form, otherDetails: event.target.value })} /></Field><div className="flex items-center gap-2"><Button disabled={busy}>บันทึกแบบรับตัวอย่าง</Button><SavedFlash show={saved} /></div></form>
}
