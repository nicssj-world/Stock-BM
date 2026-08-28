'use client'

import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, ClipboardList, Trash2 } from 'lucide-react'
import type { BmActor } from '@/lib/bm/types'
import type { EqaCorrectiveAction, EqaWorkspace } from '@/lib/eqa/types'
import {
  hasStructuredCorrectiveDetails,
  type CorrectiveActionDraft,
} from '@/lib/corrective-actions'
import { formatDate, formatDateTime } from '@/lib/bm/rules'
import { api, Button, Card, Notice, StatusBadge } from '@/components/ui'
import { AttachmentList } from '@/components/attachments'
import {
  CorrectiveActionForm,
  type CorrectiveActionSubmitIntent,
} from '@/components/corrective-action-form'
import type { Update } from '@/components/eqa/shared'

type EqaCorrectiveActionFilter = 'active' | 'open' | 'closed' | 'all'

export type EqaCorrectiveContext = {
  roundId: string
  resultId?: string | null
}

type EqaCorrectiveTabProps = {
  data: EqaWorkspace
  actor: BmActor
  onOk: Update
  onErr: (text: string) => void
  focusId?: string | null
  initialContext?: EqaCorrectiveContext | null
}

function resultLabel(action: EqaCorrectiveAction) {
  return action.resultLabel ?? 'ทั้ง round'
}

function actionToDraft(action: EqaCorrectiveAction): Partial<CorrectiveActionDraft> {
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

function contextSummary(round: EqaWorkspace['rounds'][number] | null, resultId: string | null, actions: EqaCorrectiveAction[]) {
  const result = round?.results.find((item) => item.id === resultId) ?? null
  const linked = round ? actions.find((action) => action.roundId === round.id && (resultId ? action.resultId === resultId || !action.resultId : !action.resultId)) : null
  return (
    <div className="space-y-1 px-1 text-xs text-[#55727c]">
      {round ? <p>Round: <span className="font-semibold text-[#173d50]">{round.roundLabel}</span> · {round.planItemName ?? round.schemeName}</p> : <p className="text-[#9aafb4]">เลือก Round เพื่อโหลดบริบท</p>}
      {result ? <p>ผลตัวอย่างที่เกี่ยวข้อง: <span className="font-semibold text-[#173d50]">{result.sampleCode ?? '-'} · {result.analyte}</span> · {result.outcome}</p> : resultId ? <p className="text-[#c02a37]">ไม่พบผลตัวอย่างที่ลิงก์</p> : null}
      {linked ? <p className="font-semibold text-[#a9700f]">มี Corrective Action เดิมสำหรับบริบทนี้แล้ว</p> : null}
      <p className="text-[11px] text-[#8ba0a5]">ผู้รับผิดชอบและ Due date กรอกตามการติดตามงาน</p>
    </div>
  )
}

export function CorrectiveTab({ data, actor, onOk, onErr, focusId, initialContext }: EqaCorrectiveTabProps) {
  const [roundId, setRoundId] = useState(initialContext?.roundId ?? '')
  const [resultId, setResultId] = useState(initialContext?.resultId ?? '')
  const [showAllRounds, setShowAllRounds] = useState(false)
  const [createVersion, setCreateVersion] = useState(0)
  const [localFocusId, setLocalFocusId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [actionFilter, setActionFilter] = useState<EqaCorrectiveActionFilter>('active')
  const [query, setQuery] = useState('')
  const [expandedActionIds, setExpandedActionIds] = useState<Set<string>>(new Set())
  const [visibleActionCount, setVisibleActionCount] = useState(20)
  const [editingActionId, setEditingActionId] = useState<string | null>(null)
  const [focusFilterOverride, setFocusFilterOverride] = useState(Boolean(focusId))

  const roundsNeedingCapa = useMemo(() => data.rounds.filter((round) => round.summaryOutcome === 'fail' || round.results.some((result) => result.outcome === 'warning' || result.outcome === 'unacceptable')), [data.rounds])
  const roundOptions = useMemo(() => {
    if (showAllRounds) return data.rounds
    const selected = data.rounds.find((round) => round.id === roundId)
    return selected && !roundsNeedingCapa.some((round) => round.id === selected.id) ? [selected, ...roundsNeedingCapa] : roundsNeedingCapa
  }, [data.rounds, roundId, roundsNeedingCapa, showAllRounds])
  const selectedRound = data.rounds.find((round) => round.id === roundId) ?? null
  const selectedResult = selectedRound?.results.find((result) => result.id === resultId) ?? null
  const contextAction = data.correctiveActions.find((action) => action.roundId === roundId && (resultId ? action.resultId === resultId || !action.resultId : !action.resultId)) ?? null
  const directContextLocked = Boolean(initialContext?.resultId)
  const effectiveFocusId = focusId ?? localFocusId
  const actionCounts = useMemo(() => ({
    open: data.correctiveActions.filter((action) => action.status === 'open').length,
    closed: data.correctiveActions.filter((action) => action.status === 'closed').length,
  }), [data.correctiveActions])
  const effectiveActionFilter = focusFilterOverride && focusId && actionFilter === 'active' ? 'all' : actionFilter
  const filteredActions = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase()
    return data.correctiveActions.filter((action) => {
      const statusMatches = effectiveActionFilter === 'all'
        || (effectiveActionFilter === 'active' && action.status !== 'closed')
        || action.status === effectiveActionFilter
      const textMatches = !normalizedQuery || [action.problem, action.roundLabel, resultLabel(action), action.ownerName, action.createdByName]
        .filter((value): value is string => Boolean(value))
        .some((value) => value.toLocaleLowerCase().includes(normalizedQuery))
      return statusMatches && textMatches
    })
  }, [data.correctiveActions, effectiveActionFilter, query])
  const focusedActionIndex = effectiveFocusId ? filteredActions.findIndex((action) => action.id === effectiveFocusId) : -1
  const visibleActions = filteredActions.slice(0, Math.max(visibleActionCount, focusedActionIndex + 1))

  useEffect(() => {
    if (!effectiveFocusId) return
    document.getElementById(`eqa-corrective-action-${effectiveFocusId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [effectiveFocusId, data.correctiveActions])

  const systemSignals = selectedResult ? [
    `Outcome จากผู้จัด: ${selectedResult.outcome}`,
    `Submitted: ${selectedResult.submittedValue ?? '-'} · Assigned: ${selectedResult.assignedValue ?? '-'}`,
    `Score: ${selectedResult.evaluationScore ?? '-'}`,
  ] : selectedRound ? [`ผลสรุปรอบจากระบบ: ${selectedRound.summaryOutcome}`, `${selectedRound.results.length} ผลตัวอย่างในรอบนี้`] : []
  const suggestedIssueTypes = selectedResult?.outcome === 'warning'
    ? ['eqa-warning']
    : selectedResult?.outcome === 'unacceptable'
      ? ['eqa-unacceptable']
       : selectedRound?.summaryOutcome === 'fail' ? ['result-out-of-control'] : []
  const suggestedProblem = selectedResult
    ? `EQA ${selectedResult.analyte} ผลประเมินจากผู้จัดเป็น ${selectedResult.outcome}`
    : selectedRound?.summaryOutcome === 'fail' ? `EQA ${selectedRound.roundLabel} สรุปผลจากระบบไม่ผ่านเกณฑ์` : ''

  async function create(value: CorrectiveActionDraft) {
    if (!roundId) return onErr('เลือก Round ก่อนบันทึก')
    if (contextAction) return onErr('บริบทนี้มี Corrective Action แล้ว ให้เปิดรายการเดิมเพื่อแก้ไข')
    setBusy(true)
    try {
      const result = await api<{ eqa: EqaWorkspace }>('/api/eqa/corrective-actions', {
        method: 'POST',
        body: JSON.stringify({ roundId, resultId: resultId || null, ...draftPayload(value) }),
      })
      const created = result.eqa.correctiveActions.find((action) => action.roundId === roundId && (resultId ? action.resultId === resultId || !action.resultId : !action.resultId)) ?? null
      onOk('เปิด Corrective Action แล้ว', result.eqa)
      if (created) {
        setLocalFocusId(created.id)
        setExpandedActionIds((ids) => new Set(ids).add(created.id))
      }
      if (!directContextLocked) {
        setRoundId('')
        setResultId('')
        setCreateVersion((version) => version + 1)
      }
    } catch (error) { onErr(error instanceof Error ? error.message : 'บันทึกไม่สำเร็จ') } finally { setBusy(false) }
  }

  async function close(id: string, body: Record<string, unknown> = {}) {
    setBusy(true)
    try {
      const result = await api<{ eqa: EqaWorkspace }>(`/api/eqa/corrective-actions/${id}/close`, { method: 'POST', body: JSON.stringify(body) })
      onOk('ปิด Corrective Action แล้ว', result.eqa)
      setEditingActionId(null)
    } catch (error) { onErr(error instanceof Error ? error.message : 'ปิดไม่สำเร็จ') } finally { setBusy(false) }
  }

  async function saveEditing(action: EqaCorrectiveAction, value: CorrectiveActionDraft, intent: CorrectiveActionSubmitIntent) {
    setBusy(true)
    try {
      const body = draftPayload(value)
      if (intent === 'complete') {
        const result = await api<{ eqa: EqaWorkspace }>(`/api/eqa/corrective-actions/${action.id}/close`, { method: 'POST', body: JSON.stringify(body) })
        onOk('ปิด Corrective Action แล้ว', result.eqa)
        setEditingActionId(null)
      } else {
        const result = await api<{ eqa: EqaWorkspace }>(`/api/eqa/corrective-actions/${action.id}`, { method: 'PATCH', body: JSON.stringify(body) })
        onOk('แก้ไข corrective action แล้ว', result.eqa)
      }
    } catch (error) { onErr(error instanceof Error ? error.message : 'บันทึกการแก้ไขไม่สำเร็จ') } finally { setBusy(false) }
  }

  function startEditing(action: EqaCorrectiveAction) {
    setEditingActionId(action.id)
    setExpandedActionIds((ids) => new Set(ids).add(action.id))
  }

  async function closeAction(action: EqaCorrectiveAction) {
    if (!hasStructuredCorrectiveDetails(actionToDraft(action), 'eqa')) {
      startEditing(action)
      onErr('กรอก Root cause, Action taken และข้อมูลโครงสร้างให้ครบก่อนปิด')
      return
    }
    await close(action.id)
  }

  async function verifyEffectiveness(id: string) {
    const effective = window.confirm('ยืนยันว่าการแก้ไขนี้มีประสิทธิผลหรือไม่?\nกด OK = effective, Cancel = ineffective')
    const note = window.prompt('บันทึกผลการยืนยันการแก้ไข:')
    if (!note?.trim()) return
    setBusy(true)
    try {
      const result = await api<{ eqa: EqaWorkspace }>(`/api/eqa/corrective-actions/${id}/verify-effectiveness`, { method: 'POST', body: JSON.stringify({ outcome: effective ? 'effective' : 'ineffective', note: note.trim() }) })
      onOk(effective ? 'ยืนยันประสิทธิผลแล้ว' : 'บันทึกว่า ineffective และเปิด CAPA ต่อ', result.eqa)
    } catch (error) { onErr(error instanceof Error ? error.message : 'ยืนยันไม่สำเร็จ') } finally { setBusy(false) }
  }

  async function remove(id: string) {
    if (!window.confirm('ลบ Corrective action นี้ใช่ไหม?\n\nรายการและไฟล์แนบทั้งหมดจะถูกลบถาวร')) return
    setBusy(true)
    try {
      const result = await api<{ eqa: EqaWorkspace }>(`/api/eqa/corrective-actions/${id}`, { method: 'DELETE' })
      setExpandedActionIds((ids) => { const next = new Set(ids); next.delete(id); return next })
      onOk('ลบ corrective action แล้ว', result.eqa)
    } catch (error) { onErr(error instanceof Error ? error.message : 'ลบไม่สำเร็จ') } finally { setBusy(false) }
  }

  function toggleExpanded(id: string) {
    setExpandedActionIds((ids) => { const next = new Set(ids); if (next.has(id)) next.delete(id); else next.add(id); return next })
  }

  function selectActionFilter(value: EqaCorrectiveActionFilter) { setFocusFilterOverride(false); setActionFilter(value); setVisibleActionCount(20) }
  function updateQuery(value: string) { setQuery(value); setVisibleActionCount(20) }

  return <div className="grid gap-4 lg:grid-cols-[minmax(340px,440px)_minmax(0,1fr)]">
    <div className="lg:col-span-2 px-1">
      <p className="text-xs font-bold text-[#0b7f76]">ขั้นตอนที่ 4 · ติดตาม Corrective Action (CAPA)</p>
      <p className="mt-1 text-sm text-[#6a838c]">เริ่มจากผล EQA ที่ Warning/Unacceptable แล้วบันทึกสาเหตุ การแก้ไข ผลการแก้ไข และการป้องกันเกิดซ้ำ</p>
    </div>
    <CorrectiveActionForm
      key={`eqa-create-${createVersion}-${roundId}-${resultId}`}
      idPrefix="eqa-corrective-create"
      module="eqa"
      mode="create"
      context={<div className="space-y-2 rounded-md border border-[#dce7e8] bg-white p-3">
        <label className="block text-xs font-semibold text-[#58747d]">Round ที่พบปัญหา
           <select className="mt-1 min-h-11 w-full rounded-md border border-[#cfdee0] bg-white px-3 py-2 text-sm text-[#173d50] outline-none focus:border-[#0b7f76] focus:ring-3 focus:ring-[#0b7f76]/10" value={roundId} onChange={(event) => { setRoundId(event.target.value); setResultId('') }} required disabled={directContextLocked}>
            <option value="">— เลือก round —</option>
            {roundOptions.map((round) => <option key={round.id} value={round.id}>{round.planItemName ?? round.schemeName} · {round.roundLabel}</option>)}
          </select>
        </label>
         <label className="flex min-h-11 items-center gap-2 text-xs text-[#58747d]"><input type="checkbox" checked={showAllRounds} onChange={(event) => setShowAllRounds(event.target.checked)} disabled={directContextLocked} /> แสดงทุก round (รวมที่ผ่านเกณฑ์)</label>
        {selectedRound?.results.length ? <label className="block text-xs font-semibold text-[#58747d]">ผลตัวอย่างที่เกี่ยวข้อง (ถ้ามี)
           <select className="mt-1 min-h-11 w-full rounded-md border border-[#cfdee0] bg-white px-3 py-2 text-sm text-[#173d50] outline-none focus:border-[#0b7f76] focus:ring-3 focus:ring-[#0b7f76]/10" value={resultId} onChange={(event) => setResultId(event.target.value)} disabled={directContextLocked}>
            <option value="">— ทั้ง round —</option>
            {selectedRound.results.map((result) => <option key={result.id} value={result.id}>{result.sampleCode ?? '-'} · {result.analyte} · {result.outcome}</option>)}
          </select>
        </label> : null}
        {contextSummary(selectedRound, resultId || null, data.correctiveActions)}
      </div>}
       systemSignals={systemSignals}
       suggestedIssueTypes={suggestedIssueTypes}
       initialValue={{ problem: suggestedProblem }}
       ownerOptions={data.users}
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
              ['active', `กำลังดำเนินการ ${actionCounts.open}`],
              ['open', `Open ${actionCounts.open}`],
              ['closed', `Closed ${actionCounts.closed}`],
              ['all', `ทั้งหมด ${data.correctiveActions.length}`],
            ] as [EqaCorrectiveActionFilter, string][]).map(([value, label]) => <button key={value} type="button" aria-pressed={effectiveActionFilter === value} onClick={() => selectActionFilter(value)} className={`rounded-full border px-2.5 py-1 text-[11px] font-bold transition focus-visible:ring-2 focus-visible:ring-[#0b7f76] focus-visible:outline-none ${effectiveActionFilter === value ? 'border-[#0b7f76] bg-[#e6f5f2] text-[#08766e]' : 'border-[#d6e2e3] bg-white text-[#58747d] hover:bg-[#f3f9f9]'}`}>{label}</button>)}
          </div>
        </div>
        <input className="min-h-11 min-w-0 max-w-full w-full rounded-md border border-[#cfdee0] bg-white px-3 py-2 text-sm text-[#173d50] outline-none transition placeholder:text-[#9aafb4] focus:border-[#0b7f76] focus:ring-3 focus:ring-[#0b7f76]/10" value={query} onChange={(event) => updateQuery(event.target.value)} placeholder="ค้นหาปัญหา, round, ผลตัวอย่าง, ผู้รับผิดชอบ หรือผู้บันทึก" aria-label="ค้นหา corrective action" />
      </Card>
      {visibleActions.map((action) => {
        const isExpanded = action.id === effectiveFocusId || expandedActionIds.has(action.id)
        const isLegacy = !hasStructuredCorrectiveDetails(actionToDraft(action), 'eqa')
        const needsCompletion = action.status === 'open' && isLegacy
        return <div key={action.id} id={`eqa-corrective-action-${action.id}`}>
          <Card className="overflow-hidden">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <button type="button" onClick={() => toggleExpanded(action.id)} aria-expanded={isExpanded} className="min-w-0 flex-1 p-4 text-left focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#0b7f76] focus-visible:outline-none">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold text-[#315763]">{action.roundLabel}</span>
                  <StatusBadge tone={action.status === 'closed' ? 'accepted' : 'warning'} label={action.status === 'closed' ? 'ปิดแล้ว' : 'กำลังดำเนินการ'} />
                  {isLegacy ? <span className="rounded-full border border-[#eed4a6] bg-[#fff9ed] px-2 py-0.5 text-[10px] font-bold text-[#a9700f]">{action.status === 'closed' ? 'ข้อมูลเดิม' : 'ต้องเติมข้อมูลก่อนปิด'}</span> : null}
                  <ChevronDown className={`size-4 shrink-0 text-[#789097] transition-transform ${isExpanded ? 'rotate-180' : ''}`} aria-hidden="true" />
                </div>
                <p className="mt-1 truncate text-xs font-semibold text-[#58747d]">{resultLabel(action)}</p>
                <p className="mt-1 truncate text-sm text-[#3f5c64]">{action.problem}</p>
                <p className="mt-1 text-[11px] text-[#9aafb4]">โดย {action.createdByName ?? '-'}{action.ownerName ? ` · ผู้รับผิดชอบ ${action.ownerName}` : ''}{action.dueDate ? ` · Due ${formatDate(action.dueDate)}` : ''}</p>
              </button>
              <div className="flex shrink-0 items-center gap-1 p-3">
                {action.status === 'open' ? <Button variant="secondary" className="min-h-8 px-3 py-1.5 text-xs" disabled={busy} onClick={() => void closeAction(action)}>{needsCompletion ? 'กรอกให้ครบก่อนปิด' : 'ปิด'}</Button> : null}
                {action.status === 'closed' && action.effectivenessOutcome === 'pending' ? <Button variant="secondary" className="min-h-8 px-3 py-1.5 text-xs" disabled={busy} onClick={() => void verifyEffectiveness(action.id)}>ยืนยันประสิทธิผล</Button> : null}
                <Button variant="danger" className="min-h-8 px-2 py-1.5" disabled={busy} onClick={() => void remove(action.id)} aria-label={`ลบ corrective action ${action.problem}`}><Trash2 className="size-3.5" /></Button>
              </div>
            </div>
            {isExpanded ? <div className="border-t border-[#e8efef] px-4 pb-4 pt-3">
              {editingActionId === action.id ? <CorrectiveActionForm
                key={`eqa-edit-${action.id}`}
                idPrefix={`eqa-corrective-edit-${action.id}`}
                module="eqa"
                mode="edit"
                context={contextSummary(data.rounds.find((round) => round.id === action.roundId) ?? null, action.resultId, data.correctiveActions)}
                systemSignals={data.rounds.find((round) => round.id === action.roundId)?.results.find((result) => result.id === action.resultId) ? [`Outcome จากผู้จัด: ${data.rounds.find((round) => round.id === action.roundId)?.results.find((result) => result.id === action.resultId)?.outcome}`] : []}
                ownerOptions={data.users}
                initialValue={actionToDraft(action)}
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
              <div className="mt-3">
                <AttachmentList module="eqa" entityType="eqa-corrective-action" entityId={action.id} kind="eqa-corrective-action" canDelete={actor.role === 'Admin'} label="Evidence / ไฟล์แนบ" />
              </div>
            </div> : null}
          </Card>
        </div>
      })}
      {filteredActions.length > visibleActions.length ? <div className="flex justify-center"><Button variant="secondary" onClick={() => setVisibleActionCount((count) => count + 20)}>แสดงเพิ่มอีก {Math.min(20, filteredActions.length - visibleActions.length)} รายการ</Button></div> : null}
      {!filteredActions.length ? <Card className="p-8 text-center text-sm text-[#8198a0]"><ClipboardList className="mx-auto mb-2 size-6 text-[#b8c9cd]" />{data.correctiveActions.length ? 'ไม่พบ corrective action ที่ตรงเงื่อนไข' : 'ยังไม่มี corrective action'}</Card> : null}
    </div>
  </div>
}
