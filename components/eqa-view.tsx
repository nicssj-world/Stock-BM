'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { CalendarClock, CheckCircle2, ChevronDown, ChevronUp, ClipboardList, FileText, Pencil, Plus, Printer, Settings, Trash2, X } from 'lucide-react'
import type { BmActor } from '@/lib/bm/types'
import type {
  EqaAnnualPlan, EqaAnnualSummary, EqaAssignedApprovalRole, EqaPlanItem, EqaRound, EqaWorkspace,
} from '@/lib/eqa/types'
import { EQA_APPROVAL_ROLE_LABELS } from '@/lib/eqa/types'
import { annualSummaryIssues, type EqaReadinessTarget } from '@/lib/eqa/rules'
import { responsibleCodeForDisplayName } from '@/lib/bm/responsible-codes'
import { api, Button, Card, Field, Input, Notice, PageHeader, Select, StatCard, StatusBadge, Tabs, Textarea } from '@/components/ui'
import { GeneratePlannedRoundsButton } from '@/components/eqa/planned-rounds'
import { RoundsTab } from '@/components/eqa/rounds-tab'
import { CorrectiveTab } from '@/components/eqa/corrective-tab'
import {
  APPROVAL_ROLES, ApprovalPanel, TAB_KEYS, THAI_MONTHS, UserSelect,
  type EqaFocus, type NoticeState, type Tab, type Update,
} from '@/components/eqa/shared'

export function EqaView({ actor, initialData }: { actor: BmActor; initialData: EqaWorkspace }) {
  const [data, setData] = useState(initialData)
  const requestedTab = useSearchParams().get('tab')
  const [tab, setTab] = useState<Tab>(requestedTab && TAB_KEYS.includes(requestedTab as Tab) ? (requestedTab as Tab) : 'plans')
  const [notice, setNotice] = useState<NoticeState>(null)
  const [focus, setFocus] = useState<EqaFocus | null>(null)
  const isAdmin = actor.role === 'Admin'
  const ok: Update = (text, next) => { setData(next); setNotice({ tone: 'success', text }) }
  const err = (text: string) => setNotice({ tone: 'danger', text })
  function openTarget(target: EqaReadinessTarget) {
    if (target.kind === 'receipt-field') { setTab('rounds'); setFocus({ roundId: target.roundId, open: 'receipt' }) }
    else if (target.kind === 'round-results') { setTab('rounds'); setFocus({ roundId: target.roundId, open: 'result' }) }
    else if (target.kind === 'round-status') { setTab('rounds'); setFocus({ roundId: target.roundId }) }
    else if (target.kind === 'round-summary') { setTab('rounds'); setFocus({ roundId: target.roundId, open: 'summary' }) }
    else if (target.kind === 'corrective') {
      const openAction = data.correctiveActions.find((action) => action.roundId === target.roundId && action.status !== 'closed')
      setTab('corrective'); setFocus({ actionId: openAction?.id })
    } else { setTab('plans'); setFocus(null) }
  }
  const roundReminders = data.rounds.filter((round) => round.reminder).map((round) => ({
    id: round.id, tone: round.reminder === 'overdue' ? 'rejected' as const : 'warning' as const,
    label: `${round.planItemName ?? round.schemeName} · ${round.roundLabel} · ${round.reminder === 'overdue' ? `เลย ${Math.abs(round.dueInDays ?? 0)} วัน` : `อีก ${round.dueInDays} วัน`}`,
  }))
  const capaReminders = data.correctiveActions.filter((action) => action.status !== 'closed' && action.dueInDays != null && action.dueInDays < 0).map((action) => ({
    id: action.id, tone: 'rejected' as const, label: `CAPA ${action.roundLabel} · เลย ${Math.abs(action.dueInDays ?? 0)} วัน`,
  }))
  const allReminders = [...roundReminders, ...capaReminders]
  const visibleReminders = allReminders.slice(0, 6)
  const tabs = [
    { key: 'plans' as const, label: 'แผนรายปี', icon: CalendarClock },
    { key: 'rounds' as const, label: 'รับตัวอย่าง / ลงผล', icon: ClipboardList },
    { key: 'corrective' as const, label: 'ติดตาม CAPA', icon: CheckCircle2 },
    { key: 'reports' as const, label: 'รายงาน / ลงนาม', icon: FileText },
    ...(isAdmin ? [{ key: 'manage' as const, label: 'จัดการ', icon: Settings }] : []),
  ]

  return (
    <div className="mx-auto max-w-[1500px] space-y-5">
      <PageHeader eyebrow="External Quality Assessment" title="EQA" description="ทำงานตามลำดับ: วางแผน → รับตัวอย่าง → ลงผล → บันทึกผลประเมิน → ติดตาม CAPA → ลงนามรายงาน" />
      {notice ? <Notice tone={notice.tone}>{notice.text}</Notice> : null}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="แผนรายปี" value={data.annualPlans.length} />
        <StatCard label="Schemes" value={data.summary.schemeCount} />
        <StatCard label="ใกล้ครบกำหนด" value={data.summary.dueSoon} tone={data.summary.dueSoon ? 'warning' : 'neutral'} />
        <StatCard label="เลยกำหนด" value={data.summary.overdue} tone={data.summary.overdue ? 'rejected' : 'neutral'} />
        <StatCard label="CAPA ค้าง" value={data.summary.openCorrectiveActions} hint={data.summary.overdueCorrectiveActions ? `เลยกำหนด ${data.summary.overdueCorrectiveActions}` : undefined} tone={data.summary.overdueCorrectiveActions ? 'rejected' : data.summary.openCorrectiveActions ? 'warning' : 'neutral'} />
      </div>
      {allReminders.length ? (
        <Card className="flex flex-wrap items-center gap-2 p-3">
          {visibleReminders.map((reminder) => <StatusBadge key={reminder.id} tone={reminder.tone} label={reminder.label} />)}
          {allReminders.length > visibleReminders.length ? <StatusBadge tone="neutral" label={`+${allReminders.length - visibleReminders.length} รายการ`} /> : null}
        </Card>
      ) : null}
      <WorkflowGuide active={tab} onSelect={(next) => { setTab(next); setFocus(null) }} />
      <Tabs tabs={tabs} active={tab} onChange={setTab} />
      {tab === 'plans' ? <PlansTab data={data} actor={actor} onOk={ok} onErr={err} /> : null}
      {tab === 'rounds' ? <RoundsTab data={data} actor={actor} focus={focus} onNavigate={openTarget} onOk={ok} onErr={err} /> : null}
      {tab === 'corrective' ? <CorrectiveTab data={data} actor={actor} onOk={ok} onErr={err} focusId={focus?.actionId ?? null} /> : null}
      {tab === 'reports' ? <ReportsTab data={data} actor={actor} onNavigate={openTarget} onOk={ok} onErr={err} /> : null}
      {tab === 'manage' && isAdmin ? <ManageTab data={data} actor={actor} onOk={ok} onErr={err} /> : null}
    </div>
  )
}

function PlansTab({ data, actor, onOk, onErr }: { data: EqaWorkspace; actor: BmActor; onOk: Update; onErr: (text: string) => void }) {
  const [editing, setEditing] = useState<EqaPlanItem | null>(null)
  const [planYear, setPlanYear] = useState(String(new Date().getFullYear()))
  const [busy, setBusy] = useState(false)
  async function createPlan(event: React.FormEvent) {
    event.preventDefault(); setBusy(true)
    try { const result = await api<{ eqa: EqaWorkspace }>('/api/eqa/plans', { method: 'POST', body: JSON.stringify({ planYear: Number(planYear) }) }); onOk('สร้างแผนรายปีแล้ว', result.eqa) }
    catch (error) { onErr(error instanceof Error ? error.message : 'สร้างแผนไม่สำเร็จ') } finally { setBusy(false) }
  }
  return <div className="space-y-4">
    <div className="px-1"><p className="text-xs font-bold text-[#0b7f76]">ขั้นตอนที่ 1 · วางแผนรายปี</p><p className="mt-1 text-sm text-[#6a838c]">กรอกข้อมูลหัวเอกสารและรายการ EQA ให้ครบ แล้วจึงสร้างรอบตามเดือนที่วางแผน</p></div>
    {actor.role === 'Admin' ? <Card className="p-4"><form className="flex max-w-md items-end gap-2" onSubmit={createPlan}><div className="flex-1"><Field label="สร้างแผนปี ค.ศ."><Input type="number" min="2000" max="2200" value={planYear} onChange={(event) => setPlanYear(event.target.value)} /></Field></div><Button disabled={busy}><Plus className="size-4" /> สร้างแผน</Button></form></Card> : null}
    {data.annualPlans.map((plan) => <Card key={plan.id} className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-2"><div><h2 className="text-lg font-bold text-[#173d50]">แผน EQA ประจำปี {plan.planYear + 543}</h2><p className="text-xs text-[#789097]">{plan.workSection} · {plan.departmentName} · {plan.organizationName}</p></div><Link className="inline-flex items-center gap-1 rounded-md border border-[#b8c8cc] bg-white px-3 py-2 text-xs font-bold text-[#173d50]" href={`/eqa/report/annual-plan/${plan.id}?tab=plans`}><Printer className="size-4" /> Fm-QP-LAB-19/01</Link></div>
      <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[900px] text-left text-xs"><thead className="bg-[#f3f8f8] text-[#55727c]"><tr><th className="p-2">ชื่อโครงการ / ชุดตัวอย่าง</th><th className="p-2">Provider</th><th className="p-2">รายการทดสอบ</th><th className="p-2 whitespace-nowrap">ความถี่</th><th className="p-2">เดือน/ผู้รับผิดชอบ</th><th className="p-2">Round</th><th className="p-2 whitespace-nowrap">สถานะ</th>{actor.role === 'Admin' ? <th className="p-2">จัดการ</th> : null}</tr></thead><tbody className="divide-y divide-[#e8eeee]">{plan.items.map((item) => { const itemRounds = data.rounds.filter((round) => round.planItemId === item.id); return <tr key={item.id}><td className="p-2"><p className="font-semibold">{item.projectName}</p><p className="text-[#789097]">{item.sampleSetName}{item.externalCode ? ` (${item.externalCode})` : ''}</p></td><td className="p-2">{item.providerName}</td><td className="p-2">{item.testItem}</td><td className="p-2 whitespace-nowrap">{item.expectedRounds ? `${item.expectedRounds} ครั้ง/ปี` : '-'}</td><td className="p-2">{item.occurrences.map((occurrence) => `${THAI_MONTHS[occurrence.plannedMonth - 1]} ${occurrence.responsibleCode}`).join(', ') || '-'}</td><td className="p-2"><div className="flex flex-wrap items-center gap-1.5"><span>{itemRounds.length}/{item.expectedRounds ?? '-'}</span><GeneratePlannedRoundsButton item={item} planYear={plan.planYear} itemRounds={itemRounds} onOk={onOk} onErr={onErr} /></div></td><td className="p-2 whitespace-nowrap">{data.annualSummaries.find((summary) => summary.planItem.id === item.id)?.readiness.length ? <StatusBadge tone="warning" label="ยังไม่ครบ" /> : <StatusBadge tone="accepted" label="พร้อมสรุป" />}</td>{actor.role === 'Admin' ? <td className="p-2"><div className="flex gap-1"><Button variant="ghost" className="min-h-7 px-2 py-1" onClick={() => setEditing(item)} title="แก้ไขรายการแผน"><Pencil className="size-3.5" /></Button><DeletePlanItemButton item={item} onOk={onOk} onErr={onErr} /></div></td> : null}</tr> })}</tbody></table></div>
      {actor.role === 'Admin' ? <PlanMetaForm plan={plan} onOk={onOk} onErr={onErr} /> : null}
      {actor.role === 'Admin' ? <PlanItemForm key={editing?.id ?? `new-${plan.id}`} plan={plan} editing={editing?.planId === plan.id ? editing : null} data={data} onCancel={() => setEditing(null)} onOk={(text, next) => { setEditing(null); onOk(text, next) }} onErr={onErr} /> : null}
      <ApprovalPanel actor={actor} data={data} type="annual-plan" entityId={plan.id} state={plan.documentState} approvals={plan.approvals} readiness={plan.readiness.map((message) => ({ message }))} onOk={onOk} onErr={onErr} />
    </Card>)}
    {!data.annualPlans.length ? <Card className="p-8 text-center text-sm text-[#8198a0]">ยังไม่มีแผนรายปี</Card> : null}
  </div>
}

function PlanMetaForm({ plan, onOk, onErr }: { plan: EqaAnnualPlan; onOk: Update; onErr: (text: string) => void }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({ workSection: plan.workSection, departmentName: plan.departmentName, organizationName: plan.organizationName })
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true)
    try { const result = await api<{ eqa: EqaWorkspace }>(`/api/eqa/plans/${plan.id}`, { method: 'PATCH', body: JSON.stringify(form) }); setOpen(false); onOk('บันทึกข้อมูลหัวเอกสารแล้ว', result.eqa) }
    catch (error) { onErr(error instanceof Error ? error.message : 'บันทึกข้อมูลหัวเอกสารไม่สำเร็จ') } finally { setBusy(false) }
  }
  return <div className="mt-3 rounded-lg border border-[#dce7e8] bg-[#f8fbfb] p-3">
    <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-xs font-bold text-[#315763]">ข้อมูลหัวเอกสาร 19/01 และ 19/04</p><p className="mt-0.5 text-[11px] text-[#789097]">ใช้แสดงชื่อหน่วยงานบนใบรายงานและควรกรอกให้ตรงกับหน่วยงานย่อย</p></div><Button type="button" variant="secondary" className="min-h-9 px-3 text-xs" onClick={() => setOpen((value) => !value)}><Pencil className="size-3.5" />{open ? 'ซ่อน' : 'แก้ไขข้อมูลหัวเอกสาร'}</Button></div>
    {open ? <form onSubmit={submit} className="mt-3 grid gap-2 md:grid-cols-3"><Field label="งาน/หน่วยงานย่อย"><Input value={form.workSection} onChange={(event) => setForm({ ...form, workSection: event.target.value })} required /></Field><Field label="กลุ่มงาน/ฝ่าย"><Input value={form.departmentName} onChange={(event) => setForm({ ...form, departmentName: event.target.value })} required /></Field><Field label="องค์กร"><Input value={form.organizationName} onChange={(event) => setForm({ ...form, organizationName: event.target.value })} required /></Field><div className="md:col-span-3"><Button disabled={busy}>{busy ? 'กำลังบันทึก…' : 'บันทึกข้อมูลหัวเอกสาร'}</Button></div></form> : null}
  </div>
}

function DeletePlanItemButton({ item, onOk, onErr }: { item: EqaPlanItem; onOk: Update; onErr: (text: string) => void }) {
  const [busy, setBusy] = useState(false)
  async function remove() { if (!window.confirm(`ลบรายการ ${item.sampleSetName} ใช่ไหม?`)) return; setBusy(true); try { const result = await api<{ eqa: EqaWorkspace }>(`/api/eqa/plan-items/${item.id}`, { method: 'DELETE' }); onOk('ลบรายการแผนแล้ว', result.eqa) } catch (error) { onErr(error instanceof Error ? error.message : 'ลบไม่สำเร็จ') } finally { setBusy(false) } }
  return <Button variant="danger" className="min-h-7 px-2 py-1" disabled={busy} onClick={remove} title="ลบรายการแผน"><Trash2 className="size-3.5" /></Button>
}

// Keyed on the display name with any trailing "." stripped, so "Siriwat J."
// and "Siriwat J" both resolve -- the abbreviation is derived from the
// person, not typed in by hand, so a name mismatch should just skip the
// autofill rather than throw.
function responsibleCodeForUser(users: EqaWorkspace['users'], userId: string): string | undefined {
  return responsibleCodeForDisplayName(users.find((user) => user.id === userId)?.displayName)
}

function WorkflowGuide({ active, onSelect }: { active: Tab; onSelect: (tab: Tab) => void }) {
  const steps: { number: string; tab: Tab; label: string; detail: string; icon: typeof CalendarClock }[] = [
    { number: '1', tab: 'plans', label: 'วางแผนรายปี', detail: 'กรอกข้อมูล 19/01', icon: CalendarClock },
    { number: '2', tab: 'rounds', label: 'รับตัวอย่าง', detail: 'กรอกแบบ 19/02', icon: ClipboardList },
    { number: '3', tab: 'rounds', label: 'ลงผลและประเมิน', detail: 'ผลจากผู้จัด EQA', icon: CheckCircle2 },
    { number: '4', tab: 'corrective', label: 'แก้ไขเมื่อไม่ผ่าน', detail: 'ปิด CAPA ให้ครบ', icon: CheckCircle2 },
    { number: '5', tab: 'reports', label: 'รายงานและลงนาม', detail: '19/01 · 19/02 · 19/04', icon: FileText },
  ]
  return <Card className="p-3 sm:p-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div><p className="text-sm font-bold text-[#173d50]">ลำดับการทำงาน EQA</p><p className="mt-0.5 text-xs text-[#789097]">เลือกขั้นตอนที่ต้องทำ ระบบจะแสดงเฉพาะข้อมูลที่เกี่ยวข้องกับขั้นตอนนั้น</p></div>
      <span className="rounded-full border border-[#cfe1e0] bg-[#f7fbfa] px-2.5 py-1 text-[11px] font-bold text-[#55727c]">5 ขั้นตอน</span>
    </div>
    <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
      {steps.map(({ number, tab, label, detail, icon: Icon }) => <button key={`${number}-${tab}`} type="button" onClick={() => onSelect(tab)} aria-current={active === tab ? 'step' : undefined} className={`flex min-h-16 items-center gap-2 rounded-lg border px-3 py-2 text-left transition focus-visible:ring-2 focus-visible:ring-[#0b7f76] focus-visible:outline-none ${active === tab ? 'border-[#0b7f76] bg-[#eaf7f5] text-[#08766e]' : 'border-[#dce7e8] bg-white text-[#315763] hover:border-[#9fc4c1] hover:bg-[#f7fbfb]'}`}><span className={`flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${active === tab ? 'bg-[#0b7f76] text-white' : 'bg-[#edf4f3] text-[#55727c]'}`}>{number}</span><Icon className="size-4 shrink-0" aria-hidden="true" /><span className="min-w-0"><span className="block text-xs font-bold">{label}</span><span className="mt-0.5 block truncate text-[11px] text-[#789097]">{detail}</span></span></button>)}
    </div>
  </Card>
}

function PlanItemForm({ plan, editing, data, onCancel, onOk, onErr }: { plan: EqaAnnualPlan; editing: EqaPlanItem | null; data: EqaWorkspace; onCancel: () => void; onOk: Update; onErr: (text: string) => void }) {
  const [form, setForm] = useState(() => ({
    schemeId: editing?.schemeId ?? '', projectName: editing?.projectName ?? '', providerName: editing?.providerName ?? '', sampleSetName: editing?.sampleSetName ?? '', externalCode: editing?.externalCode ?? '',
    testItem: editing?.testItem ?? '', expectedRounds: editing?.expectedRounds == null ? '' : String(editing.expectedRounds), maintenanceBudget: editing?.maintenanceBudget ?? false, tor: editing?.tor ?? false,
    price: editing?.price == null ? '' : String(editing.price), evaluationCriteria: editing?.evaluationCriteria ?? '', equipmentName: editing?.equipmentName ?? '', note: editing?.note ?? '', sortOrder: editing?.sortOrder == null ? String(plan.items.length + 1) : String(editing.sortOrder),
  }))
  const [selectedEquipmentIds, setSelectedEquipmentIds] = useState(() => {
    const linked = data.schemes.find((scheme) => scheme.id === (editing?.schemeId ?? ''))?.equipment ?? []
    const savedNames = new Set((editing?.equipmentName ?? '').split(',').map((name) => name.trim()).filter(Boolean))
    return linked.filter((equipment) => savedNames.has(equipment.name)).map((equipment) => equipment.id)
  })
  const [occurrences, setOccurrences] = useState(() => editing?.occurrences.map((occurrence) => ({ plannedMonth: String(occurrence.plannedMonth), responsibleUserId: occurrence.responsibleUserId ?? '', responsibleCode: occurrence.responsibleCode })) ?? [])
  const [busy, setBusy] = useState(false)
  const [showForm, setShowForm] = useState(Boolean(editing))
  function selectScheme(schemeId: string) {
    const scheme = data.schemes.find((item) => item.id === schemeId)
    const equipmentIds = scheme?.equipment.map((equipment) => equipment.id) ?? []
    setSelectedEquipmentIds(equipmentIds)
    setForm((current) => ({ ...current, schemeId, projectName: scheme?.name || '', providerName: scheme?.providerName || '', externalCode: scheme?.code || '', testItem: scheme?.analyteScope || '', expectedRounds: scheme?.roundsPerYear ? String(scheme.roundsPerYear) : '', equipmentName: scheme?.equipment.map((equipment) => equipment.name).join(', ') || '' }))
  }
  function toggleEquipment(equipmentId: string) {
    const scheme = data.schemes.find((item) => item.id === form.schemeId)
    const nextIds = selectedEquipmentIds.includes(equipmentId) ? selectedEquipmentIds.filter((id) => id !== equipmentId) : [...selectedEquipmentIds, equipmentId]
    setSelectedEquipmentIds(nextIds)
    setForm((current) => ({ ...current, equipmentName: (scheme?.equipment.filter((equipment) => nextIds.includes(equipment.id)).map((equipment) => equipment.name) ?? []).join(', ') }))
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true)
    const body = { planId: plan.id, ...form, expectedRounds: form.expectedRounds ? Number(form.expectedRounds) : null, price: form.price ? Number(form.price) : null, sortOrder: Number(form.sortOrder || 0), externalCode: form.externalCode || null, evaluationCriteria: form.evaluationCriteria || null, equipmentName: form.equipmentName || null, note: form.note || null, occurrences: occurrences.map((occurrence, index) => ({ plannedMonth: Number(occurrence.plannedMonth), responsibleUserId: occurrence.responsibleUserId || null, responsibleCode: occurrence.responsibleCode, sortOrder: index })) }
    try { const result = await api<{ eqa: EqaWorkspace }>(editing ? `/api/eqa/plan-items/${editing.id}` : '/api/eqa/plan-items', { method: editing ? 'PATCH' : 'POST', body: JSON.stringify(body) }); onOk(editing ? 'แก้ไขรายการแผนแล้ว' : 'เพิ่มรายการแผนแล้ว', result.eqa) }
    catch (error) { onErr(error instanceof Error ? error.message : 'บันทึกไม่สำเร็จ') } finally { setBusy(false) }
  }
  return <div className="mt-4"><div className="flex justify-end">{!editing ? <Button type="button" variant="secondary" onClick={() => setShowForm(!showForm)}><Plus className="size-4" /> {showForm ? 'ซ่อนฟอร์มเพิ่มรายการ' : 'เพิ่มรายการในแผน'}</Button> : null}</div>{showForm || editing ? <form onSubmit={submit} className="mt-3 space-y-3 rounded-md border border-[#dfe8e9] bg-[#fbfdfd] p-3">
    <div className="flex items-center justify-between"><h3 className="font-bold text-[#315763]">{editing ? `แก้ไข ${editing.sampleSetName}` : 'เพิ่มรายการในแผน'}</h3>{editing ? <Button type="button" variant="ghost" className="min-h-8 px-2" onClick={onCancel}><X className="size-4" /></Button> : null}</div>
    <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4"><Field label="Scheme"><Select value={form.schemeId} onChange={(event) => selectScheme(event.target.value)} required><option value="">—</option>{data.schemes.map((scheme) => <option key={scheme.id} value={scheme.id}>{scheme.providerName} · {scheme.name}</option>)}</Select></Field><Field label="ชื่อโครงการ"><Input value={form.projectName} onChange={(event) => setForm({ ...form, projectName: event.target.value })} required /></Field><Field label="หน่วยงานผู้จัดส่ง"><Input value={form.providerName} onChange={(event) => setForm({ ...form, providerName: event.target.value })} required /></Field><Field label="ชื่อชุดตัวอย่าง"><Input value={form.sampleSetName} onChange={(event) => setForm({ ...form, sampleSetName: event.target.value })} required /></Field><Field label="รหัสภายนอก"><Input value={form.externalCode} onChange={(event) => setForm({ ...form, externalCode: event.target.value })} /></Field><Field label="รายการทดสอบ"><Input value={form.testItem} onChange={(event) => setForm({ ...form, testItem: event.target.value })} required /></Field><Field label="จำนวนครั้ง/ปี"><Input type="number" min="1" value={form.expectedRounds} onChange={(event) => setForm({ ...form, expectedRounds: event.target.value })} /></Field><Field label="ราคา (บาท)"><Input type="number" min="0" step="0.01" value={form.price} onChange={(event) => setForm({ ...form, price: event.target.value })} /></Field><div className="xl:col-span-2"><span className="mb-1 block text-xs font-semibold text-[#58747d]">เครื่องมือจากฐานข้อมูล</span><div className="min-h-10 rounded-md border border-[#cfdee0] bg-white px-3 py-2">{data.schemes.find((scheme) => scheme.id === form.schemeId)?.equipment.length ? <div className="space-y-1">{data.schemes.find((scheme) => scheme.id === form.schemeId)?.equipment.map((equipment) => <label key={equipment.id} className="flex items-center gap-2 text-sm text-[#173d50]"><input type="checkbox" checked={selectedEquipmentIds.includes(equipment.id)} onChange={() => toggleEquipment(equipment.id)} className="size-4 accent-[#0b7f76]" /><Link href={`/equipment?view=registry&equipment=${equipment.id}`} className="truncate hover:underline" target="_blank">{equipment.code} · {equipment.name}</Link><span className="text-[11px] text-[#8ba0a5]">({equipment.status})</span></label>)}</div> : <p className="text-xs text-[#8ba0a5]">ยังไม่มีเครื่องมือที่ผูกกับ Scheme นี้ · เชื่อมจากทะเบียนเครื่องมือก่อน</p>}</div></div><Field label="ลำดับ"><Input type="number" value={form.sortOrder} onChange={(event) => setForm({ ...form, sortOrder: event.target.value })} /></Field><div className="flex items-center gap-4 self-end text-sm"><label className="flex items-center gap-2"><input type="checkbox" checked={form.maintenanceBudget} onChange={(event) => setForm({ ...form, maintenanceBudget: event.target.checked })} /> เงินบำรุง</label><label className="flex items-center gap-2"><input type="checkbox" checked={form.tor} onChange={(event) => setForm({ ...form, tor: event.target.checked })} /> TOR</label></div></div>
    <Field label="เกณฑ์การประเมิน"><Textarea rows={4} value={form.evaluationCriteria} onChange={(event) => setForm({ ...form, evaluationCriteria: event.target.value })} /></Field><Field label="หมายเหตุ"><Textarea rows={2} value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} /></Field>
    <div><div className="flex items-center justify-between"><p className="text-xs font-bold text-[#55727c]">เดือนตามแผน / ผู้รับผิดชอบ</p><Button type="button" variant="secondary" className="min-h-8 px-2 py-1 text-xs" onClick={() => setOccurrences([...occurrences, { plannedMonth: '1', responsibleUserId: '', responsibleCode: '' }])}><Plus className="size-3.5" /> เพิ่มเดือน</Button></div><div className="mt-2 grid gap-2 md:grid-cols-2">{occurrences.map((occurrence, index) => <div key={`${index}-${occurrence.plannedMonth}`} className="grid grid-cols-[110px_1fr_90px_auto] gap-1"><Select value={occurrence.plannedMonth} onChange={(event) => setOccurrences(occurrences.map((item, itemIndex) => itemIndex === index ? { ...item, plannedMonth: event.target.value } : item))}>{THAI_MONTHS.map((month, monthIndex) => <option key={month} value={monthIndex + 1}>{month}</option>)}</Select><Select value={occurrence.responsibleUserId} onChange={(event) => { const userId = event.target.value; const code = responsibleCodeForUser(data.users, userId); setOccurrences(occurrences.map((item, itemIndex) => itemIndex === index ? { ...item, responsibleUserId: userId, responsibleCode: code ?? item.responsibleCode } : item)) }}><option value="">— ผู้รับผิดชอบ —</option>{data.users.map((user) => <option key={user.id} value={user.id}>{user.displayName}</option>)}</Select><Input placeholder="รหัสย่อ" value={occurrence.responsibleCode} onChange={(event) => setOccurrences(occurrences.map((item, itemIndex) => itemIndex === index ? { ...item, responsibleCode: event.target.value } : item))} required /><Button type="button" variant="ghost" className="px-2" onClick={() => setOccurrences(occurrences.filter((_, itemIndex) => itemIndex !== index))}><X className="size-4" /></Button></div>)}</div></div>
    <Button disabled={busy}>{editing ? 'บันทึกแก้ไข' : 'เพิ่มรายการ'}</Button>
  </form> : null}</div>
}

function ReportsTab({ data, actor, onNavigate, onOk, onErr }: { data: EqaWorkspace; actor: BmActor; onNavigate: (target: EqaReadinessTarget) => void; onOk: Update; onErr: (text: string) => void }) {
  return <div className="space-y-4"><div className="px-1"><p className="text-xs font-bold text-[#0b7f76]">ขั้นตอนที่ 5 · รายงานและลงนาม</p><p className="mt-1 text-sm text-[#6a838c]">ตรวจความพร้อมของข้อมูล เปิดใบรายงาน แล้วลงนามดิจิทัลบนโทรศัพท์เครื่องเดียวกันให้ครบทุกบทบาท</p></div>{data.annualPlans.map((plan) => <Card key={plan.id} className="p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="font-bold">ปี {plan.planYear + 543}</h2><p className="text-xs text-[#789097]">รายงานแผน 1 ฉบับ · สรุป {plan.items.length} scheme</p></div><Link href={`/eqa/report/annual-plan/${plan.id}?tab=reports`} className="inline-flex items-center gap-1 rounded-md border border-[#b8c8cc] px-3 py-2 text-xs font-bold"><Printer className="size-4" /> Fm-QP-LAB-19/01</Link></div><div className="mt-3 divide-y divide-[#e3ebec] overflow-hidden rounded-md border border-[#dfe8e9]">{plan.items.map((item) => { const summary = data.annualSummaries.find((record) => record.planItem.id === item.id); return summary ? <SummaryReportCard key={item.id} summary={summary} data={data} actor={actor} onNavigate={onNavigate} onOk={onOk} onErr={onErr} /> : null })}</div></Card>)}{!data.annualPlans.length ? <Card className="p-8 text-center text-sm text-[#8198a0]">ยังไม่มีรายงาน เพราะยังไม่ได้สร้างแผนรายปี</Card> : null}</div>
}

function SummaryReportCard({ summary, data, actor, onNavigate, onOk, onErr }: { summary: EqaAnnualSummary; data: EqaWorkspace; actor: BmActor; onNavigate: (target: EqaReadinessTarget) => void; onOk: Update; onErr: (text: string) => void }) {
  const [expanded, setExpanded] = useState(false)
  const readiness = annualSummaryIssues(summary.planItem, summary.rounds, data.correctiveActions)
  const isReady = readiness.length === 0
  const statusLabel = !isReady ? `รอดำเนินการ ${readiness.length} รายการ` : summary.documentState.status === 'approved' ? 'ลงนามครบแล้ว' : 'พร้อมลงนาม'
  const statusTone = !isReady ? 'warning' as const : summary.documentState.status === 'approved' ? 'accepted' as const : 'neutral' as const
  return <div className="bg-white"><div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3"><div className="min-w-48 flex-1"><p className="font-bold text-[#315763]">{summary.planItem.sampleSetName}</p><p className="text-xs text-[#789097]">{summary.planItem.projectName} · {summary.rounds.length}/{summary.planItem.expectedRounds ?? '-'} รอบ</p></div><div className="text-xs text-[#55727c]"><StatusBadge tone={statusTone} label={statusLabel} /></div><Link href={`/eqa/report/annual-summary/${summary.planItem.id}?tab=reports`} className="inline-flex items-center gap-1 rounded border border-[#b8c8cc] px-2 py-1.5 text-xs font-bold"><Printer className="size-3.5" /> Fm-QP-LAB-19/04</Link><Button type="button" variant="ghost" className="min-h-8 px-2 text-xs" onClick={() => setExpanded(!expanded)} aria-expanded={expanded}>{expanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}{expanded ? 'ซ่อนรายละเอียด' : 'ตรวจความพร้อม/ลงนาม'}</Button></div>{expanded ? <div className="border-t border-[#e3ebec] bg-[#f8fbfb] px-4 py-3"><div className="mb-3 flex items-center justify-between gap-2"><p className="text-xs font-semibold text-[#55727c]">รายละเอียดความพร้อมและการลงนาม</p><span className="text-xs text-[#789097]">{summary.rounds.length} รอบในรายการนี้</span></div><ApprovalPanel actor={actor} data={data} type="annual-summary" entityId={summary.planItem.id} state={summary.documentState} approvals={summary.approvals} readiness={readiness} onNavigate={onNavigate} onOk={onOk} onErr={onErr} /></div> : null}</div>
}

function ManageTab({ data, actor, onOk, onErr }: { data: EqaWorkspace; actor: BmActor; onOk: Update; onErr: (text: string) => void }) {
  return <div className="grid gap-4 lg:grid-cols-2">
    <SettingsDisclosure title="Provider"><ProviderManager data={data} onOk={onOk} onErr={onErr} /></SettingsDisclosure>
    <SettingsDisclosure title="Scheme และเครื่องมือ"><SchemeManager data={data} onOk={onOk} onErr={onErr} /></SettingsDisclosure>
    <SettingsDisclosure title="สร้าง/จัดการ Round"><RoundManager data={data} onOk={onOk} onErr={onErr} /></SettingsDisclosure>
    <SettingsDisclosure title="ผู้อนุมัติ"><ApproverManager data={data} actor={actor} onOk={onOk} onErr={onErr} /></SettingsDisclosure>
  </div>
}

function SettingsDisclosure({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  return <section>
    <button type="button" className="flex w-full items-center justify-between rounded-lg border border-[#d6e2e3] bg-white px-4 py-3 text-left font-bold text-[#173d50] hover:bg-[#f7fbfb]" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
      {title}<ChevronDown className={`size-4 text-[#58747d] transition-transform ${open ? 'rotate-180' : ''}`} />
    </button>
    {open ? <div className="mt-2">{children}</div> : null}
  </section>
}

function ProviderManager({ data, onOk, onErr }: { data: EqaWorkspace; onOk: Update; onErr: (text: string) => void }) {
  const [name, setName] = useState('')
  async function create(event: React.FormEvent) { event.preventDefault(); try { const result = await api<{ eqa: EqaWorkspace }>('/api/eqa/providers', { method: 'POST', body: JSON.stringify({ name }) }); setName(''); onOk('เพิ่ม provider แล้ว', result.eqa) } catch (error) { onErr(error instanceof Error ? error.message : 'บันทึกไม่สำเร็จ') } }
  async function edit(id: string, current: string) { const name = window.prompt('ชื่อ provider:', current); if (!name?.trim()) return; try { const result = await api<{ eqa: EqaWorkspace }>(`/api/eqa/providers/${id}`, { method: 'PATCH', body: JSON.stringify({ name }) }); onOk('แก้ไข provider แล้ว', result.eqa) } catch (error) { onErr(error instanceof Error ? error.message : 'แก้ไขไม่สำเร็จ') } }
  return <Card className="p-4"><h2 className="font-bold">Provider</h2><form className="mt-3 flex items-end gap-2" onSubmit={create}><div className="flex-1"><Field label="ชื่อ provider"><Input value={name} onChange={(event) => setName(event.target.value)} required /></Field></div><Button>เพิ่ม</Button></form><div className="mt-3 space-y-1">{data.providers.map((provider) => <div key={provider.id} className="flex justify-between rounded border border-[#e3ebec] p-2 text-sm"><span>{provider.name}</span><Button variant="ghost" className="min-h-7 px-2" onClick={() => edit(provider.id, provider.name)}><Pencil className="size-3.5" /></Button></div>)}</div></Card>
}

function SchemeManager({ data, onOk, onErr }: { data: EqaWorkspace; onOk: Update; onErr: (text: string) => void }) {
  const blankForm = { providerId: '', name: '', code: '', analyteScope: '', roundsPerYear: '' }
  const [form, setForm] = useState(blankForm)
  const [editingId, setEditingId] = useState<string | null>(null)
  function reset() { setEditingId(null); setForm(blankForm) }
  function edit(scheme: EqaWorkspace['schemes'][number]) { setEditingId(scheme.id); setForm({ providerId: scheme.providerId, name: scheme.name, code: scheme.code ?? '', analyteScope: scheme.analyteScope ?? '', roundsPerYear: scheme.roundsPerYear == null ? '' : String(scheme.roundsPerYear) }) }
  async function save(event: React.FormEvent) { event.preventDefault(); const body = { ...form, code: form.code || null, analyteScope: form.analyteScope || null, roundsPerYear: form.roundsPerYear ? Number(form.roundsPerYear) : null }; try { const result = await api<{ eqa: EqaWorkspace }>(editingId ? `/api/eqa/schemes/${editingId}` : '/api/eqa/schemes', { method: editingId ? 'PATCH' : 'POST', body: JSON.stringify(body) }); reset(); onOk(editingId ? 'แก้ไข scheme แล้ว' : 'เพิ่ม scheme แล้ว', result.eqa) } catch (error) { onErr(error instanceof Error ? error.message : 'บันทึกไม่สำเร็จ') } }
  async function remove(id: string) { if (!window.confirm('ลบ scheme ใช่ไหม?')) return; try { const result = await api<{ eqa: EqaWorkspace }>(`/api/eqa/schemes/${id}`, { method: 'DELETE' }); onOk('ลบ scheme แล้ว', result.eqa) } catch (error) { onErr(error instanceof Error ? error.message : 'ลบไม่สำเร็จ') } }
  return <Card className="p-4"><h2 className="font-bold">{editingId ? 'แก้ไข Scheme' : 'Scheme'}</h2><form className="mt-3 grid grid-cols-2 gap-2" onSubmit={save}><Field label="Provider"><Select value={form.providerId} onChange={(event) => setForm({ ...form, providerId: event.target.value })} required><option value="">—</option>{data.providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.name}</option>)}</Select></Field><Field label="ชื่อ scheme"><Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></Field><Field label="Code (รหัสภายนอก)"><Input value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value })} /></Field><Field label="Rounds/ปี"><Input type="number" value={form.roundsPerYear} onChange={(event) => setForm({ ...form, roundsPerYear: event.target.value })} /></Field><div className="col-span-2"><Field label="Analyte scope (หนึ่งรายการต่อหนึ่งบรรทัด)"><Textarea rows={4} value={form.analyteScope} onChange={(event) => setForm({ ...form, analyteScope: event.target.value })} placeholder={'HLA-B75 serogroup\nHLA-B*58:01 allele\nHLA-B*57:01 allele'} /></Field></div><div className="col-span-2 flex gap-2"><Button>{editingId ? 'บันทึกการแก้ไข' : 'เพิ่ม scheme'}</Button>{editingId ? <Button type="button" variant="ghost" onClick={reset}>ยกเลิก</Button> : null}</div></form><div className="mt-3 space-y-1">{data.schemes.map((scheme) => <div key={scheme.id} className="flex justify-between rounded border border-[#e3ebec] p-2 text-sm"><span>{scheme.providerName} · {scheme.name}</span><div className="flex gap-1"><Button variant="ghost" className="min-h-7 px-2" title="แก้ไข scheme" onClick={() => edit(scheme)}><Pencil className="size-3.5" /></Button><Button variant="danger" className="min-h-7 px-2" title="ลบ scheme" onClick={() => remove(scheme.id)}><Trash2 className="size-3.5" /></Button></div></div>)}</div></Card>
}

function RoundManager({ data, onOk, onErr }: { data: EqaWorkspace; onOk: Update; onErr: (text: string) => void }) {
  const [form, setForm] = useState({ planItemId: '', roundLabel: '', resultDueDate: '' })
  const [showRounds, setShowRounds] = useState(false)
  const items = data.annualPlans.flatMap((plan) => plan.items.map((item) => ({ ...item, year: plan.planYear })))
  async function create(event: React.FormEvent) { event.preventDefault(); try { const result = await api<{ eqa: EqaWorkspace }>('/api/eqa/rounds', { method: 'POST', body: JSON.stringify({ ...form, resultDueDate: form.resultDueDate || null }) }); setForm({ planItemId: '', roundLabel: '', resultDueDate: '' }); onOk('เพิ่ม round แล้ว', result.eqa) } catch (error) { onErr(error instanceof Error ? error.message : 'บันทึกไม่สำเร็จ') } }
  async function edit(round: EqaRound) { const roundLabel = window.prompt('ชื่อ round:', round.roundLabel); if (!roundLabel?.trim()) return; try { const result = await api<{ eqa: EqaWorkspace }>(`/api/eqa/rounds/${round.id}`, { method: 'PATCH', body: JSON.stringify({ roundLabel }) }); onOk('แก้ไข round แล้ว', result.eqa) } catch (error) { onErr(error instanceof Error ? error.message : 'แก้ไขไม่สำเร็จ') } }
  async function remove(id: string) { if (!window.confirm('ลบ round ใช่ไหม?')) return; try { const result = await api<{ eqa: EqaWorkspace }>(`/api/eqa/rounds/${id}`, { method: 'DELETE' }); onOk('ลบ round แล้ว', result.eqa) } catch (error) { onErr(error instanceof Error ? error.message : 'ลบไม่สำเร็จ') } }
  return <Card className="p-4"><h2 className="font-bold">Round</h2><p className="mt-1 text-xs text-[#8ba0a5]">รอบส่วนใหญ่สร้างอัตโนมัติจากแท็บแผนรายปีได้ — ใช้ฟอร์มนี้เฉพาะ round นอกแผนหรือกรณีพิเศษ</p><form className="mt-3 grid grid-cols-2 gap-2" onSubmit={create}><Field label="รายการในแผน"><Select value={form.planItemId} onChange={(event) => setForm({ ...form, planItemId: event.target.value })} required><option value="">—</option>{items.map((item) => <option key={item.id} value={item.id}>{item.year + 543} · {item.sampleSetName}</option>)}</Select></Field><Field label="Round label"><Input value={form.roundLabel} onChange={(event) => setForm({ ...form, roundLabel: event.target.value })} required /></Field><Field label="กำหนดส่ง"><Input type="date" value={form.resultDueDate} onChange={(event) => setForm({ ...form, resultDueDate: event.target.value })} /></Field><Button>เพิ่ม round</Button></form><div className="mt-3 border-t border-[#e3ebec] pt-3"><Button type="button" variant="ghost" className="min-h-8 px-2 text-xs" onClick={() => setShowRounds(!showRounds)} aria-expanded={showRounds}>{showRounds ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}{showRounds ? 'ซ่อน Round ทั้งหมด' : `แสดง Round ทั้งหมด (${data.rounds.length})`}</Button>{showRounds ? <div className="mt-2 space-y-1">{data.rounds.map((round) => <div key={round.id} className="flex justify-between rounded border p-2 text-sm"><span>{round.planItemName ?? 'ยังไม่จัดเข้าปี'} · {round.roundLabel}</span><div className="flex gap-1"><Button variant="ghost" className="min-h-7 px-2" title="แก้ไข round" onClick={() => edit(round)}><Pencil className="size-3.5" /></Button><Button variant="danger" className="min-h-7 px-2" title="ลบ round" onClick={() => remove(round.id)}><Trash2 className="size-3.5" /></Button></div></div>)}</div> : null}</div></Card>
}

function ApproverManager({ data, onOk, onErr }: { data: EqaWorkspace; actor: BmActor; onOk: Update; onErr: (text: string) => void }) {
  const initial = useMemo(() => Object.fromEntries(APPROVAL_ROLES.map((role) => [role, data.approverAssignments.find((assignment) => assignment.approvalRole === role)?.userId ?? ''])) as Record<EqaAssignedApprovalRole, string>, [data.approverAssignments])
  const [values, setValues] = useState(initial)
  async function save(role: EqaAssignedApprovalRole) { if (!values[role]) return; try { const result = await api<{ eqa: EqaWorkspace }>('/api/eqa/approver-assignments', { method: 'PUT', body: JSON.stringify({ approvalRole: role, userId: values[role] }) }); onOk('กำหนดผู้อนุมัติแล้ว', result.eqa) } catch (error) { onErr(error instanceof Error ? error.message : 'บันทึกไม่สำเร็จ') } }
  return <Card className="p-4"><h2 className="font-bold">การกำหนดบัญชีผู้ลงนาม</h2><p className="mt-1 text-xs leading-5 text-[#789097]">กำหนดเฉพาะบทบาทที่มีบัญชีในระบบก็ได้ หากหัวหน้างานหรือผู้จัดการคุณภาพไม่มีบัญชี ให้เว้นว่าง แล้วผู้ปฏิบัติงานใช้เครื่องนี้กรอกชื่อจริงและวาดลายเซ็นแทน</p><div className="mt-3 space-y-3">{APPROVAL_ROLES.map((role) => <div key={role} className="grid grid-cols-[1fr_auto] items-end gap-2"><Field label={EQA_APPROVAL_ROLE_LABELS[role]}><UserSelect users={data.users} value={values[role]} onChange={(value) => setValues({ ...values, [role]: value })} /></Field><Button variant="secondary" onClick={() => save(role)}>บันทึก</Button></div>)}</div></Card>
}
