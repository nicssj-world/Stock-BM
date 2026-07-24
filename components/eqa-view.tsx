'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { CalendarClock, CheckCircle2, ClipboardList, FileText, Pencil, Plus, Printer, Settings, Trash2, X } from 'lucide-react'
import type { BmActor } from '@/lib/bm/types'
import type {
  EqaAnnualPlan, EqaAnnualSummary, EqaApprovalRole, EqaAssignedApprovalRole, EqaDocumentApproval,
  EqaDocumentState, EqaDocumentType, EqaPlanItem, EqaResult, EqaRound, EqaWorkspace,
} from '@/lib/eqa/types'
import { EQA_APPROVAL_ROLE_LABELS } from '@/lib/eqa/types'
import { formatDate, formatDateTime } from '@/lib/bm/rules'
import { api, Button, Card, Field, Input, Notice, PageHeader, Select, StatCard, StatusBadge, Tabs, Textarea, type StatusTone } from '@/components/ui'
import { AttachmentList } from '@/components/attachments'

type Tab = 'plans' | 'rounds' | 'corrective' | 'reports' | 'manage'
type NoticeState = { tone: 'success' | 'danger'; text: string } | null
type Update = (text: string, data: EqaWorkspace) => void

const APPROVAL_ROLES: EqaAssignedApprovalRole[] = ['technical-manager', 'quality-manager', 'section-head', 'department-head']
const STATUS_TONE: Record<string, StatusTone> = { scheduled: 'neutral', received: 'warning', submitted: 'accepted', evaluated: 'accepted', closed: 'neutral' }
const OUTCOME_TONE: Record<string, StatusTone> = { acceptable: 'accepted', warning: 'warning', unacceptable: 'rejected', 'not-evaluated': 'neutral' }
const THAI_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']

export function EqaView({ actor, initialData }: { actor: BmActor; initialData: EqaWorkspace }) {
  const [data, setData] = useState(initialData)
  const [tab, setTab] = useState<Tab>('plans')
  const [notice, setNotice] = useState<NoticeState>(null)
  const isAdmin = actor.role === 'Admin'
  const ok: Update = (text, next) => { setData(next); setNotice({ tone: 'success', text }) }
  const err = (text: string) => setNotice({ tone: 'danger', text })
  const reminders = data.rounds.filter((round) => round.reminder)
  const tabs = [
    { key: 'plans' as const, label: 'แผนรายปี', icon: CalendarClock },
    { key: 'rounds' as const, label: 'รอบ / ผล', icon: ClipboardList },
    { key: 'corrective' as const, label: 'Corrective action', icon: CheckCircle2 },
    { key: 'reports' as const, label: 'รายงาน', icon: FileText },
    ...(isAdmin ? [{ key: 'manage' as const, label: 'จัดการ', icon: Settings }] : []),
  ]

  return (
    <div className="mx-auto max-w-[1500px] space-y-5">
      <PageHeader eyebrow="External Quality Assessment" title="EQA" description="แผนรายปี การรับตัวอย่าง ผลประเมิน CAPA การอนุมัติ และรายงาน Fm-QP-LAB-19" />
      {notice ? <Notice tone={notice.tone}>{notice.text}</Notice> : null}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="แผนรายปี" value={data.annualPlans.length} />
        <StatCard label="Schemes" value={data.summary.schemeCount} />
        <StatCard label="ใกล้ครบกำหนด" value={data.summary.dueSoon} tone={data.summary.dueSoon ? 'warning' : 'neutral'} />
        <StatCard label="เลยกำหนด" value={data.summary.overdue} tone={data.summary.overdue ? 'rejected' : 'neutral'} />
        <StatCard label="CAPA ค้าง" value={data.summary.openCorrectiveActions} tone={data.summary.openCorrectiveActions ? 'warning' : 'neutral'} />
      </div>
      {reminders.length ? <Card className="flex flex-wrap gap-2 p-3">{reminders.map((round) => <StatusBadge key={round.id} tone={round.reminder === 'overdue' ? 'rejected' : 'warning'} label={`${round.planItemName ?? round.schemeName} · ${round.roundLabel} · ${round.reminder === 'overdue' ? `เลย ${Math.abs(round.dueInDays ?? 0)} วัน` : `อีก ${round.dueInDays} วัน`}`} />)}</Card> : null}
      <Tabs tabs={tabs} active={tab} onChange={setTab} />
      {tab === 'plans' ? <PlansTab data={data} actor={actor} onOk={ok} onErr={err} /> : null}
      {tab === 'rounds' ? <RoundsTab data={data} actor={actor} onOk={ok} onErr={err} /> : null}
      {tab === 'corrective' ? <CorrectiveTab data={data} onOk={ok} onErr={err} /> : null}
      {tab === 'reports' ? <ReportsTab data={data} actor={actor} onOk={ok} onErr={err} /> : null}
      {tab === 'manage' && isAdmin ? <ManageTab data={data} actor={actor} onOk={ok} onErr={err} /> : null}
    </div>
  )
}

function ApprovalPanel({ actor, data, type, entityId, state, approvals, readiness, analystId, onOk, onErr }: {
  actor: BmActor; data: EqaWorkspace; type: EqaDocumentType; entityId: string; state: EqaDocumentState; approvals: EqaDocumentApproval[]; readiness: string[]; analystId?: string | null; onOk: Update; onErr: (text: string) => void
}) {
  const roles: EqaApprovalRole[] = type === 'round-receipt' ? ['analyst', 'technical-manager'] : APPROVAL_ROLES
  const [busyRole, setBusyRole] = useState<EqaApprovalRole | null>(null)
  async function mutate(role: EqaApprovalRole, method: 'POST' | 'DELETE') {
    setBusyRole(role)
    try {
      const result = await api<{ eqa: EqaWorkspace }>(`/api/eqa/documents/${type}/${entityId}/approvals`, { method, body: JSON.stringify({ approvalRole: role }) })
      onOk(method === 'POST' ? 'ยืนยันเอกสารแล้ว' : 'ถอนการยืนยันแล้ว', result.eqa)
    } catch (error) { onErr(error instanceof Error ? error.message : 'ดำเนินการไม่สำเร็จ') } finally { setBusyRole(null) }
  }
  function canApprove(role: EqaApprovalRole) {
    if (role === 'analyst') return analystId === actor.id
    return data.approverAssignments.some((assignment) => assignment.approvalRole === role && assignment.userId === actor.id)
  }
  return (
    <div className="mt-3 rounded-md border border-[#dfe9ea] bg-[#f9fcfc] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-bold text-[#315763]">การอนุมัติ · revision {state.revision}</p>
        <StatusBadge tone={state.status === 'approved' ? 'accepted' : 'warning'} label={state.status === 'approved' ? 'อนุมัติครบ' : 'ฉบับร่าง'} />
      </div>
      {readiness.length ? <ul className="mt-2 list-disc pl-5 text-xs text-[#a9700f]">{readiness.map((issue) => <li key={issue}>{issue}</li>)}</ul> : <p className="mt-2 text-xs text-[#087f75]">ข้อมูลพร้อมสำหรับการยืนยัน</p>}
      <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {roles.map((role) => {
          const approval = approvals.find((item) => item.approvalRole === role)
          return <div key={role} className="rounded border border-[#e1eaea] bg-white p-2 text-xs">
            <p className="font-bold text-[#315763]">{EQA_APPROVAL_ROLE_LABELS[role]}</p>
            <p className="mt-1 min-h-8 text-[#789097]">{approval ? `${approval.approvedByName} · ${formatDateTime(approval.approvedAt)}` : 'ยังไม่ยืนยัน'}</p>
            {approval && (approval.approvedById === actor.id || actor.role === 'Admin') ? <Button variant="ghost" className="mt-1 min-h-7 px-2 py-1 text-xs" disabled={busyRole === role} onClick={() => mutate(role, 'DELETE')}>ถอน</Button> : null}
            {!approval && canApprove(role) ? <Button className="mt-1 min-h-7 px-2 py-1 text-xs" disabled={Boolean(readiness.length) || busyRole === role} onClick={() => mutate(role, 'POST')}>ยืนยัน</Button> : null}
          </div>
        })}
      </div>
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
    {actor.role === 'Admin' ? <Card className="p-4"><form className="flex max-w-md items-end gap-2" onSubmit={createPlan}><div className="flex-1"><Field label="สร้างแผนปี ค.ศ."><Input type="number" min="2000" max="2200" value={planYear} onChange={(event) => setPlanYear(event.target.value)} /></Field></div><Button disabled={busy}><Plus className="size-4" /> สร้างแผน</Button></form></Card> : null}
    {data.annualPlans.map((plan) => <Card key={plan.id} className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-2"><div><h2 className="text-lg font-bold text-[#173d50]">แผน EQA ประจำปี {plan.planYear + 543}</h2><p className="text-xs text-[#789097]">{plan.workSection} · {plan.departmentName} · {plan.organizationName}</p></div><Link className="inline-flex items-center gap-1 rounded-md border border-[#b8c8cc] bg-white px-3 py-2 text-xs font-bold text-[#173d50]" href={`/eqa/report/annual-plan/${plan.id}`}><Printer className="size-4" /> Fm-QP-LAB-19/01</Link></div>
      <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[900px] text-left text-xs"><thead className="bg-[#f3f8f8] text-[#55727c]"><tr><th className="p-2">โครงการ/ชุดตัวอย่าง</th><th className="p-2">Provider</th><th className="p-2">รายการทดสอบ</th><th className="p-2">ความถี่</th><th className="p-2">เดือน/ผู้รับผิดชอบ</th><th className="p-2">สถานะ</th>{actor.role === 'Admin' ? <th className="p-2">จัดการ</th> : null}</tr></thead><tbody className="divide-y divide-[#e8eeee]">{plan.items.map((item) => <tr key={item.id}><td className="p-2 font-semibold">{item.sampleSetName}{item.externalCode ? ` (${item.externalCode})` : ''}</td><td className="p-2">{item.providerName}</td><td className="p-2">{item.testItem}</td><td className="p-2">{item.expectedRounds ? `${item.expectedRounds} ครั้ง/ปี` : '-'}</td><td className="p-2">{item.occurrences.map((occurrence) => `${THAI_MONTHS[occurrence.plannedMonth - 1]} ${occurrence.responsibleCode}`).join(', ') || '-'}</td><td className="p-2">{data.annualSummaries.find((summary) => summary.planItem.id === item.id)?.readiness.length ? <StatusBadge tone="warning" label="ยังไม่ครบ" /> : <StatusBadge tone="accepted" label="พร้อมสรุป" />}</td>{actor.role === 'Admin' ? <td className="p-2"><div className="flex gap-1"><Button variant="ghost" className="min-h-7 px-2 py-1" onClick={() => setEditing(item)} title="แก้ไขรายการแผน"><Pencil className="size-3.5" /></Button><DeletePlanItemButton item={item} onOk={onOk} onErr={onErr} /></div></td> : null}</tr>)}</tbody></table></div>
      {actor.role === 'Admin' ? <PlanItemForm key={editing?.id ?? `new-${plan.id}`} plan={plan} editing={editing?.planId === plan.id ? editing : null} data={data} onCancel={() => setEditing(null)} onOk={(text, next) => { setEditing(null); onOk(text, next) }} onErr={onErr} /> : null}
      <ApprovalPanel actor={actor} data={data} type="annual-plan" entityId={plan.id} state={plan.documentState} approvals={plan.approvals} readiness={plan.readiness} onOk={onOk} onErr={onErr} />
    </Card>)}
    {!data.annualPlans.length ? <Card className="p-8 text-center text-sm text-[#8198a0]">ยังไม่มีแผนรายปี</Card> : null}
  </div>
}

function DeletePlanItemButton({ item, onOk, onErr }: { item: EqaPlanItem; onOk: Update; onErr: (text: string) => void }) {
  const [busy, setBusy] = useState(false)
  async function remove() { if (!window.confirm(`ลบรายการ ${item.sampleSetName} ใช่ไหม?`)) return; setBusy(true); try { const result = await api<{ eqa: EqaWorkspace }>(`/api/eqa/plan-items/${item.id}`, { method: 'DELETE' }); onOk('ลบรายการแผนแล้ว', result.eqa) } catch (error) { onErr(error instanceof Error ? error.message : 'ลบไม่สำเร็จ') } finally { setBusy(false) } }
  return <Button variant="danger" className="min-h-7 px-2 py-1" disabled={busy} onClick={remove} title="ลบรายการแผน"><Trash2 className="size-3.5" /></Button>
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
  function selectScheme(schemeId: string) {
    const scheme = data.schemes.find((item) => item.id === schemeId)
    const equipmentIds = scheme?.equipment.map((equipment) => equipment.id) ?? []
    setSelectedEquipmentIds(equipmentIds)
    setForm((current) => ({ ...current, schemeId, projectName: current.projectName || scheme?.name || '', providerName: current.providerName || scheme?.providerName || '', sampleSetName: current.sampleSetName || scheme?.code || scheme?.name || '', testItem: current.testItem || scheme?.analyteScope || '', expectedRounds: current.expectedRounds || (scheme?.roundsPerYear ? String(scheme.roundsPerYear) : ''), equipmentName: scheme?.equipment.map((equipment) => equipment.name).join(', ') || '' }))
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
  return <form onSubmit={submit} className="mt-4 space-y-3 rounded-md border border-[#dfe8e9] bg-[#fbfdfd] p-3">
    <div className="flex items-center justify-between"><h3 className="font-bold text-[#315763]">{editing ? `แก้ไข ${editing.sampleSetName}` : 'เพิ่มรายการในแผน'}</h3>{editing ? <Button type="button" variant="ghost" className="min-h-8 px-2" onClick={onCancel}><X className="size-4" /></Button> : null}</div>
    <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4"><Field label="Scheme"><Select value={form.schemeId} onChange={(event) => selectScheme(event.target.value)} required><option value="">—</option>{data.schemes.map((scheme) => <option key={scheme.id} value={scheme.id}>{scheme.providerName} · {scheme.name}</option>)}</Select></Field><Field label="ชื่อโครงการ"><Input value={form.projectName} onChange={(event) => setForm({ ...form, projectName: event.target.value })} required /></Field><Field label="หน่วยงานผู้จัดส่ง"><Input value={form.providerName} onChange={(event) => setForm({ ...form, providerName: event.target.value })} required /></Field><Field label="ชื่อชุดตัวอย่าง"><Input value={form.sampleSetName} onChange={(event) => setForm({ ...form, sampleSetName: event.target.value })} required /></Field><Field label="รหัสภายนอก"><Input value={form.externalCode} onChange={(event) => setForm({ ...form, externalCode: event.target.value })} /></Field><Field label="รายการทดสอบ"><Input value={form.testItem} onChange={(event) => setForm({ ...form, testItem: event.target.value })} required /></Field><Field label="จำนวนครั้ง/ปี"><Input type="number" min="1" value={form.expectedRounds} onChange={(event) => setForm({ ...form, expectedRounds: event.target.value })} /></Field><Field label="ราคา (บาท)"><Input type="number" min="0" step="0.01" value={form.price} onChange={(event) => setForm({ ...form, price: event.target.value })} /></Field><div className="xl:col-span-2"><span className="mb-1 block text-xs font-semibold text-[#58747d]">เครื่องมือจากฐานข้อมูล</span><div className="min-h-10 rounded-md border border-[#cfdee0] bg-white px-3 py-2">{data.schemes.find((scheme) => scheme.id === form.schemeId)?.equipment.length ? <div className="space-y-1">{data.schemes.find((scheme) => scheme.id === form.schemeId)?.equipment.map((equipment) => <label key={equipment.id} className="flex items-center gap-2 text-sm text-[#173d50]"><input type="checkbox" checked={selectedEquipmentIds.includes(equipment.id)} onChange={() => toggleEquipment(equipment.id)} className="size-4 accent-[#0b7f76]" /><Link href={`/equipment?view=registry&equipment=${equipment.id}`} className="truncate hover:underline" target="_blank">{equipment.code} · {equipment.name}</Link><span className="text-[11px] text-[#8ba0a5]">({equipment.status})</span></label>)}</div> : <p className="text-xs text-[#8ba0a5]">ยังไม่มีเครื่องมือที่ผูกกับ Scheme นี้ · เชื่อมจากทะเบียนเครื่องมือก่อน</p>}</div></div><Field label="ลำดับ"><Input type="number" value={form.sortOrder} onChange={(event) => setForm({ ...form, sortOrder: event.target.value })} /></Field><div className="flex items-center gap-4 self-end text-sm"><label className="flex items-center gap-2"><input type="checkbox" checked={form.maintenanceBudget} onChange={(event) => setForm({ ...form, maintenanceBudget: event.target.checked })} /> เงินบำรุง</label><label className="flex items-center gap-2"><input type="checkbox" checked={form.tor} onChange={(event) => setForm({ ...form, tor: event.target.checked })} /> TOR</label></div></div>
    <Field label="เกณฑ์การประเมิน"><Textarea rows={4} value={form.evaluationCriteria} onChange={(event) => setForm({ ...form, evaluationCriteria: event.target.value })} /></Field><Field label="หมายเหตุ"><Textarea rows={2} value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} /></Field>
    <div><div className="flex items-center justify-between"><p className="text-xs font-bold text-[#55727c]">เดือนตามแผน / ผู้รับผิดชอบ</p><Button type="button" variant="secondary" className="min-h-8 px-2 py-1 text-xs" onClick={() => setOccurrences([...occurrences, { plannedMonth: '1', responsibleUserId: '', responsibleCode: '' }])}><Plus className="size-3.5" /> เพิ่มเดือน</Button></div><div className="mt-2 grid gap-2 md:grid-cols-2">{occurrences.map((occurrence, index) => <div key={`${index}-${occurrence.plannedMonth}`} className="grid grid-cols-[110px_1fr_90px_auto] gap-1"><Select value={occurrence.plannedMonth} onChange={(event) => setOccurrences(occurrences.map((item, itemIndex) => itemIndex === index ? { ...item, plannedMonth: event.target.value } : item))}>{THAI_MONTHS.map((month, monthIndex) => <option key={month} value={monthIndex + 1}>{month}</option>)}</Select><Select value={occurrence.responsibleUserId} onChange={(event) => setOccurrences(occurrences.map((item, itemIndex) => itemIndex === index ? { ...item, responsibleUserId: event.target.value } : item))}><option value="">— ผู้รับผิดชอบ —</option>{data.users.map((user) => <option key={user.id} value={user.id}>{user.displayName}</option>)}</Select><Input placeholder="รหัสย่อ" value={occurrence.responsibleCode} onChange={(event) => setOccurrences(occurrences.map((item, itemIndex) => itemIndex === index ? { ...item, responsibleCode: event.target.value } : item))} required /><Button type="button" variant="ghost" className="px-2" onClick={() => setOccurrences(occurrences.filter((_, itemIndex) => itemIndex !== index))}><X className="size-4" /></Button></div>)}</div></div>
    <Button disabled={busy}>{editing ? 'บันทึกแก้ไข' : 'เพิ่มรายการ'}</Button>
  </form>
}

function RoundsTab({ data, actor, onOk, onErr }: { data: EqaWorkspace; actor: BmActor; onOk: Update; onErr: (text: string) => void }) {
  if (!data.rounds.length) return <Card className="p-8 text-center text-sm text-[#8198a0]">ยังไม่มี round — Admin สร้างจากแท็บจัดการ</Card>
  return <div className="space-y-4">{data.rounds.map((round) => <RoundCard key={round.id} round={round} data={data} actor={actor} onOk={onOk} onErr={onErr} />)}</div>
}

function RoundCard({ round, data, actor, onOk, onErr }: { round: EqaRound; data: EqaWorkspace; actor: BmActor; onOk: Update; onErr: (text: string) => void }) {
  const [showReceipt, setShowReceipt] = useState(false)
  const [busy, setBusy] = useState(false)
  const [resultForm, setResultForm] = useState({ analyte: '', sampleCode: '', submittedValue: '', unit: '', ctValue: '', assignedValue: '', evaluationScore: '', outcome: 'not-evaluated', iqcAnalyteId: '' })
  const [editingResult, setEditingResult] = useState<EqaResult | null>(null)
  const [summaryOutcome, setSummaryOutcome] = useState(round.summaryOutcome)
  const [summaryNote, setSummaryNote] = useState(round.summaryNote ?? '')
  async function setStatus(status: string) { try { const result = await api<{ eqa: EqaWorkspace }>(`/api/eqa/rounds/${round.id}`, { method: 'PATCH', body: JSON.stringify({ status }) }); onOk('อัปเดตสถานะแล้ว', result.eqa) } catch (error) { onErr(error instanceof Error ? error.message : 'อัปเดตไม่สำเร็จ') } }
  function editResult(result: EqaResult) { setEditingResult(result); setResultForm({ analyte: result.analyte, sampleCode: result.sampleCode ?? '', submittedValue: result.submittedValue ?? '', unit: result.unit ?? '', ctValue: result.ctValue == null ? '' : String(result.ctValue), assignedValue: result.assignedValue == null ? '' : String(result.assignedValue), evaluationScore: result.evaluationScore == null ? '' : String(result.evaluationScore), outcome: result.outcome, iqcAnalyteId: result.iqcAnalyteId ?? '' }) }
  function resetResult() { setEditingResult(null); setResultForm({ analyte: '', sampleCode: '', submittedValue: '', unit: '', ctValue: '', assignedValue: '', evaluationScore: '', outcome: 'not-evaluated', iqcAnalyteId: '' }) }
  async function saveResult(event: React.FormEvent) { event.preventDefault(); setBusy(true); const body = { ...resultForm, sampleCode: resultForm.sampleCode || null, submittedValue: resultForm.submittedValue || null, unit: resultForm.unit || null, ctValue: resultForm.ctValue ? Number(resultForm.ctValue) : null, assignedValue: resultForm.assignedValue ? Number(resultForm.assignedValue) : null, evaluationScore: resultForm.evaluationScore ? Number(resultForm.evaluationScore) : null, iqcAnalyteId: resultForm.iqcAnalyteId || null }; try { const result = await api<{ eqa: EqaWorkspace }>(editingResult ? `/api/eqa/results/${editingResult.id}` : '/api/eqa/results', { method: editingResult ? 'PATCH' : 'POST', body: JSON.stringify(editingResult ? body : { roundId: round.id, ...body }) }); onOk(editingResult ? 'แก้ไขผลแล้ว' : 'เพิ่มผลแล้ว', result.eqa); resetResult() } catch (error) { onErr(error instanceof Error ? error.message : 'บันทึกผลไม่สำเร็จ') } finally { setBusy(false) } }
  async function removeResult(result: EqaResult) { if (!window.confirm(`ลบผล ${result.sampleCode ?? result.analyte} ใช่ไหม?`)) return; try { const response = await api<{ eqa: EqaWorkspace }>(`/api/eqa/results/${result.id}`, { method: 'DELETE' }); onOk('ลบผลแล้ว', response.eqa) } catch (error) { onErr(error instanceof Error ? error.message : 'ลบผลไม่สำเร็จ') } }
  async function saveSummary() { try { const result = await api<{ eqa: EqaWorkspace }>(`/api/eqa/rounds/${round.id}/summary`, { method: 'PATCH', body: JSON.stringify({ summaryOutcome, summaryNote: summaryNote || null }) }); onOk('บันทึกสรุปผลรอบแล้ว', result.eqa) } catch (error) { onErr(error instanceof Error ? error.message : 'บันทึกไม่สำเร็จ') } }
  return <Card className="p-4">
    <div className="flex flex-wrap items-start justify-between gap-2"><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-bold text-[#173d50]">{round.planItemName ?? round.schemeName} · {round.roundLabel}</h3><StatusBadge tone={STATUS_TONE[round.status]} label={round.status} />{!round.planItemId ? <StatusBadge tone="warning" label="ยังไม่จัดเข้าปี" /> : null}</div><p className="mt-1 text-xs text-[#789097]">{round.providerName} · ปี {round.planYear ? round.planYear + 543 : '-'} · รับ {formatDate(round.sampleReceivedDate)} · ส่ง {formatDate(round.submissionDate)}</p></div><div className="flex flex-wrap gap-2"><Button variant="secondary" className="min-h-9 px-3 text-xs" onClick={() => setShowReceipt(!showReceipt)}>{showReceipt ? 'ซ่อนแบบรับ' : 'กรอกแบบรับตัวอย่าง'}</Button><Link href={`/eqa/report/round-receipt/${round.id}`} className="inline-flex items-center gap-1 rounded-md border border-[#b8c8cc] bg-white px-3 py-2 text-xs font-bold text-[#173d50]"><Printer className="size-4" /> Fm-QP-LAB-19/02</Link><Select className="h-9 w-36" value={round.status} onChange={(event) => setStatus(event.target.value)}><option value="scheduled">scheduled</option><option value="received">received</option><option value="submitted">submitted</option><option value="evaluated">evaluated</option><option value="closed">closed</option></Select></div></div>
    {showReceipt ? <ReceiptEditor round={round} data={data} onOk={onOk} onErr={onErr} /> : null}
    {round.results.length ? <div className="mt-3 overflow-x-auto rounded-md border border-[#e9eff0]"><table className="w-full min-w-[850px] text-left text-xs"><thead className="bg-[#f6fafa] text-[#55727c]"><tr><th className="p-2">Sample</th><th className="p-2">Analyte</th><th className="p-2">Submitted</th><th className="p-2">Ct</th><th className="p-2">Assigned</th><th className="p-2">Score</th><th className="p-2">Outcome</th><th className="p-2">Action</th></tr></thead><tbody className="divide-y divide-[#eef3f3]">{round.results.map((result) => <tr key={result.id}><td className="p-2 font-semibold">{result.sampleCode ?? '-'}</td><td className="p-2">{result.analyte}</td><td className="p-2">{result.submittedValue ?? '-'} {result.unit ?? ''}</td><td className="p-2">{result.ctValue ?? '-'}</td><td className="p-2">{result.assignedValue ?? '-'}</td><td className="p-2">{result.evaluationScore ?? '-'}</td><td className="p-2"><StatusBadge tone={OUTCOME_TONE[result.outcome]} label={result.outcome} /></td><td className="p-2"><div className="flex gap-1"><Button variant="ghost" className="min-h-7 px-2 py-1" onClick={() => editResult(result)}><Pencil className="size-3.5" /></Button><Button variant="danger" className="min-h-7 px-2 py-1" onClick={() => removeResult(result)}><Trash2 className="size-3.5" /></Button></div></td></tr>)}</tbody></table></div> : null}
    <form onSubmit={saveResult} className="mt-3 grid items-end gap-2 md:grid-cols-4 xl:grid-cols-10"><Field label="Sample code"><Input value={resultForm.sampleCode} onChange={(event) => setResultForm({ ...resultForm, sampleCode: event.target.value })} /></Field><Field label="Analyte"><Input value={resultForm.analyte} onChange={(event) => setResultForm({ ...resultForm, analyte: event.target.value })} required /></Field><Field label="IQC analyte"><Select value={resultForm.iqcAnalyteId} onChange={(event) => setResultForm({ ...resultForm, iqcAnalyteId: event.target.value })}><option value="">— ไม่ใช้ Sigma —</option>{data.iqcAnalytes.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</Select></Field><Field label="Submitted"><Input value={resultForm.submittedValue} onChange={(event) => setResultForm({ ...resultForm, submittedValue: event.target.value })} /></Field><Field label="Unit"><Input value={resultForm.unit} onChange={(event) => setResultForm({ ...resultForm, unit: event.target.value })} /></Field><Field label="Ct"><Input type="number" step="any" value={resultForm.ctValue} onChange={(event) => setResultForm({ ...resultForm, ctValue: event.target.value })} /></Field><Field label="Assigned"><Input type="number" step="any" value={resultForm.assignedValue} onChange={(event) => setResultForm({ ...resultForm, assignedValue: event.target.value })} /></Field><Field label="Score"><Input type="number" step="any" value={resultForm.evaluationScore} onChange={(event) => setResultForm({ ...resultForm, evaluationScore: event.target.value })} /></Field><Field label="Outcome"><Select value={resultForm.outcome} onChange={(event) => setResultForm({ ...resultForm, outcome: event.target.value })}><option value="not-evaluated">not-evaluated</option><option value="acceptable">acceptable</option><option value="warning">warning</option><option value="unacceptable">unacceptable</option></Select></Field><div className="flex gap-1"><Button disabled={busy}>{editingResult ? 'แก้ไข' : '+ ผล'}</Button>{editingResult ? <Button type="button" variant="ghost" className="px-2" onClick={resetResult}><X className="size-4" /></Button> : null}</div></form>
    <div className="mt-3 grid gap-2 md:grid-cols-[200px_1fr_auto]"><Field label="สรุปผลรอบ"><Select value={summaryOutcome} onChange={(event) => setSummaryOutcome(event.target.value as typeof summaryOutcome)}><option value="not-evaluated">ยังไม่ประเมิน</option><option value="pass">ผ่านเกณฑ์</option><option value="fail">ไม่ผ่านเกณฑ์</option></Select></Field><Field label="หมายเหตุ/การปรับปรุงแก้ไข"><Textarea rows={2} value={summaryNote} onChange={(event) => setSummaryNote(event.target.value)} /></Field><Button className="self-end" onClick={saveSummary}>บันทึกสรุป</Button></div>
    <div className="mt-3 grid gap-2 sm:grid-cols-2"><AttachmentList module="eqa" entityType="eqa-round-receipt" entityId={round.id} kind="eqa-receipt" canDelete={actor.role === 'Admin'} label="เอกสารรับตัวอย่างเดิม" /><AttachmentList module="eqa" entityType="eqa-round" entityId={round.id} kind="eqa-certificate" canDelete={actor.role === 'Admin'} label="Certificate / รายงานผล" /></div>
    <ApprovalPanel actor={actor} data={data} type="round-receipt" entityId={round.id} state={round.documentState} approvals={round.approvals} readiness={round.receiptReadiness} analystId={round.analystId} onOk={onOk} onErr={onErr} />
  </Card>
}

function ReceiptEditor({ round, data, onOk, onErr }: { round: EqaRound; data: EqaWorkspace; onOk: Update; onErr: (text: string) => void }) {
  const [form, setForm] = useState({ planItemId: round.planItemId ?? '', externalSentDate: round.externalSentDate ?? '', sampleReceivedDate: round.sampleReceivedDate ?? '', packageCondition: round.packageCondition ?? '', packageNote: round.packageNote ?? '', receivedTemperature: round.receivedTemperature ?? '', receivedTemperatureNote: round.receivedTemperatureNote ?? '', sampleCondition: round.sampleCondition ?? '', sampleConditionNote: round.sampleConditionNote ?? '', storageCondition: round.storageCondition ?? '', storageTemperatureC: round.storageTemperatureC == null ? '' : String(round.storageTemperatureC), storageNote: round.storageNote ?? '', specimenType: round.specimenType ?? '', receiverId: round.receiverId ?? '', analystId: round.analystId ?? '', analysisDate: round.analysisDate ?? '', submissionDate: round.submissionDate ?? '', submissionMethod: round.submissionMethod ?? '', otherDetails: round.otherDetails ?? '' })
  const [busy, setBusy] = useState(false)
  async function submit(event: React.FormEvent) { event.preventDefault(); setBusy(true); const body = { ...form, externalSentDate: form.externalSentDate || null, sampleReceivedDate: form.sampleReceivedDate || null, packageCondition: form.packageCondition || null, packageNote: form.packageNote || null, receivedTemperature: form.receivedTemperature || null, receivedTemperatureNote: form.receivedTemperatureNote || null, sampleCondition: form.sampleCondition || null, sampleConditionNote: form.sampleConditionNote || null, storageCondition: form.storageCondition || null, storageTemperatureC: form.storageTemperatureC ? Number(form.storageTemperatureC) : null, storageNote: form.storageNote || null, specimenType: form.specimenType || null, receiverId: form.receiverId || null, analystId: form.analystId || null, analysisDate: form.analysisDate || null, submissionDate: form.submissionDate || null, submissionMethod: form.submissionMethod || null, otherDetails: form.otherDetails || null }; try { const result = await api<{ eqa: EqaWorkspace }>(`/api/eqa/rounds/${round.id}/receipt`, { method: 'PATCH', body: JSON.stringify(body) }); onOk('บันทึกแบบรับตัวอย่างแล้ว', result.eqa) } catch (error) { onErr(error instanceof Error ? error.message : 'บันทึกไม่สำเร็จ') } finally { setBusy(false) } }
  const allItems = data.annualPlans.flatMap((plan) => plan.items.map((item) => ({ ...item, planYear: plan.planYear })))
  return <form onSubmit={submit} className="mt-3 space-y-3 rounded-md border border-[#dce7e8] bg-[#fbfdfd] p-3"><div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
    <Field label="รายการในแผนรายปี"><Select value={form.planItemId} onChange={(event) => setForm({ ...form, planItemId: event.target.value })} required><option value="">—</option>{allItems.map((item) => <option key={item.id} value={item.id}>{item.planYear + 543} · {item.sampleSetName}</option>)}</Select></Field>
    <Field label="วันที่องค์กรส่ง"><Input type="date" value={form.externalSentDate} onChange={(event) => setForm({ ...form, externalSentDate: event.target.value })} /></Field>
    <Field label="วันที่รับตัวอย่าง"><Input type="date" value={form.sampleReceivedDate} onChange={(event) => setForm({ ...form, sampleReceivedDate: event.target.value })} /></Field>
    <Field label="สภาพห่อ"><Select value={form.packageCondition} onChange={(event) => setForm({ ...form, packageCondition: event.target.value })}><option value="">—</option><option value="acceptable">เรียบร้อย</option><option value="unacceptable">ไม่เรียบร้อย</option></Select></Field>
    <Field label="รายละเอียดสภาพห่อ"><Input value={form.packageNote} onChange={(event) => setForm({ ...form, packageNote: event.target.value })} /></Field>
    <Field label="อุณหภูมิขณะรับ"><Select value={form.receivedTemperature} onChange={(event) => setForm({ ...form, receivedTemperature: event.target.value })}><option value="">—</option><option value="refrigerated">แช่เย็น</option><option value="room">อุณหภูมิห้อง</option><option value="other">อื่นๆ</option></Select></Field>
    <Field label="รายละเอียดอุณหภูมิ"><Input value={form.receivedTemperatureNote} onChange={(event) => setForm({ ...form, receivedTemperatureNote: event.target.value })} /></Field>
    <Field label="สภาพตัวอย่าง"><Select value={form.sampleCondition} onChange={(event) => setForm({ ...form, sampleCondition: event.target.value })}><option value="">—</option><option value="acceptable">เรียบร้อย</option><option value="unacceptable">ไม่เรียบร้อย</option></Select></Field>
    <Field label="รายละเอียดสภาพตัวอย่าง"><Input value={form.sampleConditionNote} onChange={(event) => setForm({ ...form, sampleConditionNote: event.target.value })} /></Field>
    <div className="xl:col-span-2">
      <span className="mb-1 block text-xs font-semibold text-[#58747d]">ระบุการเก็บตัวอย่าง</span>
      <div className="flex min-h-10 flex-wrap items-center gap-x-5 gap-y-2 rounded-md border border-[#cfdee0] bg-white px-3 py-2 text-sm text-[#173d50]">
        <label className="inline-flex flex-wrap items-center gap-2">
          <input type="checkbox" checked={form.storageCondition === 'refrigerated'} onChange={() => setForm({ ...form, storageCondition: form.storageCondition === 'refrigerated' ? '' : 'refrigerated' })} className="size-4 accent-[#0b7f76]" />
          <span>แช่เย็นที่อุณหภูมิ</span>
          <Input type="number" step="any" aria-label="อุณหภูมิที่เก็บตัวอย่าง" value={form.storageTemperatureC} onChange={(event) => setForm({ ...form, storageTemperatureC: event.target.value })} className="w-24 px-2 py-1" />
          <span>°C</span>
        </label>
        <label className="inline-flex items-center gap-2">
          <input type="checkbox" checked={form.storageCondition === 'room'} onChange={() => setForm({ ...form, storageCondition: form.storageCondition === 'room' ? '' : 'room' })} className="size-4 accent-[#0b7f76]" />
          <span>เก็บที่อุณหภูมิห้อง</span>
        </label>
      </div>
    </div>
    <Field label="ชนิดตัวอย่าง"><Input value={form.specimenType} onChange={(event) => setForm({ ...form, specimenType: event.target.value })} /></Field>
    <Field label="ผู้รับตัวอย่าง"><UserSelect users={data.users} value={form.receiverId} onChange={(value) => setForm({ ...form, receiverId: value })} /></Field>
    <Field label="ผู้ตรวจวิเคราะห์"><UserSelect users={data.users} value={form.analystId} onChange={(value) => setForm({ ...form, analystId: value })} /></Field>
    <Field label="วันที่ตรวจวิเคราะห์"><Input type="date" value={form.analysisDate} onChange={(event) => setForm({ ...form, analysisDate: event.target.value })} /></Field>
    <Field label="วันที่ส่งผล"><Input type="date" value={form.submissionDate} onChange={(event) => setForm({ ...form, submissionDate: event.target.value })} /></Field>
    <Field label="วิธีส่งผล"><Input value={form.submissionMethod} onChange={(event) => setForm({ ...form, submissionMethod: event.target.value })} /></Field>
  </div><Field label="รายละเอียดอื่นๆ"><Textarea rows={2} value={form.otherDetails} onChange={(event) => setForm({ ...form, otherDetails: event.target.value })} /></Field><Button disabled={busy}>บันทึกแบบรับตัวอย่าง</Button></form>
}

function UserSelect({ users, value, onChange }: { users: EqaWorkspace['users']; value: string; onChange: (value: string) => void }) { return <Select value={value} onChange={(event) => onChange(event.target.value)}><option value="">—</option>{users.map((user) => <option key={user.id} value={user.id}>{user.displayName}</option>)}</Select> }

function CorrectiveTab({ data, onOk, onErr }: { data: EqaWorkspace; onOk: Update; onErr: (text: string) => void }) {
  const [form, setForm] = useState({ roundId: '', problem: '', rootCause: '', actionTaken: '' })
  async function create(event: React.FormEvent) { event.preventDefault(); try { const result = await api<{ eqa: EqaWorkspace }>('/api/eqa/corrective-actions', { method: 'POST', body: JSON.stringify({ ...form, rootCause: form.rootCause || null, actionTaken: form.actionTaken || null }) }); setForm({ roundId: '', problem: '', rootCause: '', actionTaken: '' }); onOk('เปิด corrective action แล้ว', result.eqa) } catch (error) { onErr(error instanceof Error ? error.message : 'บันทึกไม่สำเร็จ') } }
  async function close(id: string) { try { const result = await api<{ eqa: EqaWorkspace }>(`/api/eqa/corrective-actions/${id}/close`, { method: 'POST', body: '{}' }); onOk('ปิด corrective action แล้ว', result.eqa) } catch (error) { onErr(error instanceof Error ? error.message : 'ปิดไม่สำเร็จ') } }
  return <div className="grid gap-4 lg:grid-cols-[360px_1fr]"><Card className="p-4"><h2 className="font-bold">เปิด corrective action</h2><form className="mt-3 space-y-3" onSubmit={create}><Field label="Round"><Select value={form.roundId} onChange={(event) => setForm({ ...form, roundId: event.target.value })} required><option value="">—</option>{data.rounds.map((round) => <option key={round.id} value={round.id}>{round.planItemName ?? round.schemeName} · {round.roundLabel}</option>)}</Select></Field><Field label="ปัญหา"><Textarea value={form.problem} onChange={(event) => setForm({ ...form, problem: event.target.value })} required /></Field><Field label="Root cause"><Textarea value={form.rootCause} onChange={(event) => setForm({ ...form, rootCause: event.target.value })} /></Field><Field label="Action taken"><Textarea value={form.actionTaken} onChange={(event) => setForm({ ...form, actionTaken: event.target.value })} /></Field><Button>บันทึก</Button></form></Card><div className="space-y-2">{data.correctiveActions.map((action) => <Card key={action.id} className="p-4"><div className="flex justify-between gap-3"><div><p className="font-bold">{action.roundLabel} <StatusBadge tone={action.status === 'open' ? 'warning' : 'accepted'} label={action.status} /></p><p className="mt-1 text-sm">{action.problem}</p>{action.rootCause ? <p className="text-xs text-[#789097]">Root cause: {action.rootCause}</p> : null}{action.actionTaken ? <p className="text-xs text-[#789097]">Action: {action.actionTaken}</p> : null}</div>{action.status === 'open' ? <Button variant="secondary" className="min-h-8 px-3 text-xs" onClick={() => close(action.id)}>ปิด</Button> : null}</div></Card>)}{!data.correctiveActions.length ? <Card className="p-8 text-center text-sm text-[#8198a0]">ยังไม่มี corrective action</Card> : null}</div></div>
}

function ReportsTab({ data, actor, onOk, onErr }: { data: EqaWorkspace; actor: BmActor; onOk: Update; onErr: (text: string) => void }) {
  return <div className="space-y-4">{data.annualPlans.map((plan) => <Card key={plan.id} className="p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="font-bold">ปี {plan.planYear + 543}</h2><p className="text-xs text-[#789097]">รายงานแผน 1 ฉบับ · สรุป {plan.items.length} scheme</p></div><Link href={`/eqa/report/annual-plan/${plan.id}`} className="inline-flex items-center gap-1 rounded-md border border-[#b8c8cc] px-3 py-2 text-xs font-bold"><Printer className="size-4" /> Fm-QP-LAB-19/01</Link></div><div className="mt-3 grid gap-3 lg:grid-cols-2">{plan.items.map((item) => { const summary = data.annualSummaries.find((record) => record.planItem.id === item.id); return summary ? <SummaryReportCard key={item.id} summary={summary} data={data} actor={actor} onOk={onOk} onErr={onErr} /> : null })}</div></Card>)}{!data.annualPlans.length ? <Card className="p-8 text-center text-sm text-[#8198a0]">ยังไม่มีรายงาน เพราะยังไม่ได้สร้างแผนรายปี</Card> : null}</div>
}

function SummaryReportCard({ summary, data, actor, onOk, onErr }: { summary: EqaAnnualSummary; data: EqaWorkspace; actor: BmActor; onOk: Update; onErr: (text: string) => void }) {
  return <div className="rounded-md border border-[#dfe8e9] p-3"><div className="flex items-start justify-between gap-2"><div><p className="font-bold text-[#315763]">{summary.planItem.sampleSetName}</p><p className="text-xs text-[#789097]">{summary.rounds.length}/{summary.planItem.expectedRounds ?? '-'} รอบ</p></div><Link href={`/eqa/report/annual-summary/${summary.planItem.id}`} className="inline-flex items-center gap-1 rounded border border-[#b8c8cc] px-2 py-1 text-xs font-bold"><Printer className="size-3.5" /> Fm-QP-LAB-19/04</Link></div><ApprovalPanel actor={actor} data={data} type="annual-summary" entityId={summary.planItem.id} state={summary.documentState} approvals={summary.approvals} readiness={summary.readiness} onOk={onOk} onErr={onErr} /></div>
}

function ManageTab({ data, actor, onOk, onErr }: { data: EqaWorkspace; actor: BmActor; onOk: Update; onErr: (text: string) => void }) {
  return <div className="grid gap-4 lg:grid-cols-2"><ProviderManager data={data} onOk={onOk} onErr={onErr} /><SchemeManager data={data} onOk={onOk} onErr={onErr} /><RoundManager data={data} onOk={onOk} onErr={onErr} /><ApproverManager data={data} actor={actor} onOk={onOk} onErr={onErr} /></div>
}

function ProviderManager({ data, onOk, onErr }: { data: EqaWorkspace; onOk: Update; onErr: (text: string) => void }) {
  const [name, setName] = useState('')
  async function create(event: React.FormEvent) { event.preventDefault(); try { const result = await api<{ eqa: EqaWorkspace }>('/api/eqa/providers', { method: 'POST', body: JSON.stringify({ name }) }); setName(''); onOk('เพิ่ม provider แล้ว', result.eqa) } catch (error) { onErr(error instanceof Error ? error.message : 'บันทึกไม่สำเร็จ') } }
  async function edit(id: string, current: string) { const name = window.prompt('ชื่อ provider:', current); if (!name?.trim()) return; try { const result = await api<{ eqa: EqaWorkspace }>(`/api/eqa/providers/${id}`, { method: 'PATCH', body: JSON.stringify({ name }) }); onOk('แก้ไข provider แล้ว', result.eqa) } catch (error) { onErr(error instanceof Error ? error.message : 'แก้ไขไม่สำเร็จ') } }
  return <Card className="p-4"><h2 className="font-bold">Provider</h2><form className="mt-3 flex items-end gap-2" onSubmit={create}><div className="flex-1"><Field label="ชื่อ provider"><Input value={name} onChange={(event) => setName(event.target.value)} required /></Field></div><Button>เพิ่ม</Button></form><div className="mt-3 space-y-1">{data.providers.map((provider) => <div key={provider.id} className="flex justify-between rounded border border-[#e3ebec] p-2 text-sm"><span>{provider.name}</span><Button variant="ghost" className="min-h-7 px-2" onClick={() => edit(provider.id, provider.name)}><Pencil className="size-3.5" /></Button></div>)}</div></Card>
}

function SchemeManager({ data, onOk, onErr }: { data: EqaWorkspace; onOk: Update; onErr: (text: string) => void }) {
  const [form, setForm] = useState({ providerId: '', name: '', code: '', analyteScope: '', roundsPerYear: '' })
  async function create(event: React.FormEvent) { event.preventDefault(); try { const result = await api<{ eqa: EqaWorkspace }>('/api/eqa/schemes', { method: 'POST', body: JSON.stringify({ ...form, code: form.code || null, analyteScope: form.analyteScope || null, roundsPerYear: form.roundsPerYear ? Number(form.roundsPerYear) : null }) }); setForm({ providerId: '', name: '', code: '', analyteScope: '', roundsPerYear: '' }); onOk('เพิ่ม scheme แล้ว', result.eqa) } catch (error) { onErr(error instanceof Error ? error.message : 'บันทึกไม่สำเร็จ') } }
  async function edit(scheme: EqaWorkspace['schemes'][number]) { const name = window.prompt('ชื่อ scheme:', scheme.name); if (!name?.trim()) return; try { const result = await api<{ eqa: EqaWorkspace }>(`/api/eqa/schemes/${scheme.id}`, { method: 'PATCH', body: JSON.stringify({ providerId: scheme.providerId, name, code: scheme.code, analyteScope: scheme.analyteScope, roundsPerYear: scheme.roundsPerYear }) }); onOk('แก้ไข scheme แล้ว', result.eqa) } catch (error) { onErr(error instanceof Error ? error.message : 'แก้ไขไม่สำเร็จ') } }
  async function remove(id: string) { if (!window.confirm('ลบ scheme ใช่ไหม?')) return; try { const result = await api<{ eqa: EqaWorkspace }>(`/api/eqa/schemes/${id}`, { method: 'DELETE' }); onOk('ลบ scheme แล้ว', result.eqa) } catch (error) { onErr(error instanceof Error ? error.message : 'ลบไม่สำเร็จ') } }
  return <Card className="p-4"><h2 className="font-bold">Scheme</h2><form className="mt-3 grid grid-cols-2 gap-2" onSubmit={create}><Field label="Provider"><Select value={form.providerId} onChange={(event) => setForm({ ...form, providerId: event.target.value })} required><option value="">—</option>{data.providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.name}</option>)}</Select></Field><Field label="ชื่อ scheme"><Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></Field><Field label="Code"><Input value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value })} /></Field><Field label="Rounds/ปี"><Input type="number" value={form.roundsPerYear} onChange={(event) => setForm({ ...form, roundsPerYear: event.target.value })} /></Field><div className="col-span-2"><Field label="Analyte scope"><Input value={form.analyteScope} onChange={(event) => setForm({ ...form, analyteScope: event.target.value })} /></Field></div><Button>เพิ่ม scheme</Button></form><div className="mt-3 space-y-1">{data.schemes.map((scheme) => <div key={scheme.id} className="flex justify-between rounded border border-[#e3ebec] p-2 text-sm"><span>{scheme.providerName} · {scheme.name}</span><div className="flex gap-1"><Button variant="ghost" className="min-h-7 px-2" title="แก้ไข scheme" onClick={() => edit(scheme)}><Pencil className="size-3.5" /></Button><Button variant="danger" className="min-h-7 px-2" title="ลบ scheme" onClick={() => remove(scheme.id)}><Trash2 className="size-3.5" /></Button></div></div>)}</div></Card>
}

function RoundManager({ data, onOk, onErr }: { data: EqaWorkspace; onOk: Update; onErr: (text: string) => void }) {
  const [form, setForm] = useState({ planItemId: '', roundLabel: '', sampleReceivedDate: '', resultDueDate: '' })
  const items = data.annualPlans.flatMap((plan) => plan.items.map((item) => ({ ...item, year: plan.planYear })))
  async function create(event: React.FormEvent) { event.preventDefault(); try { const result = await api<{ eqa: EqaWorkspace }>('/api/eqa/rounds', { method: 'POST', body: JSON.stringify({ ...form, sampleReceivedDate: form.sampleReceivedDate || null, resultDueDate: form.resultDueDate || null }) }); setForm({ planItemId: '', roundLabel: '', sampleReceivedDate: '', resultDueDate: '' }); onOk('เพิ่ม round แล้ว', result.eqa) } catch (error) { onErr(error instanceof Error ? error.message : 'บันทึกไม่สำเร็จ') } }
  async function edit(round: EqaRound) { const roundLabel = window.prompt('ชื่อ round:', round.roundLabel); if (!roundLabel?.trim()) return; try { const result = await api<{ eqa: EqaWorkspace }>(`/api/eqa/rounds/${round.id}`, { method: 'PATCH', body: JSON.stringify({ roundLabel }) }); onOk('แก้ไข round แล้ว', result.eqa) } catch (error) { onErr(error instanceof Error ? error.message : 'แก้ไขไม่สำเร็จ') } }
  async function remove(id: string) { if (!window.confirm('ลบ round ใช่ไหม?')) return; try { const result = await api<{ eqa: EqaWorkspace }>(`/api/eqa/rounds/${id}`, { method: 'DELETE' }); onOk('ลบ round แล้ว', result.eqa) } catch (error) { onErr(error instanceof Error ? error.message : 'ลบไม่สำเร็จ') } }
  return <Card className="p-4"><h2 className="font-bold">Round</h2><form className="mt-3 grid grid-cols-2 gap-2" onSubmit={create}><Field label="รายการในแผน"><Select value={form.planItemId} onChange={(event) => setForm({ ...form, planItemId: event.target.value })} required><option value="">—</option>{items.map((item) => <option key={item.id} value={item.id}>{item.year + 543} · {item.sampleSetName}</option>)}</Select></Field><Field label="Round label"><Input value={form.roundLabel} onChange={(event) => setForm({ ...form, roundLabel: event.target.value })} required /></Field><Field label="วันที่รับ"><Input type="date" value={form.sampleReceivedDate} onChange={(event) => setForm({ ...form, sampleReceivedDate: event.target.value })} /></Field><Field label="กำหนดส่ง"><Input type="date" value={form.resultDueDate} onChange={(event) => setForm({ ...form, resultDueDate: event.target.value })} /></Field><Button>เพิ่ม round</Button></form><div className="mt-3 space-y-1">{data.rounds.map((round) => <div key={round.id} className="flex justify-between rounded border p-2 text-sm"><span>{round.planItemName ?? 'ยังไม่จัดเข้าปี'} · {round.roundLabel}</span><div className="flex gap-1"><Button variant="ghost" className="min-h-7 px-2" title="แก้ไข round" onClick={() => edit(round)}><Pencil className="size-3.5" /></Button><Button variant="danger" className="min-h-7 px-2" title="ลบ round" onClick={() => remove(round.id)}><Trash2 className="size-3.5" /></Button></div></div>)}</div></Card>
}

function ApproverManager({ data, onOk, onErr }: { data: EqaWorkspace; actor: BmActor; onOk: Update; onErr: (text: string) => void }) {
  const initial = useMemo(() => Object.fromEntries(APPROVAL_ROLES.map((role) => [role, data.approverAssignments.find((assignment) => assignment.approvalRole === role)?.userId ?? ''])) as Record<EqaAssignedApprovalRole, string>, [data.approverAssignments])
  const [values, setValues] = useState(initial)
  async function save(role: EqaAssignedApprovalRole) { if (!values[role]) return; try { const result = await api<{ eqa: EqaWorkspace }>('/api/eqa/approver-assignments', { method: 'PUT', body: JSON.stringify({ approvalRole: role, userId: values[role] }) }); onOk('กำหนดผู้อนุมัติแล้ว', result.eqa) } catch (error) { onErr(error instanceof Error ? error.message : 'บันทึกไม่สำเร็จ') } }
  return <Card className="p-4"><h2 className="font-bold">ผู้รับตำแหน่งอนุมัติ</h2><div className="mt-3 space-y-3">{APPROVAL_ROLES.map((role) => <div key={role} className="grid grid-cols-[1fr_auto] items-end gap-2"><Field label={EQA_APPROVAL_ROLE_LABELS[role]}><UserSelect users={data.users} value={values[role]} onChange={(value) => setValues({ ...values, [role]: value })} /></Field><Button variant="secondary" onClick={() => save(role)}>บันทึก</Button></div>)}</div></Card>
}
