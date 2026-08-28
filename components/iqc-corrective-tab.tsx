'use client'

import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, ClipboardList, Trash2 } from 'lucide-react'
import type { BmActor } from '@/lib/bm/types'
import type { IqcCorrectiveAction, IqcRun, IqcRunResult, IqcWorkspace } from '@/lib/iqc/types'
import { findCorrectiveActionForPoint } from '@/lib/iqc/corrective-actions'
import {
  hasStructuredCorrectiveDetails,
  type CorrectiveActionDraft,
} from '@/lib/corrective-actions'
import { formatDate, formatDateTime } from '@/lib/bm/rules'
import { api, Button, Card, Input, Notice, Select, StatusBadge } from '@/components/ui'
import { AttachmentList } from '@/components/attachments'
import { CorrectiveActionForm, type CorrectiveActionSubmitIntent } from '@/components/corrective-action-form'

type IqcCorrectiveActionFilter = 'active' | 'open' | 'awaiting-effectiveness' | 'closed' | 'all'

export type IqcCorrectiveContext = {
  runId: string
  resultId?: string | null
  analyteId?: string | null
  controlLotId?: string | null
}

type IqcCorrectiveTabProps = {
  data: IqcWorkspace
  actor: BmActor
  onOk: (text: string, next: IqcWorkspace) => void
  onErr: (text: string) => void
  focusId?: string | null
  initialContext?: IqcCorrectiveContext | null
}

function draftFromAction(action: IqcCorrectiveAction): Partial<CorrectiveActionDraft> {
  return {
    problem: action.problem,
    issueTypes: action.issueTypes ?? [],
    probableErrorType: action.probableErrorType ?? 'unknown',
    probableErrorNote: action.probableErrorNote ?? '',
    reviewFindings: action.reviewFindings,
    rootCause: action.rootCause ?? '',
    actionTypes: action.actionTypes ?? [],
    actionTaken: action.actionTaken ?? '',
    correctionOutcome: action.correctionOutcome ?? '',
    correctionOutcomeNote: action.correctionOutcomeNote ?? '',
    preventiveAction: action.preventiveAction ?? '',
    ownerId: action.ownerId ?? '',
    dueDate: action.dueDate ?? '',
  }
}

function draftPayload(value: CorrectiveActionDraft) {
  return {
    problem: value.problem,
    issueTypes: value.issueTypes,
    probableErrorType: value.probableErrorType,
    probableErrorNote: value.probableErrorNote || null,
    reviewFindings: value.reviewFindings,
    rootCause: value.rootCause || null,
    actionTypes: value.actionTypes,
    actionTaken: value.actionTaken || null,
    correctionOutcome: value.correctionOutcome || null,
    correctionOutcomeNote: value.correctionOutcomeNote || null,
    preventiveAction: value.preventiveAction || null,
    ownerId: value.ownerId || null,
    dueDate: value.dueDate || null,
  }
}

function flaggedOf(run: IqcRun) {
  return run.results.filter((result) => !result.isVoided && ['warning', 'investigate', 'rejected'].includes(result.status))
}

function flaggedWithoutCorrectiveAction(run: IqcRun, actions: IqcCorrectiveAction[]) {
  return flaggedOf(run).filter((result) => !findCorrectiveActionForPoint(actions, run.id, result.analyteId, result.resultId))
}

function qcTone(status: IqcRunResult['status']) {
  if (status === 'rejected') return 'rejected' as const
  if (status === 'investigate') return 'investigate' as const
  if (status === 'warning') return 'warning' as const
  if (status === 'not_evaluated') return 'not_evaluated' as const
  return 'accepted' as const
}

function qcLabel(status: IqcRunResult['status']) {
  return status === 'rejected' ? 'Rejected' : status === 'investigate' ? 'ต้องตรวจสอบ' : status === 'warning' ? 'Warning' : status === 'not_evaluated' ? 'ยังไม่ประเมิน' : 'Accepted'
}

function resultText(result: IqcRunResult) {
  const value = result.numericValue ?? result.qualitativeValue ?? '-'
  return `${result.analyteCode} · ${value}${result.z == null ? '' : ` · z ${result.z.toFixed(2)}`}`
}

function contextSummary(
  run: IqcRun | null,
  result: IqcRunResult | null,
  controlLotLabel: string,
  linked: IqcCorrectiveAction | null,
  availableResults?: IqcRunResult[],
) {
  return (
    <div className="space-y-1 px-1 text-xs text-[#55727c]">
      {run ? <p>Run: <span className="font-semibold text-[#173d50]">{formatDateTime(run.runDatetime)}</span>{run.instrumentName ? ` · ${run.instrumentName}` : ''}</p> : <p className="text-[#9aafb4]">เลือก Run เพื่อโหลดบริบท</p>}
      {result ? <p>ผลที่เกี่ยวข้อง: <span className="font-semibold text-[#173d50]">{result.analyteName} · {controlLotLabel || result.controlLotId}</span> · {resultText(result)} <StatusBadge tone={qcTone(result.status)} label={qcLabel(result.status)} /></p> : null}
      {!result && run ? <p>ผลผิดปกติใน Run: <span className="font-semibold text-[#173d50]">{(availableResults ?? flaggedOf(run)).map(resultText).join(' | ') || 'ไม่มีผลที่ถูก flag'}</span></p> : null}
      {linked ? <p className="font-semibold text-[#a9700f]">มี Corrective Action เดิมสำหรับบริบทนี้แล้ว</p> : null}
    </div>
  )
}

function suggestedIssues(result: IqcRunResult | null, run: IqcRun | null) {
  const source = result ? [result] : run ? flaggedOf(run) : []
  const suggestions = new Set<string>()
  for (const item of source) {
    if (['warning', 'investigate', 'rejected'].includes(item.status)) suggestions.add('result-out-of-control')
    if (item.z != null && item.z <= -2) suggestions.add('below-minus-2sd')
    if (item.z != null && item.z >= 2) suggestions.add('above-plus-2sd')
    if (item.violatedRules.length) suggestions.add('westgard-rule')
  }
  return [...suggestions]
}

function summarizeResults(results: IqcRun['results'], controlLotLabels: Map<string, string>, includeRules: boolean) {
  const grouped = new Map<string, string[]>()
  for (const result of results.filter((item) => !item.isVoided)) {
    const rules = includeRules && result.violatedRules.length ? ` ${result.violatedRules.join('/')}` : ''
    grouped.set(result.controlLotId, [...(grouped.get(result.controlLotId) ?? []), `${result.analyteCode}${rules}`])
  }
  return [...grouped.entries()].map(([lotId, analytes]) => `${controlLotLabels.get(lotId) ?? 'Control'} · ${analytes.join(', ')}`).join(' | ')
}

export function StructuredCorrectiveTab({ data, actor, onOk, onErr, focusId, initialContext }: IqcCorrectiveTabProps) {
  const [runId, setRunId] = useState(initialContext?.runId ?? '')
  const [resultId, setResultId] = useState(initialContext?.resultId ?? '')
  const [showAllRuns, setShowAllRuns] = useState(false)
  const [createVersion, setCreateVersion] = useState(0)
  const [localFocusId, setLocalFocusId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [actionFilter, setActionFilter] = useState<IqcCorrectiveActionFilter>('active')
  const [query, setQuery] = useState('')
  const [expandedActionIds, setExpandedActionIds] = useState<Set<string>>(new Set())
  const [visibleActionCount, setVisibleActionCount] = useState(20)
  const [editingActionId, setEditingActionId] = useState<string | null>(null)
  const [focusFilterOverride, setFocusFilterOverride] = useState(Boolean(focusId))

  const controlLotLabels = useMemo(() => new Map(data.controlLots.map((lot) => [lot.id, `${lot.controlMaterialName}${lot.level ? ` ${lot.level}` : ''} · ${lot.lotNumber}`])), [data.controlLots])
  const runById = useMemo(() => new Map(data.runs.map((run) => [run.id, run])), [data.runs])
  const directContextLocked = Boolean(initialContext?.resultId)
  const rawSelectedRun = data.runs.find((run) => run.id === runId) ?? null
  const rawSelectedRunHasClosedOnlyFlags = Boolean(
    rawSelectedRun
    && flaggedOf(rawSelectedRun).length > 0
    && flaggedWithoutCorrectiveAction(rawSelectedRun, data.correctiveActions).length === 0,
  )
  const effectiveRunId = rawSelectedRunHasClosedOnlyFlags && !directContextLocked ? '' : runId
  const effectiveResultId = effectiveRunId === runId ? resultId : ''
  const selectedRun = data.runs.find((run) => run.id === effectiveRunId) ?? null
  const selectedResult = selectedRun?.results.find((result) => result.resultId === effectiveResultId) ?? null
  const selectedAnalyteId = selectedResult?.analyteId ?? initialContext?.analyteId ?? null
  const selectedControlLotId = selectedResult?.controlLotId ?? initialContext?.controlLotId ?? null
  const contextAction = data.correctiveActions.find((action) => action.resultId && action.resultId === effectiveResultId)
    ?? data.correctiveActions.find((action) => action.runId === effectiveRunId && !action.resultId && action.analyteId === selectedAnalyteId)
    ?? data.correctiveActions.find((action) => action.runId === effectiveRunId && !action.resultId && action.analyteId === null)
    ?? null
  const effectiveFocusId = focusId ?? localFocusId

  const actionableFlaggedRuns = useMemo(
    () => data.runs.filter((run) => flaggedWithoutCorrectiveAction(run, data.correctiveActions).length > 0),
    [data.correctiveActions, data.runs],
  )
  const selectableRuns = useMemo(
    () => data.runs.filter((run) => flaggedOf(run).length === 0 || flaggedWithoutCorrectiveAction(run, data.correctiveActions).length > 0),
    [data.correctiveActions, data.runs],
  )
  const selectableResults = selectedRun
    ? flaggedOf(selectedRun).length > 0
      ? flaggedWithoutCorrectiveAction(selectedRun, data.correctiveActions)
      : selectedRun.results.filter((result) => !result.isVoided)
    : []
  const resultOptions = directContextLocked && selectedResult && !selectableResults.some((result) => result.resultId === selectedResult.resultId)
    ? [selectedResult, ...selectableResults]
    : selectableResults
  const runOptions = showAllRuns
    ? selectableRuns
    : [
        ...(selectedRun && (!rawSelectedRunHasClosedOnlyFlags || directContextLocked) && !actionableFlaggedRuns.some((run) => run.id === selectedRun.id) ? [selectedRun] : []),
        ...actionableFlaggedRuns,
      ]
  const actionCounts = useMemo(() => ({
    open: data.correctiveActions.filter((action) => action.status === 'open').length,
    awaitingEffectiveness: data.correctiveActions.filter((action) => action.status === 'awaiting-effectiveness').length,
    closed: data.correctiveActions.filter((action) => action.status === 'closed').length,
  }), [data.correctiveActions])
  const focusedAction = useMemo(
    () => (focusId ? data.correctiveActions.find((action) => action.id === focusId) ?? null : null),
    [data.correctiveActions, focusId],
  )
  const showingFocusedHistory = Boolean(
    focusFilterOverride
    && focusId
    && actionFilter === 'active'
    && focusedAction?.status === 'closed',
  )
  const filteredActions = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase()
    return data.correctiveActions.filter((action) => {
      const statusMatches = showingFocusedHistory
        ? action.id === focusId
        : actionFilter === 'all'
          || (actionFilter === 'active' && action.status !== 'closed')
          || action.status === actionFilter
      const run = runById.get(action.runId)
      const result = action.resultId ? run?.results.find((item) => item.resultId === action.resultId) : null
      const textMatches = !normalizedQuery || [action.problem, action.analyteName, action.ownerName, action.createdByName, result?.analyteName, result?.analyteCode]
        .filter((value): value is string => Boolean(value))
        .some((value) => value.toLocaleLowerCase().includes(normalizedQuery))
      return statusMatches && textMatches
    })
  }, [actionFilter, data.correctiveActions, focusId, query, runById, showingFocusedHistory])
  const focusedActionIndex = effectiveFocusId ? filteredActions.findIndex((action) => action.id === effectiveFocusId) : -1
  const visibleActions = filteredActions.slice(0, Math.max(visibleActionCount, focusedActionIndex + 1))

  useEffect(() => {
    if (!effectiveFocusId) return
    document.getElementById(`iqc-corrective-action-${effectiveFocusId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [effectiveFocusId, data.correctiveActions])

  const systemSignals = selectedResult ? [
    `Status จากระบบ: ${qcLabel(selectedResult.status)}`,
    `ผล: ${selectedResult.numericValue ?? selectedResult.qualitativeValue ?? '-'} · z-score: ${selectedResult.z == null ? '-' : selectedResult.z.toFixed(2)}`,
    selectedResult.violatedRules.length ? `Westgard rule: ${selectedResult.violatedRules.join(', ')}` : 'ระบบไม่พบ Westgard rule ที่ถูกแจ้ง',
  ] : selectedRun ? [`ผลที่ถูก flag ใน Run นี้: ${flaggedOf(selectedRun).length} รายการ`, summarizeResults(flaggedOf(selectedRun), controlLotLabels, true) || 'ไม่มีผลที่ถูก flag'] : []
  const suggestedIssueTypes = suggestedIssues(selectedResult, selectedRun)
  const suggestedProblem = selectedResult
    ? `IQC ${selectedResult.analyteName} ผล ${selectedResult.numericValue ?? selectedResult.qualitativeValue ?? '-'} ถูกจัดเป็น ${qcLabel(selectedResult.status)}${selectedResult.violatedRules.length ? ` (${selectedResult.violatedRules.join(', ')})` : ''}`
    : selectedRun && flaggedOf(selectedRun).length ? `IQC Run วันที่ ${formatDateTime(selectedRun.runDatetime)} พบผลผิดปกติ ${flaggedOf(selectedRun).length} รายการ` : ''

  function runOptionLabel(run: IqcRun) {
    const flags = flaggedWithoutCorrectiveAction(run, data.correctiveActions)
    const hasFlaggedResults = flaggedOf(run).length > 0
    const summary = flags.length
      ? summarizeResults(flags, controlLotLabels, true)
      : hasFlaggedResults
        ? 'มี Corrective Action แล้ว'
        : summarizeResults(run.results, controlLotLabels, false)
    return `${formatDateTime(run.runDatetime)}${run.instrumentName ? ` · ${run.instrumentName}` : ''}${summary ? ` · ${summary}` : ''}`
  }

  async function create(value: CorrectiveActionDraft) {
    if (!effectiveRunId) return onErr('เลือก Run ก่อนบันทึก')
    if (contextAction) return onErr('บริบทนี้มี Corrective Action แล้ว ให้เปิดรายการเดิมเพื่อแก้ไข')
    setBusy(true)
    try {
      const result = await api<{ iqc: IqcWorkspace }>('/api/iqc/corrective-actions', {
        method: 'POST',
        body: JSON.stringify({ runId: effectiveRunId, resultId: effectiveResultId || null, analyteId: selectedAnalyteId, relatedConsumableId: null, ...draftPayload(value) }),
      })
      const created = result.iqc.correctiveActions.find((action) => effectiveResultId ? action.resultId === effectiveResultId : action.runId === effectiveRunId && !action.resultId && action.analyteId === selectedAnalyteId)
        ?? (effectiveResultId ? result.iqc.correctiveActions.find((action) => action.runId === effectiveRunId && !action.resultId && (action.analyteId === selectedAnalyteId || action.analyteId === null)) : null)
        ?? null
      onOk('เปิด Corrective Action แล้ว', result.iqc)
      if (created) {
        setLocalFocusId(created.id)
        setExpandedActionIds((ids) => new Set(ids).add(created.id))
      }
      if (!directContextLocked) {
        setRunId('')
        setResultId('')
        setCreateVersion((version) => version + 1)
      }
    } catch (error) { onErr(error instanceof Error ? error.message : 'บันทึกไม่สำเร็จ') } finally { setBusy(false) }
  }

  async function close(id: string, body: Record<string, unknown> = {}) {
    setBusy(true)
    try {
      const result = await api<{ iqc: IqcWorkspace }>(`/api/iqc/corrective-actions/${id}/close`, { method: 'POST', body: JSON.stringify(body) })
      onOk(body.effectivenessOutcome ? (body.effectivenessOutcome === 'effective' ? 'ยืนยันผลการแก้ไขแล้ว และปิด CAPA' : 'บันทึกว่า ineffective และเปิด CAPA ต่อ') : 'ส่ง CAPA เพื่อรอยืนยันผลการแก้ไขแล้ว', result.iqc)
      setEditingActionId(null)
    } catch (error) { onErr(error instanceof Error ? error.message : 'ปิดไม่สำเร็จ') } finally { setBusy(false) }
  }

  async function saveEditing(action: IqcCorrectiveAction, value: CorrectiveActionDraft, intent: CorrectiveActionSubmitIntent) {
    setBusy(true)
    try {
      const body = draftPayload(value)
      if (intent === 'complete') {
        const result = await api<{ iqc: IqcWorkspace }>(`/api/iqc/corrective-actions/${action.id}/close`, { method: 'POST', body: JSON.stringify(body) })
        onOk('ส่ง CAPA เพื่อรอยืนยันผลการแก้ไขแล้ว', result.iqc)
        setEditingActionId(null)
      } else {
        const result = await api<{ iqc: IqcWorkspace }>(`/api/iqc/corrective-actions/${action.id}`, { method: 'PATCH', body: JSON.stringify(body) })
        onOk('แก้ไข corrective action แล้ว', result.iqc)
      }
    } catch (error) { onErr(error instanceof Error ? error.message : 'บันทึกการแก้ไขไม่สำเร็จ') } finally { setBusy(false) }
  }

  function startEditing(action: IqcCorrectiveAction) {
    setEditingActionId(action.id)
    setExpandedActionIds((ids) => new Set(ids).add(action.id))
  }

  async function closeAction(action: IqcCorrectiveAction) {
    if (!hasStructuredCorrectiveDetails(draftFromAction(action), 'iqc')) {
      startEditing(action)
      onErr('กรอก Root cause, Action taken และข้อมูลโครงสร้างให้ครบก่อนปิด')
      return
    }
    await close(action.id)
  }

  async function verify(id: string) {
    const action = data.correctiveActions.find((item) => item.id === id)
    if (action && !hasStructuredCorrectiveDetails(draftFromAction(action), 'iqc')) {
      startEditing(action)
      onErr('กรอกข้อมูล Corrective Action ให้ครบก่อนยืนยันผลการแก้ไข')
      return
    }
    const effective = window.confirm('ยืนยันว่าการแก้ไขนี้มีประสิทธิผลหรือไม่?\nกด OK = effective, Cancel = ineffective')
    const note = window.prompt('บันทึกผลการยืนยันการแก้ไข:')
    if (!note?.trim()) return
    await close(id, { effectivenessOutcome: effective ? 'effective' : 'ineffective', effectivenessNote: note.trim() })
  }

  async function remove(id: string) {
    if (!window.confirm('ลบ Corrective action นี้ใช่ไหม?\n\nรายการและไฟล์แนบทั้งหมดจะถูกลบถาวร')) return
    setBusy(true)
    try {
      const result = await api<{ iqc: IqcWorkspace }>(`/api/iqc/corrective-actions/${id}`, { method: 'DELETE' })
      setExpandedActionIds((ids) => { const next = new Set(ids); next.delete(id); return next })
      onOk('ลบ corrective action แล้ว', result.iqc)
    } catch (error) { onErr(error instanceof Error ? error.message : 'ลบ corrective action ไม่สำเร็จ') } finally { setBusy(false) }
  }

  function toggleExpanded(id: string) {
    setExpandedActionIds((ids) => { const next = new Set(ids); if (next.has(id)) next.delete(id); else next.add(id); return next })
  }

  function selectActionFilter(value: IqcCorrectiveActionFilter) { setFocusFilterOverride(false); setActionFilter(value); setVisibleActionCount(20) }
  function updateQuery(value: string) { setQuery(value); setVisibleActionCount(20) }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(340px,440px)_minmax(0,1fr)]">
      <div className="lg:col-span-2 px-1">
        <p className="text-xs font-bold text-[#0b7f76]">ขั้นตอนที่ 3 · ทบทวนผลผิดปกติและจัดทำ Corrective Action</p>
        <p className="mt-1 text-sm text-[#6a838c]">เริ่มจากจุดผิดปกติในกราฟ IQC ระบบเติมบริบทให้ แล้วบันทึกการสอบทวน สาเหตุ การแก้ไข และการป้องกันเกิดซ้ำ</p>
      </div>
      <CorrectiveActionForm
        key={`iqc-create-${createVersion}-${effectiveRunId}-${effectiveResultId}`}
        idPrefix="iqc-corrective-create"
        module="iqc"
        mode="create"
        context={<div className="space-y-2 rounded-md border border-[#dce7e8] bg-white p-3">
          <label className="block text-xs font-semibold text-[#58747d]">Run ที่พบปัญหา
            <Select value={effectiveRunId} onChange={(event) => { setRunId(event.target.value); setResultId('') }} required disabled={directContextLocked}>
              <option value="">— เลือก Run —</option>
              {runOptions.map((run) => <option key={run.id} value={run.id}>{runOptionLabel(run)}</option>)}
            </Select>
          </label>
          <label className="flex min-h-11 items-center gap-2 text-xs text-[#58747d]"><input type="checkbox" checked={showAllRuns} onChange={(event) => setShowAllRuns(event.target.checked)} disabled={directContextLocked} /> แสดงทุก Run (รวมที่ปกติ)</label>
              {selectedRun?.results.length ? <label className="block text-xs font-semibold text-[#58747d]">ผลจาก Run ที่เกี่ยวข้อง (ถ้ามี)
                <Select value={effectiveResultId} onChange={(event) => setResultId(event.target.value)} disabled={directContextLocked}>
                  <option value="">— ทั้ง Run —</option>
                  {resultOptions.map((result) => <option key={result.resultId ?? `${result.analyteId}-${result.controlLotId}`} value={result.resultId ?? ''}>{resultText(result)} · {qcLabel(result.status)}</option>)}
                </Select>
          </label> : null}
          {contextSummary(selectedRun, selectedResult, selectedControlLotId ? controlLotLabels.get(selectedControlLotId) ?? selectedControlLotId : '', contextAction, selectableResults)}
        </div>}
        systemSignals={systemSignals}
        suggestedIssueTypes={suggestedIssueTypes}
        initialValue={{ problem: suggestedProblem }}
        ownerOptions={data.assignableUsers}
        busy={busy}
        onSubmit={create}
      />
      <div className="space-y-3">
        <Card className="space-y-3 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-bold text-[#173d50]">รายการ Corrective Action (CAPA)</h2>
              <p className="mt-0.5 text-xs text-[#789097]">แสดง {visibleActions.length} จาก {filteredActions.length} รายการที่ตรงเงื่อนไข · กดรายการเพื่อดูรายละเอียดและไฟล์แนบ</p>
            </div>
            <div className="flex flex-wrap gap-1">
              {([
                ['active', `กำลังดำเนินการ ${actionCounts.open + actionCounts.awaitingEffectiveness}`],
                ['open', `Open ${actionCounts.open}`],
                ['awaiting-effectiveness', `รอยืนยันผลการแก้ไข ${actionCounts.awaitingEffectiveness}`],
                ['closed', `Closed ${actionCounts.closed}`],
                ['all', `ทั้งหมด ${data.correctiveActions.length}`],
              ] as [IqcCorrectiveActionFilter, string][]).map(([value, label]) => <button key={value} type="button" aria-pressed={!showingFocusedHistory && actionFilter === value} onClick={() => selectActionFilter(value)} className={`rounded-full border px-2.5 py-1 text-[11px] font-bold transition focus-visible:ring-2 focus-visible:ring-[#0b7f76] focus-visible:outline-none ${!showingFocusedHistory && actionFilter === value ? 'border-[#0b7f76] bg-[#e6f5f2] text-[#08766e]' : 'border-[#d6e2e3] bg-white text-[#58747d] hover:bg-[#f3f9f9]'}`}>{label}</button>)}
            </div>
          </div>
          <Input value={query} onChange={(event) => updateQuery(event.target.value)} placeholder="ค้นหาปัญหา, analyte, ผู้รับผิดชอบ หรือผู้บันทึก" aria-label="ค้นหา corrective action" />
        </Card>
        {visibleActions.map((action) => {
          const isExpanded = action.id === effectiveFocusId || expandedActionIds.has(action.id)
          const isLegacy = !hasStructuredCorrectiveDetails(draftFromAction(action), 'iqc')
          const needsCompletion = action.status !== 'closed' && isLegacy
          const run = runById.get(action.runId) ?? null
          const result = action.resultId ? run?.results.find((item) => item.resultId === action.resultId) ?? null : null
          return <div key={action.id} id={`iqc-corrective-action-${action.id}`}>
            <Card className="overflow-hidden">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <button type="button" onClick={() => toggleExpanded(action.id)} aria-expanded={isExpanded} className="min-w-0 flex-1 p-4 text-left focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#0b7f76] focus-visible:outline-none">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-[#315763]">{formatDateTime(action.runDatetime)}</span>
                    <StatusBadge tone={action.status === 'closed' ? 'accepted' : action.status === 'awaiting-effectiveness' ? 'warning' : 'investigate'} label={action.status} />
                    {isLegacy ? <span className="rounded-full border border-[#eed4a6] bg-[#fff9ed] px-2 py-0.5 text-[10px] font-bold text-[#a9700f]">{action.status === 'closed' ? 'ข้อมูลเดิม' : 'ต้องเติมข้อมูลก่อนดำเนินการต่อ'}</span> : null}
                    <ChevronDown className={`size-4 shrink-0 text-[#789097] transition-transform ${isExpanded ? 'rotate-180' : ''}`} aria-hidden="true" />
                  </div>
                  <p className="mt-1 truncate text-xs font-semibold text-[#58747d]">{result ? `${result.analyteName} · ${controlLotLabels.get(result.controlLotId) ?? result.controlLotId}` : action.analyteName ?? 'ทั้ง Run'}</p>
                  <p className="mt-1 truncate text-sm text-[#3f5c64]">{action.problem}</p>
                  <p className="mt-1 text-[11px] text-[#9aafb4]">โดย {action.createdByName ?? '-'}{action.ownerName ? ` · ผู้รับผิดชอบ ${action.ownerName}` : ''}{action.dueDate ? ` · Due ${formatDate(action.dueDate)}` : ''}</p>
                </button>
                <div className="flex shrink-0 items-center gap-1 p-3">
                  {action.status === 'open' ? <Button variant="secondary" className="min-h-8 px-3 py-1.5 text-xs" disabled={busy} onClick={() => void closeAction(action)}>{needsCompletion ? 'กรอกให้ครบก่อนปิด' : 'ส่งตรวจผล'}</Button> : null}
                  {action.status === 'awaiting-effectiveness' ? <Button variant="secondary" className="min-h-8 px-3 py-1.5 text-xs" disabled={busy} onClick={() => void verify(action.id)}>{needsCompletion ? 'กรอกให้ครบก่อนยืนยัน' : 'ยืนยันผลการแก้ไข'}</Button> : null}
                  <Button variant="danger" className="min-h-8 px-2 py-1.5" disabled={busy} onClick={() => void remove(action.id)} aria-label={`ลบ corrective action ${action.problem}`}><Trash2 className="size-3.5" /></Button>
                </div>
              </div>
              {isExpanded ? <div className="border-t border-[#e8efef] px-4 pb-4 pt-3">
                {editingActionId === action.id ? <CorrectiveActionForm
                  key={`iqc-edit-${action.id}`}
                  idPrefix={`iqc-corrective-edit-${action.id}`}
                  module="iqc"
                  mode="edit"
                  context={contextSummary(run, result, result ? controlLotLabels.get(result.controlLotId) ?? result.controlLotId : '', action)}
                  systemSignals={result ? [`Status จากระบบ: ${qcLabel(result.status)}`, result.violatedRules.length ? `Westgard rule: ${result.violatedRules.join(', ')}` : 'ระบบไม่พบ Westgard rule ที่ถูกแจ้ง'] : []}
                  ownerOptions={data.assignableUsers}
                  initialValue={draftFromAction(action)}
                  busy={busy}
                  onSubmit={(value, intent) => saveEditing(action, value, intent)}
                  onCancel={() => setEditingActionId(null)}
                /> : <>
                  {needsCompletion ? <Notice tone="warning">ข้อมูลเดิมยังไม่ครบ กรุณากรอก Root cause, Action taken, checklist, ผลการแก้ไข และแนวทางป้องกันก่อนปิด</Notice> : null}
                  {action.rootCause ? <p className="mt-2 text-xs text-[#789097]">Root cause: {action.rootCause}</p> : null}
                  {action.actionTypes?.length ? <p className="text-xs text-[#789097]">Action type: {action.actionTypes.join(', ')}</p> : null}
                  {action.actionTaken ? <p className="text-xs text-[#789097]">Action: {action.actionTaken}</p> : null}
                  {action.correctionOutcome ? <p className="text-xs text-[#789097]">ผลการแก้ไขทันที: {action.correctionOutcome}{action.correctionOutcomeNote ? ` · ${action.correctionOutcomeNote}` : ''}</p> : null}
                  {action.preventiveAction ? <p className="text-xs text-[#789097]">ป้องกันเกิดซ้ำ: {action.preventiveAction}</p> : null}
                  {action.ownerName || action.dueDate ? <p className="text-xs text-[#789097]">Owner: {action.ownerName ?? '-'} · Due: {formatDate(action.dueDate)}</p> : null}
                  {action.effectivenessNote ? <p className="text-xs text-[#789097]">ผลการยืนยันการแก้ไข: {action.effectivenessOutcome} · {action.effectivenessNote}{action.effectivenessVerifiedByName ? ` · ตรวจโดย ${action.effectivenessVerifiedByName}` : ''}{action.effectivenessVerifiedAt ? ` (${formatDateTime(action.effectivenessVerifiedAt)})` : ''}</p> : null}
                  {action.status !== 'closed' ? <div className="mt-3 flex justify-end"><Button variant="secondary" className="min-h-8 px-3 py-1.5 text-xs" disabled={busy} onClick={() => startEditing(action)}>แก้ไข</Button></div> : null}
                </>}
                <div className="mt-3"><AttachmentList module="iqc" entityType="corrective-action" entityId={action.id} kind="corrective-action" canDelete={actor.role === 'Admin'} /></div>
              </div> : null}
            </Card>
          </div>
        })}
        {filteredActions.length > visibleActions.length ? <div className="flex justify-center"><Button variant="secondary" onClick={() => setVisibleActionCount((count) => count + 20)}>แสดงเพิ่มอีก {Math.min(20, filteredActions.length - visibleActions.length)} รายการ</Button></div> : null}
        {!filteredActions.length ? <Card className="p-8 text-center text-sm text-[#8198a0]"><ClipboardList className="mx-auto mb-2 size-6 text-[#b8c9cd]" />{data.correctiveActions.length ? 'ไม่พบ corrective action ที่ตรงเงื่อนไข' : 'ยังไม่มี corrective action'}</Card> : null}
      </div>
    </div>
  )
}
