'use client'

import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, ClipboardList, Trash2 } from 'lucide-react'
import type { BmActor } from '@/lib/bm/types'
import type { EqaCorrectiveAction, EqaWorkspace } from '@/lib/eqa/types'
import { formatDate, formatDateTime } from '@/lib/bm/rules'
import { api, Button, Card, Field, Input, Notice, Select, StatusBadge, Textarea } from '@/components/ui'
import { AttachmentList } from '@/components/attachments'
import type { Update } from '@/components/eqa/shared'

type EqaCorrectiveActionFilter = 'active' | 'open' | 'closed' | 'all'
type EqaCorrectiveActionEdit = { problem: string; rootCause: string; actionTaken: string; ownerId: string; dueDate: string }

export function CorrectiveTab({ data, actor, onOk, onErr, focusId }: { data: EqaWorkspace; actor: BmActor; onOk: Update; onErr: (text: string) => void; focusId?: string | null }) {
  const [roundId, setRoundId] = useState('')
  const [resultId, setResultId] = useState('')
  const [problem, setProblem] = useState('')
  const [rootCause, setRootCause] = useState('')
  const [actionTaken, setActionTaken] = useState('')
  const [ownerId, setOwnerId] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [busy, setBusy] = useState(false)
  const [showAllRounds, setShowAllRounds] = useState(false)
  const [actionFilter, setActionFilter] = useState<EqaCorrectiveActionFilter>('active')
  const [query, setQuery] = useState('')
  const [expandedActionIds, setExpandedActionIds] = useState<Set<string>>(new Set())
  const [visibleActionCount, setVisibleActionCount] = useState(20)
  const [editingActionId, setEditingActionId] = useState<string | null>(null)
  const [editingAction, setEditingAction] = useState<EqaCorrectiveActionEdit>({ problem: '', rootCause: '', actionTaken: '', ownerId: '', dueDate: '' })

  const roundsNeedingCapa = useMemo(() => data.rounds.filter((round) => round.summaryOutcome === 'fail' || round.results.some((result) => result.outcome === 'warning' || result.outcome === 'unacceptable')), [data.rounds])
  const roundOptions = showAllRounds ? data.rounds : roundsNeedingCapa
  const selectedRound = data.rounds.find((round) => round.id === roundId)
  const actionCounts = useMemo(() => ({
    open: data.correctiveActions.filter((action) => action.status === 'open').length,
    closed: data.correctiveActions.filter((action) => action.status === 'closed').length,
  }), [data.correctiveActions])
  const effectiveActionFilter = focusId && actionFilter === 'active' ? 'all' : actionFilter
  const filteredActions = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase()
    return data.correctiveActions.filter((action) => {
      const statusMatches = effectiveActionFilter === 'all'
        || (effectiveActionFilter === 'active' && action.status !== 'closed')
        || action.status === effectiveActionFilter
      const textMatches = !normalizedQuery || [action.problem, action.roundLabel, action.ownerName, action.createdByName]
        .filter((value): value is string => Boolean(value))
        .some((value) => value.toLocaleLowerCase().includes(normalizedQuery))
      return statusMatches && textMatches
    })
  }, [data.correctiveActions, effectiveActionFilter, query])
  const focusedActionIndex = focusId ? filteredActions.findIndex((action) => action.id === focusId) : -1
  const visibleActions = filteredActions.slice(0, Math.max(visibleActionCount, focusedActionIndex + 1))
  useEffect(() => {
    if (!focusId) return
    document.getElementById(`eqa-corrective-action-${focusId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [focusId, data.correctiveActions])

  async function create(event: React.FormEvent) {
    event.preventDefault()
    if (!roundId || !problem.trim()) return onErr('เลือก round และระบุปัญหา')
    setBusy(true)
    try {
      const result = await api<{ eqa: EqaWorkspace }>('/api/eqa/corrective-actions', {
        method: 'POST',
        body: JSON.stringify({ roundId, resultId: resultId || null, problem, rootCause: rootCause || null, actionTaken: actionTaken || null, ownerId: ownerId || null, dueDate: dueDate || null }),
      })
      onOk('เปิด corrective action แล้ว', result.eqa)
      setProblem(''); setRootCause(''); setActionTaken(''); setOwnerId(''); setDueDate(''); setResultId('')
    } catch (error) { onErr(error instanceof Error ? error.message : 'บันทึกไม่สำเร็จ') } finally { setBusy(false) }
  }
  async function close(id: string, body: { rootCause?: string | null; actionTaken?: string | null } = {}) {
    setBusy(true)
    try {
      const result = await api<{ eqa: EqaWorkspace }>(`/api/eqa/corrective-actions/${id}/close`, { method: 'POST', body: JSON.stringify(body) })
      onOk('ปิด corrective action แล้ว', result.eqa)
    } catch (error) { onErr(error instanceof Error ? error.message : 'ปิดไม่สำเร็จ') } finally { setBusy(false) }
  }
  function startEditing(action: EqaCorrectiveAction) {
    setEditingActionId(action.id)
    setEditingAction({ problem: action.problem, rootCause: action.rootCause ?? '', actionTaken: action.actionTaken ?? '', ownerId: action.ownerId ?? '', dueDate: action.dueDate ?? '' })
    setExpandedActionIds((ids) => new Set(ids).add(action.id))
  }
  async function saveEditing(event: React.FormEvent) {
    event.preventDefault()
    if (!editingActionId || !editingAction.problem.trim()) return onErr('ระบุปัญหาก่อนบันทึก')
    setBusy(true)
    try {
      const result = await api<{ eqa: EqaWorkspace }>(`/api/eqa/corrective-actions/${editingActionId}`, {
        method: 'PATCH',
        body: JSON.stringify({ problem: editingAction.problem.trim(), rootCause: editingAction.rootCause.trim() || null, actionTaken: editingAction.actionTaken.trim() || null, ownerId: editingAction.ownerId || null, dueDate: editingAction.dueDate || null }),
      })
      setEditingActionId(null)
      onOk('แก้ไข corrective action แล้ว', result.eqa)
    } catch (error) { onErr(error instanceof Error ? error.message : 'แก้ไขไม่สำเร็จ') } finally { setBusy(false) }
  }
  async function closeAction(action: EqaCorrectiveAction) {
    if (!action.rootCause || !action.actionTaken) {
      startEditing(action)
      onErr('กรอก Root cause และ Action taken ก่อนปิด')
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
  function selectActionFilter(value: EqaCorrectiveActionFilter) { setActionFilter(value); setVisibleActionCount(20) }
  function updateQuery(value: string) { setQuery(value); setVisibleActionCount(20) }

  return <div className="grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
    <div className="lg:col-span-2 px-1"><p className="text-xs font-bold text-[#0b7f76]">ขั้นตอนที่ 4 · ติดตาม corrective action (CAPA)</p><p className="mt-1 text-sm text-[#6a838c]">ใช้เมื่อผลรอบเป็นไม่ผ่าน: ระบุสาเหตุ การแก้ไข ผู้รับผิดชอบ และปิด CAPA ก่อนลงนามสรุปประจำปี</p></div>
    <Card className="space-y-3 p-4">
      <h2 className="font-bold text-[#173d50]">เปิดรายการแก้ไข (CAPA)</h2>
      <form className="space-y-3" onSubmit={create}>
        <Field label="Round"><Select value={roundId} onChange={(event) => { setRoundId(event.target.value); setResultId('') }} required><option value="">— เลือก round —</option>{roundOptions.map((round) => <option key={round.id} value={round.id}>{round.planItemName ?? round.schemeName} · {round.roundLabel}</option>)}</Select></Field>
        <label className="flex items-center gap-2 text-xs text-[#58747d]"><input type="checkbox" checked={showAllRounds} onChange={(event) => setShowAllRounds(event.target.checked)} /> แสดงทุก round (รวมที่ผ่านเกณฑ์)</label>
        {!roundOptions.length ? <p className="text-xs text-[#9aafb4]">ไม่มี round ที่ไม่ผ่านเกณฑ์ — ติ๊ก &ldquo;แสดงทุก round&rdquo; เพื่อเปิด CAPA กับ round อื่น</p> : null}
        {selectedRound?.results.length ? <Field label="ผลตัวอย่างที่เกี่ยวข้อง (ถ้ามี)"><Select value={resultId} onChange={(event) => setResultId(event.target.value)}><option value="">— ทั้ง round —</option>{selectedRound.results.map((result) => <option key={result.id} value={result.id}>{result.sampleCode ?? '-'} · {result.analyte}</option>)}</Select></Field> : null}
        <Field label="ปัญหา"><Textarea rows={2} value={problem} onChange={(event) => setProblem(event.target.value)} required /></Field>
        <Field label="สาเหตุราก (Root cause)" hint="กรอกก่อนปิด CAPA"><Textarea rows={2} value={rootCause} onChange={(event) => setRootCause(event.target.value)} /></Field>
        <Field label="การแก้ไข (Action taken)" hint="กรอกก่อนปิด CAPA"><Textarea rows={2} value={actionTaken} onChange={(event) => setActionTaken(event.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="ผู้รับผิดชอบ"><Select value={ownerId} onChange={(event) => setOwnerId(event.target.value)}><option value="">— ยังไม่กำหนด —</option>{data.users.map((user) => <option key={user.id} value={user.id}>{user.displayName}</option>)}</Select></Field>
          <Field label="กำหนดเสร็จ (Due date)"><Input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></Field>
        </div>
        <Button disabled={busy}>บันทึก</Button>
      </form>
    </Card>
    <div className="space-y-3">
      <Card className="space-y-3 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-bold text-[#173d50]">รายการแก้ไข (CAPA)</h2>
            <p className="mt-0.5 text-xs text-[#789097]">แสดง {visibleActions.length} จาก {filteredActions.length} รายการที่ตรงเงื่อนไข</p>
          </div>
          <div className="flex flex-wrap gap-1">
            {([
              ['active', `กำลังดำเนินการ ${actionCounts.open}`],
              ['closed', `Closed ${actionCounts.closed}`],
              ['all', `ทั้งหมด ${data.correctiveActions.length}`],
            ] as [EqaCorrectiveActionFilter, string][]).map(([value, label]) => (
              <button key={value} type="button" aria-pressed={effectiveActionFilter === value} onClick={() => selectActionFilter(value)} className={`rounded-full border px-2.5 py-1 text-[11px] font-bold transition focus-visible:ring-2 focus-visible:ring-[#0b7f76] focus-visible:outline-none ${effectiveActionFilter === value ? 'border-[#0b7f76] bg-[#e6f5f2] text-[#08766e]' : 'border-[#d6e2e3] bg-white text-[#58747d] hover:bg-[#f3f9f9]'}`}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <Input value={query} onChange={(event) => updateQuery(event.target.value)} placeholder="ค้นหาปัญหา, round, ผู้รับผิดชอบ หรือผู้บันทึก" aria-label="ค้นหา corrective action" />
      </Card>
      {visibleActions.map((action) => {
        const isExpanded = action.id === focusId || expandedActionIds.has(action.id)
        const needsCompletion = action.status === 'open' && (!action.rootCause || !action.actionTaken)
        return (
        <div key={action.id} id={`eqa-corrective-action-${action.id}`}>
          <Card className="overflow-hidden">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <button type="button" onClick={() => toggleExpanded(action.id)} aria-expanded={isExpanded} className="min-w-0 flex-1 p-4 text-left focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#0b7f76] focus-visible:outline-none">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-[#315763]">{action.roundLabel}</span>
                  <StatusBadge tone={action.status === 'closed' ? 'accepted' : 'warning'} label={action.status === 'closed' ? 'ปิดแล้ว' : 'กำลังดำเนินการ'} />
                  {needsCompletion ? <span className="rounded-full border border-[#eed4a6] bg-[#fff9ed] px-2 py-0.5 text-[10px] font-bold text-[#a9700f]">ข้อมูลไม่ครบ</span> : null}
                  <ChevronDown className={`size-4 shrink-0 text-[#789097] transition-transform ${isExpanded ? 'rotate-180' : ''}`} aria-hidden="true" />
                </div>
                {action.resultLabel ? <p className="mt-1 truncate text-xs font-semibold text-[#58747d]">{action.resultLabel}</p> : null}
                <p className="mt-1 truncate text-sm text-[#3f5c64]">{action.problem}</p>
                <p className="mt-1 text-[11px] text-[#9aafb4]">โดย {action.createdByName ?? '-'}{action.ownerName ? ` · ผู้รับผิดชอบ ${action.ownerName}` : ''}</p>
              </button>
              <div className="flex shrink-0 items-center gap-1 p-3">
                {action.status === 'open' ? (
                  <Button variant="secondary" className="min-h-8 px-3 py-1.5 text-xs" disabled={busy} onClick={() => void closeAction(action)}>
                    {needsCompletion ? 'กรอกก่อนปิด' : 'ปิด'}
                  </Button>
                ) : null}
                {action.status === 'closed' && action.effectivenessOutcome === 'pending' ? (
                  <Button variant="secondary" className="min-h-8 px-3 py-1.5 text-xs" disabled={busy} onClick={() => verifyEffectiveness(action.id)}>
                    ยืนยันประสิทธิผล
                  </Button>
                ) : null}
                <Button variant="danger" className="min-h-8 px-2 py-1.5" disabled={busy} onClick={() => void remove(action.id)} aria-label={`ลบ corrective action ${action.problem}`}>
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            </div>
            {isExpanded ? (
              <div className="border-t border-[#e8efef] px-4 pb-4 pt-3">
                {editingActionId === action.id ? (
                  <form className="space-y-3" onSubmit={saveEditing}>
                    <p className="text-xs font-bold text-[#315763]">แก้ไข Corrective action</p>
                    <Field label="ปัญหา"><Textarea rows={2} value={editingAction.problem} onChange={(event) => setEditingAction({ ...editingAction, problem: event.target.value })} required /></Field>
                    <Field label="สาเหตุราก (Root cause)"><Textarea rows={2} value={editingAction.rootCause} onChange={(event) => setEditingAction({ ...editingAction, rootCause: event.target.value })} required /></Field>
                    <Field label="การแก้ไข (Action taken)"><Textarea rows={2} value={editingAction.actionTaken} onChange={(event) => setEditingAction({ ...editingAction, actionTaken: event.target.value })} required /></Field>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <Field label="ผู้รับผิดชอบ"><Select value={editingAction.ownerId} onChange={(event) => setEditingAction({ ...editingAction, ownerId: event.target.value })}><option value="">— ยังไม่กำหนด —</option>{data.users.map((user) => <option key={user.id} value={user.id}>{user.displayName}</option>)}</Select></Field>
                      <Field label="กำหนดเสร็จ (Due date)"><Input type="date" value={editingAction.dueDate} onChange={(event) => setEditingAction({ ...editingAction, dueDate: event.target.value })} /></Field>
                    </div>
                    <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="ghost" disabled={busy} onClick={() => setEditingActionId(null)}>ยกเลิก</Button><Button disabled={busy}>บันทึกการแก้ไข</Button></div>
                  </form>
                ) : (
                  <>
                    {needsCompletion ? <Notice tone="warning">กรอก Root cause และ Action taken ก่อนปิด</Notice> : null}
                    {action.rootCause ? <p className="mt-1 text-xs text-[#789097]">Root cause: {action.rootCause}</p> : null}
                    {action.actionTaken ? <p className="text-xs text-[#789097]">Action: {action.actionTaken}</p> : null}
                    {action.ownerName || action.dueDate ? <p className="text-xs text-[#789097]">Owner: {action.ownerName ?? '-'} · Due: {formatDate(action.dueDate)}</p> : null}
                    {action.effectivenessNote ? (
                      <p className="text-xs text-[#789097]">
                        ผลการยืนยันการแก้ไข: {action.effectivenessOutcome === 'effective' ? 'มีประสิทธิผล' : action.effectivenessOutcome === 'ineffective' ? 'ไม่มีประสิทธิผล' : 'รอยืนยัน'} · {action.effectivenessNote}
                        {action.effectivenessVerifiedByName ? ` · ตรวจโดย ${action.effectivenessVerifiedByName}` : ''}
                        {action.effectivenessVerifiedAt ? ` (${formatDateTime(action.effectivenessVerifiedAt)})` : ''}
                      </p>
                    ) : null}
                    {action.status !== 'closed' ? <div className="mt-3 flex justify-end"><Button variant="secondary" className="min-h-8 px-3 py-1.5 text-xs" disabled={busy} onClick={() => startEditing(action)}>แก้ไข</Button></div> : null}
                  </>
                )}
                <div className="mt-3">
                  <AttachmentList module="eqa" entityType="eqa-corrective-action" entityId={action.id} kind="eqa-corrective-action" canDelete={actor.role === 'Admin'} />
                </div>
              </div>
            ) : null}
          </Card>
        </div>
      )})}
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
}
