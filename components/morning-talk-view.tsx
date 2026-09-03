'use client'

import { useState, type Dispatch, type FormEvent, type SetStateAction } from 'react'
import {
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  ListChecks,
  Pencil,
  Plus,
  Trash2,
  UserRound,
  Users,
  X,
} from 'lucide-react'
import type { BmActor } from '@/lib/bm/types'
import type {
  MorningTalk,
  MorningTalkActionItem,
  MorningTalkActionStatus,
  MorningTalkChecklistItem,
  MorningTalkWorkspace,
} from '@/lib/morning-talk/types'
import { formatDate, formatDateTime, todayBangkok } from '@/lib/bm/rules'
import { api, Button, Card, Field, Input, Notice, PageHeader, Select, StatCard, StatusBadge, Textarea } from '@/components/ui'

const DEFAULT_CHECKLIST_ITEMS = [
  'ตรวจสอบความปลอดภัยและ PPE ก่อนเริ่มงาน',
  'ตรวจสอบอุณหภูมิและความพร้อมของเครื่องมือ',
  'ตรวจสอบน้ำยา/Consumable ใกล้หมดหรือหมดอายุ',
]

const ACTION_STATUS_OPTIONS: Array<{ value: MorningTalkActionStatus; label: string }> = [
  { value: 'todo', label: 'ยังไม่เริ่ม' },
  { value: 'in-progress', label: 'กำลังดำเนินการ' },
  { value: 'done', label: 'เสร็จแล้ว' },
]

type ChecklistDraft = { id?: string; title: string }
type ActionDraft = {
  id?: string
  title: string
  ownerId: string
  dueDate: string
  status: MorningTalkActionStatus
  note: string
}
type TalkForm = {
  talkDate: string
  title: string
  agenda: string
  attendeeIds: string[]
  checklistItems: ChecklistDraft[]
  actionItems: ActionDraft[]
}

function emptyForm(): TalkForm {
  return {
    talkDate: todayBangkok(),
    title: '',
    agenda: '',
    attendeeIds: [],
    checklistItems: DEFAULT_CHECKLIST_ITEMS.map((title) => ({ title })),
    actionItems: [],
  }
}

function formFromTalk(talk: MorningTalk): TalkForm {
  return {
    talkDate: talk.talkDate,
    title: talk.title,
    agenda: talk.agenda ?? '',
    attendeeIds: talk.attendees.map((attendee) => attendee.userId),
    checklistItems: talk.checklistItems.map((item) => ({ id: item.id, title: item.title })),
    actionItems: talk.actionItems.map((item) => ({
      id: item.id,
      title: item.title,
      ownerId: item.ownerId ?? '',
      dueDate: item.dueDate ?? '',
      status: item.status,
      note: item.note ?? '',
    })),
  }
}

function actionStatusLabel(status: MorningTalkActionStatus) {
  return ACTION_STATUS_OPTIONS.find((option) => option.value === status)?.label ?? status
}

function actionStatusTone(status: MorningTalkActionStatus) {
  if (status === 'done') return 'accepted' as const
  if (status === 'in-progress') return 'warning' as const
  return 'neutral' as const
}

function isOverdue(action: MorningTalkActionItem, today: string) {
  return action.status !== 'done' && Boolean(action.dueDate) && action.dueDate! < today
}

export function MorningTalkView({ actor, initialData }: { actor: BmActor; initialData: MorningTalkWorkspace }) {
  const [data, setData] = useState(initialData)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<TalkForm>(() => emptyForm())
  const [busy, setBusy] = useState('')
  const [notice, setNotice] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null)
  const isAdmin = actor.role === 'Admin'
  const editing = editingId ? data.talks.find((talk) => talk.id === editingId) ?? null : null
  const today = todayBangkok()
  const todayTalks = data.talks.filter((talk) => talk.talkDate === today)
  const todayAttendees = todayTalks.flatMap((talk) => talk.attendees)
  const todayAcknowledged = todayAttendees.filter((attendee) => attendee.acknowledgedAt).length
  const todayChecklist = todayTalks.flatMap((talk) => talk.checklistItems)
  const todayChecklistDone = todayChecklist.filter((item) => item.completedAt).length
  const allActions = data.talks.flatMap((talk) => talk.actionItems)
  const openActions = allActions.filter((action) => action.status !== 'done')
  const overdueActions = openActions.filter((action) => isOverdue(action, today))

  function resetForm() {
    setEditingId(null)
    setForm(emptyForm())
  }

  function startEdit(talk: MorningTalk) {
    setEditingId(talk.id)
    setForm(formFromTalk(talk))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function toggleAttendee(userId: string) {
    setForm((current) => ({
      ...current,
      attendeeIds: current.attendeeIds.includes(userId)
        ? current.attendeeIds.filter((id) => id !== userId)
        : [...current.attendeeIds, userId],
    }))
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!form.attendeeIds.length) {
      setNotice({ tone: 'danger', text: 'เลือกผู้เข้าประชุมอย่างน้อย 1 คน' })
      return
    }
    const checklistItems = form.checklistItems.map((item) => ({ ...item, title: item.title.trim() })).filter((item) => item.title)
    const actionItems = form.actionItems
      .map((item) => ({ ...item, title: item.title.trim(), note: item.note.trim() }))
      .filter((item) => item.title)
    if (actionItems.some((item) => !item.ownerId)) {
      setNotice({ tone: 'danger', text: 'กรุณาเลือกผู้รับผิดชอบให้ Action item ทุกงาน' })
      return
    }

    setBusy('save')
    try {
      const result = await api<{ workspace: MorningTalkWorkspace }>(editingId ? `/api/morning-talk/${editingId}` : '/api/morning-talk', {
        method: editingId ? 'PATCH' : 'POST',
        body: JSON.stringify({
          talkDate: form.talkDate,
          title: form.title,
          agenda: form.agenda || null,
          attendeeIds: form.attendeeIds,
          checklistItems: checklistItems.map((item) => editingId && item.id ? { id: item.id, title: item.title } : { title: item.title }),
          actionItems: actionItems.map((item) => ({
            ...(editingId && item.id ? { id: item.id } : {}),
            title: item.title,
            ownerId: item.ownerId || null,
            dueDate: item.dueDate || null,
            status: item.status,
            note: item.note || null,
          })),
        }),
      })
      setData(result.workspace)
      setNotice({ tone: 'success', text: editingId ? 'อัปเดต Morning Talk แล้ว' : 'สร้าง Morning Talk แล้ว' })
      resetForm()
    } catch (error) {
      setNotice({ tone: 'danger', text: error instanceof Error ? error.message : 'บันทึกไม่สำเร็จ' })
    } finally {
      setBusy('')
    }
  }

  async function acknowledge(talk: MorningTalk) {
    setBusy(`ack:${talk.id}`)
    try {
      const result = await api<{ workspace: MorningTalkWorkspace }>(`/api/morning-talk/${talk.id}/acknowledge`, { method: 'POST' })
      setData(result.workspace)
      setNotice({ tone: 'success', text: 'บันทึกรับทราบแล้ว' })
    } catch (error) {
      setNotice({ tone: 'danger', text: error instanceof Error ? error.message : 'บันทึกรับทราบไม่สำเร็จ' })
    } finally {
      setBusy('')
    }
  }

  async function toggleChecklist(talk: MorningTalk, item: MorningTalkChecklistItem) {
    setBusy(`checklist:${item.id}`)
    try {
      const result = await api<{ workspace: MorningTalkWorkspace }>(`/api/morning-talk/${talk.id}/checklist/${item.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ completed: !item.completedAt }),
      })
      setData(result.workspace)
    } catch (error) {
      setNotice({ tone: 'danger', text: error instanceof Error ? error.message : 'อัปเดต Checklist ไม่สำเร็จ' })
    } finally {
      setBusy('')
    }
  }

  async function updateActionStatus(talk: MorningTalk, action: MorningTalkActionItem, status: MorningTalkActionStatus) {
    setBusy(`action:${action.id}`)
    try {
      const result = await api<{ workspace: MorningTalkWorkspace }>(`/api/morning-talk/${talk.id}/actions/${action.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      })
      setData(result.workspace)
    } catch (error) {
      setNotice({ tone: 'danger', text: error instanceof Error ? error.message : 'อัปเดต Action item ไม่สำเร็จ' })
    } finally {
      setBusy('')
    }
  }

  async function remove(talk: MorningTalk) {
    if (!window.confirm(`ลบ Morning Talk “${talk.title}” ใช่ไหม? รายการติดตามทั้งหมดจะถูกลบด้วย`)) return
    setBusy(`delete:${talk.id}`)
    try {
      const result = await api<{ workspace: MorningTalkWorkspace }>(`/api/morning-talk/${talk.id}`, { method: 'DELETE' })
      setData(result.workspace)
      setNotice({ tone: 'success', text: 'ลบ Morning Talk แล้ว' })
      if (editingId === talk.id) resetForm()
    } catch (error) {
      setNotice({ tone: 'danger', text: error instanceof Error ? error.message : 'ลบไม่สำเร็จ' })
    } finally {
      setBusy('')
    }
  }

  return (
    <div className="mx-auto max-w-[1300px] space-y-5">
      <PageHeader
        eyebrow="Team communication"
        title="Morning Talk"
        description="สื่อสารประเด็นสำคัญ จัดงานให้ชัด และติดตามผลต่อเนื่องในหน้าเดียว"
        actions={isAdmin ? <Button type="button" onClick={() => { resetForm(); window.scrollTo({ top: 0, behavior: 'smooth' }) }}><Plus className="size-4" /> สร้าง Morning Talk</Button> : null}
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="รายการวันนี้" value={todayTalks.length} hint={todayTalks.length ? 'Talk ที่บันทึกไว้วันนี้' : 'ยังไม่มีรายการวันนี้'} />
        <StatCard
          label="รับทราบวันนี้"
          value={todayAttendees.length ? `${todayAcknowledged}/${todayAttendees.length}` : '—'}
          tone={!todayAttendees.length ? 'neutral' : todayAcknowledged === todayAttendees.length ? 'accepted' : 'warning'}
          hint={!todayAttendees.length ? 'ยังไม่มีผู้เข้าประชุมวันนี้' : todayAcknowledged < todayAttendees.length ? `ค้าง ${todayAttendees.length - todayAcknowledged} คน` : 'ทุกคนรับทราบแล้ว'}
        />
        <StatCard
          label="Checklist วันนี้"
          value={todayChecklist.length ? `${todayChecklistDone}/${todayChecklist.length}` : '—'}
          tone={!todayChecklist.length ? 'neutral' : todayChecklistDone === todayChecklist.length ? 'accepted' : 'warning'}
          hint={!todayChecklist.length ? 'ยังไม่มี Checklist วันนี้' : todayChecklistDone < todayChecklist.length ? `เหลือ ${todayChecklist.length - todayChecklistDone} รายการ` : 'ครบทุกหัวข้อแล้ว'}
        />
        <StatCard
          label="Action ค้างทั้งหมด"
          value={openActions.length}
          tone={overdueActions.length ? 'rejected' : openActions.length ? 'warning' : 'accepted'}
          hint={overdueActions.length ? `เลยกำหนด ${overdueActions.length} งาน` : 'ไม่มีงานเลยกำหนด'}
        />
      </div>

      {notice ? <Notice tone={notice.tone}>{notice.text}</Notice> : null}

      {isAdmin ? (
        <TalkEditor
          editing={Boolean(editing)}
          form={form}
          users={data.users}
          busy={busy}
          onChange={setForm}
          onToggleAttendee={toggleAttendee}
          onSave={save}
          onCancel={resetForm}
        />
      ) : null}

      <section className="space-y-3" aria-label="Morning Talk history">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-[11px] font-bold tracking-[0.16em] text-[#0b7f76] uppercase">Briefing log</p>
            <h2 className="mt-1 text-lg font-bold text-[#173d50]">ประวัติ Morning Talk</h2>
          </div>
          <p className="text-xs text-[#81979c]">แสดง {data.talks.length} รายการล่าสุด</p>
        </div>
        {data.talks.map((talk) => (
          <MorningTalkCard
            key={talk.id}
            talk={talk}
            actor={actor}
            isAdmin={isAdmin}
            today={today}
            busy={busy}
            onEdit={startEdit}
            onDelete={remove}
            onAcknowledge={acknowledge}
            onToggleChecklist={toggleChecklist}
            onUpdateActionStatus={updateActionStatus}
          />
        ))}
        {!data.talks.length ? <Card className="p-10 text-center text-sm text-[#81979c]"><ClipboardList className="mx-auto mb-2 size-6 text-[#b8c9cd]" />ยังไม่มี Morning Talk</Card> : null}
      </section>
    </div>
  )
}

function TalkEditor({
  editing,
  form,
  users,
  busy,
  onChange,
  onToggleAttendee,
  onSave,
  onCancel,
}: {
  editing: boolean
  form: TalkForm
  users: MorningTalkWorkspace['users']
  busy: string
  onChange: Dispatch<SetStateAction<TalkForm>>
  onToggleAttendee: (userId: string) => void
  onSave: (event: FormEvent<HTMLFormElement>) => void
  onCancel: () => void
}) {
  return (
    <Card className="overflow-hidden">
      <div className="border-b border-[#e1eaeb] bg-[#fbfdfd] px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold tracking-[0.15em] text-[#0b7f76] uppercase">Admin workspace</p>
            <h2 className="mt-1 font-bold text-[#173d50]">{editing ? 'แก้ไข Morning Talk' : 'สร้าง Morning Talk'}</h2>
            <p className="mt-1 text-xs text-[#789097]">บันทึกประเด็น, Checklist และงานติดตามพร้อมผู้รับผิดชอบ</p>
          </div>
          {editing ? <Button type="button" variant="ghost" className="px-2 py-1 text-xs" onClick={onCancel}><X className="size-3.5" /> ยกเลิก</Button> : null}
        </div>
      </div>
      <form onSubmit={onSave} className="grid gap-4 p-4">
        <div className="grid gap-3 lg:grid-cols-2">
          <Field label="วันที่"><Input type="date" required value={form.talkDate} onChange={(event) => onChange((current) => ({ ...current, talkDate: event.target.value }))} /></Field>
          <Field label="หัวข้อ Morning Talk"><Input required value={form.title} onChange={(event) => onChange((current) => ({ ...current, title: event.target.value }))} placeholder="เช่น ทบทวนความปลอดภัยและแผนงานประจำวัน" /></Field>
        </div>
        <Field label="ประเด็นประชุม / Agenda" hint="สรุปสิ่งที่ทีมต้องรู้หรือข้อควรระวังในวันนี้"><Textarea rows={3} value={form.agenda} onChange={(event) => onChange((current) => ({ ...current, agenda: event.target.value }))} placeholder="ระบุสรุปหัวข้อหรือข้อควรรับทราบ" /></Field>

        <ChecklistEditor items={form.checklistItems} onChange={(checklistItems) => onChange((current) => ({ ...current, checklistItems }))} />
        <ActionItemsEditor items={form.actionItems} users={users} onChange={(actionItems) => onChange((current) => ({ ...current, actionItems }))} />

        <div className="rounded-lg border border-[#d8e6e6] bg-[#f8fbfc] p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs font-bold text-[#315763]">ผู้เข้าประชุม ({form.attendeeIds.length}/{users.length})</p>
              <p className="mt-0.5 text-[11px] text-[#81979c]">เลือกผู้ที่ต้องรับทราบ Morning Talk นี้</p>
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="ghost" className="min-h-8 px-2 py-1 text-xs" onClick={() => onChange((current) => ({ ...current, attendeeIds: users.map((user) => user.id) }))}>เลือกทั้งหมด</Button>
              <Button type="button" variant="ghost" className="min-h-8 px-2 py-1 text-xs" onClick={() => onChange((current) => ({ ...current, attendeeIds: [] }))}>ล้าง</Button>
            </div>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {users.map((user) => (
              <label key={user.id} className="flex items-center gap-2 rounded-md border border-[#dce8e9] bg-white px-3 py-2 text-sm text-[#41616b]">
                <input type="checkbox" checked={form.attendeeIds.includes(user.id)} onChange={() => onToggleAttendee(user.id)} />
                <span className="min-w-0"><span className="block truncate font-semibold">{user.displayName}</span><span className="block text-[10px] text-[#91a3a7]">{user.role} · E-Phis {user.ephisId}</span></span>
              </label>
            ))}
          </div>
          {!users.length ? <p className="mt-3 text-xs text-[#a9700f]">ยังไม่มีผู้ใช้ Stock ที่ active</p> : null}
        </div>

        <div><Button type="submit" disabled={busy === 'save'}>{editing ? <Pencil className="size-4" /> : <ClipboardCheck className="size-4" />}{editing ? 'บันทึกการแก้ไข' : 'สร้างและกำหนดผู้เข้าประชุม'}</Button></div>
      </form>
    </Card>
  )
}

function ChecklistEditor({ items, onChange }: { items: ChecklistDraft[]; onChange: (items: ChecklistDraft[]) => void }) {
  return (
    <div className="rounded-lg border border-[#d8e6e6] bg-[#f8fbfc] p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-1.5"><ListChecks className="size-4 text-[#0b7f76]" /><p className="text-xs font-bold text-[#315763]">Checklist ประจำวัน ({items.filter((item) => item.title.trim()).length})</p></div>
          <p className="mt-0.5 text-[11px] text-[#81979c]">หัวข้อที่ทีมช่วยกันตรวจและติ๊กให้ครบก่อนจบการประชุม</p>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" className="min-h-8 px-2 py-1 text-xs" onClick={() => onChange(DEFAULT_CHECKLIST_ITEMS.map((title) => ({ title })))}>ใช้ Template</Button>
          <Button type="button" variant="ghost" className="min-h-8 px-2 py-1 text-xs" onClick={() => onChange([])}>ล้าง</Button>
        </div>
      </div>
      <div className="mt-3 space-y-2">
        {items.map((item, index) => (
          <div key={item.id ?? `new-${index}`} className="flex items-center gap-2">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[#e4f2f0] text-[11px] font-bold text-[#0b7f76]">{index + 1}</span>
            <Input aria-label={`Checklist item ${index + 1}`} value={item.title} onChange={(event) => onChange(items.map((current, itemIndex) => itemIndex === index ? { ...current, title: event.target.value } : current))} placeholder="เช่น ตรวจสอบอุณหภูมิตู้เย็น" />
            <Button type="button" variant="ghost" className="min-h-9 min-w-9 px-2 text-[#a35b63]" onClick={() => onChange(items.filter((_, itemIndex) => itemIndex !== index))} aria-label={`ลบ Checklist รายการที่ ${index + 1}`} title="ลบ Checklist"><Trash2 className="size-4" /></Button>
          </div>
        ))}
        {!items.length ? <p className="rounded-md border border-dashed border-[#cbdcdd] px-3 py-3 text-xs text-[#81979c]">ยังไม่มี Checklist — เพิ่มหัวข้อที่ต้องตรวจในวันนี้ได้เลย</p> : null}
      </div>
      <Button type="button" variant="secondary" className="mt-3 min-h-9 px-3 py-1 text-xs" onClick={() => onChange([...items, { title: '' }])}><Plus className="size-3.5" /> เพิ่ม Checklist</Button>
    </div>
  )
}

function ActionItemsEditor({ items, users, onChange }: { items: ActionDraft[]; users: MorningTalkWorkspace['users']; onChange: (items: ActionDraft[]) => void }) {
  return (
    <div className="rounded-lg border border-[#d8e6e6] bg-[#f8fbfc] p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-1.5"><ClipboardList className="size-4 text-[#0b7f76]" /><p className="text-xs font-bold text-[#315763]">Action items / งานติดตาม ({items.filter((item) => item.title.trim()).length})</p></div>
          <p className="mt-0.5 text-[11px] text-[#81979c]">ทุกงานควรมีผู้รับผิดชอบและกำหนดเสร็จเพื่อปิดงานได้จริง</p>
        </div>
      </div>
      <div className="mt-3 space-y-3">
        {items.map((item, index) => (
          <div key={item.id ?? `new-action-${index}`} className="rounded-md border border-[#dce8e9] bg-white p-3">
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1.7fr)_minmax(12rem,1fr)_10rem_auto]">
              <Field label={`งานที่ต้องทำ ${index + 1}`}><Input value={item.title} onChange={(event) => onChange(items.map((current, itemIndex) => itemIndex === index ? { ...current, title: event.target.value } : current))} placeholder="เช่น สั่งซื้อน้ำยา lot ใหม่" /></Field>
              <Field label="ผู้รับผิดชอบ"><Select value={item.ownerId} onChange={(event) => onChange(items.map((current, itemIndex) => itemIndex === index ? { ...current, ownerId: event.target.value } : current))}><option value="">เลือกผู้รับผิดชอบ</option>{item.ownerId && !users.some((user) => user.id === item.ownerId) ? <option value={item.ownerId}>ผู้รับผิดชอบเดิม (ไม่ active)</option> : null}{users.map((user) => <option key={user.id} value={user.id}>{user.displayName}</option>)}</Select></Field>
              <Field label="กำหนดเสร็จ"><Input type="date" value={item.dueDate} onChange={(event) => onChange(items.map((current, itemIndex) => itemIndex === index ? { ...current, dueDate: event.target.value } : current))} /></Field>
              <div className="flex items-end"><Button type="button" variant="ghost" className="min-h-9 min-w-9 px-2 text-[#a35b63]" onClick={() => onChange(items.filter((_, itemIndex) => itemIndex !== index))} aria-label={`ลบ Action item รายการที่ ${index + 1}`} title="ลบ Action item"><Trash2 className="size-4" /></Button></div>
            </div>
            <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(12rem,15rem)_minmax(0,1fr)]">
              <Field label="สถานะ"><Select value={item.status} onChange={(event) => onChange(items.map((current, itemIndex) => itemIndex === index ? { ...current, status: event.target.value as MorningTalkActionStatus } : current))}>{ACTION_STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</Select></Field>
              <Field label="หมายเหตุเพิ่มเติม"><Textarea rows={2} value={item.note} onChange={(event) => onChange(items.map((current, itemIndex) => itemIndex === index ? { ...current, note: event.target.value } : current))} placeholder="ระบุรายละเอียดหรือเงื่อนไขการปิดงาน" /></Field>
            </div>
          </div>
        ))}
        {!items.length ? <p className="rounded-md border border-dashed border-[#cbdcdd] px-3 py-3 text-xs text-[#81979c]">ยังไม่มี Action item — เพิ่มงานที่ต้องติดตามจากการประชุมได้เลย</p> : null}
      </div>
      <Button type="button" variant="secondary" className="mt-3 min-h-9 px-3 py-1 text-xs" onClick={() => onChange([...items, { title: '', ownerId: '', dueDate: '', status: 'todo', note: '' }])}><Plus className="size-3.5" /> เพิ่ม Action item</Button>
    </div>
  )
}

function MorningTalkCard({
  talk,
  actor,
  isAdmin,
  today,
  busy,
  onEdit,
  onDelete,
  onAcknowledge,
  onToggleChecklist,
  onUpdateActionStatus,
}: {
  talk: MorningTalk
  actor: BmActor
  isAdmin: boolean
  today: string
  busy: string
  onEdit: (talk: MorningTalk) => void
  onDelete: (talk: MorningTalk) => void
  onAcknowledge: (talk: MorningTalk) => void
  onToggleChecklist: (talk: MorningTalk, item: MorningTalkChecklistItem) => void
  onUpdateActionStatus: (talk: MorningTalk, item: MorningTalkActionItem, status: MorningTalkActionStatus) => void
}) {
  const mine = talk.attendees.find((attendee) => attendee.userId === actor.id)
  const acknowledged = talk.attendees.filter((attendee) => attendee.acknowledgedAt).length

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#e1eaeb] bg-[#fbfdfd] px-4 py-3">
        <div>
          <div className="flex flex-wrap items-center gap-2"><p className="text-xs font-bold text-[#0b7f76]">{formatDate(talk.talkDate)}</p>{talk.talkDate === today ? <StatusBadge tone="accepted" label="วันนี้" /> : null}</div>
          <h2 className="mt-1 font-bold text-[#173d50]">{talk.title}</h2>
          <p className="mt-1 text-xs text-[#81979c]">สร้างโดย {talk.createdByName ?? '—'} · รับทราบแล้ว {acknowledged}/{talk.attendees.length}</p>
        </div>
        <div className="flex gap-1">
          {isAdmin ? <Button type="button" variant="ghost" className="px-2 py-1 text-xs" onClick={() => onEdit(talk)}><Pencil className="size-3.5" /> แก้ไข</Button> : null}
          {isAdmin ? <Button type="button" variant="ghost" className="px-2 py-1 text-xs text-red-600 hover:text-red-700" disabled={busy === `delete:${talk.id}`} onClick={() => onDelete(talk)} aria-label="ลบ Morning Talk" title="ลบ Morning Talk"><Trash2 className="size-3.5" /></Button> : null}
        </div>
      </div>

      <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_330px]">
        <div className="space-y-4">
          <div>{talk.agenda ? <p className="whitespace-pre-wrap text-sm leading-6 text-[#58747d]">{talk.agenda}</p> : <p className="text-sm text-[#91a3a7]">ไม่ได้ระบุประเด็นประชุม</p>}</div>
          <ChecklistPanel talk={talk} canUpdate={isAdmin || Boolean(mine)} busy={busy} onToggle={(item) => onToggleChecklist(talk, item)} />
          <ActionItemsPanel talk={talk} actor={actor} isAdmin={isAdmin} today={today} busy={busy} onStatusChange={(item, status) => onUpdateActionStatus(talk, item, status)} />
          {mine ? <div className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 ${mine.acknowledgedAt ? 'border-[#c7e0c8] bg-[#f1fbf4]' : 'border-[#eed4a6] bg-[#fff9ed]'}`}><div><p className="text-sm font-bold text-[#315763]">สถานะของคุณ</p><p className="mt-1 text-xs text-[#789097]">{mine.acknowledgedAt ? `รับทราบเมื่อ ${formatDateTime(mine.acknowledgedAt)}` : 'ยังไม่ได้รับทราบ Morning Talk นี้'}</p></div>{mine.acknowledgedAt ? <span className="inline-flex items-center gap-1 text-sm font-bold text-[#18763a]"><CheckCircle2 className="size-4" /> รับทราบแล้ว</span> : <Button type="button" disabled={busy === `ack:${talk.id}`} onClick={() => onAcknowledge(talk)}><CheckCircle2 className="size-4" /> รับทราบ</Button>}</div> : <Notice tone="info">คุณไม่ได้อยู่ในรายชื่อผู้เข้าประชุมรายการนี้</Notice>}
        </div>
        <AttendeePanel talk={talk} acknowledged={acknowledged} />
      </div>
    </Card>
  )
}

function ChecklistPanel({ talk, canUpdate, busy, onToggle }: { talk: MorningTalk; canUpdate: boolean; busy: string; onToggle: (item: MorningTalkChecklistItem) => void }) {
  const completed = talk.checklistItems.filter((item) => item.completedAt).length
  return (
    <div className="rounded-lg border border-[#dbe7e8] bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#eaf0f0] bg-[#f8fbfb] px-3 py-2.5"><span className="inline-flex items-center gap-1.5 text-xs font-bold text-[#315763]"><ListChecks className="size-4 text-[#0b7f76]" /> Checklist ประจำวัน</span>{talk.checklistItems.length ? <StatusBadge tone={completed === talk.checklistItems.length ? 'accepted' : 'warning'} label={`${completed}/${talk.checklistItems.length} เสร็จแล้ว`} /> : <StatusBadge tone="neutral" label="ยังไม่กำหนด" />}</div>
      {talk.checklistItems.length ? <div className="divide-y divide-[#edf2f2]">{talk.checklistItems.map((item) => <label key={item.id} className={`flex items-start gap-3 px-3 py-2.5 ${canUpdate ? 'cursor-pointer hover:bg-[#fbfdfd]' : ''}`}><input type="checkbox" className="mt-0.5 size-4 accent-[#0b7f76]" checked={Boolean(item.completedAt)} disabled={!canUpdate || busy === `checklist:${item.id}`} onChange={() => onToggle(item)} /><span className="min-w-0 flex-1"><span className={`block text-sm ${item.completedAt ? 'text-[#7f969a] line-through' : 'font-semibold text-[#315763]'}`}>{item.title}</span>{item.completedAt ? <span className="mt-0.5 block text-[10px] text-[#6f9691]">เสร็จแล้ว{item.completedByName ? ` · ${item.completedByName}` : ''}</span> : null}</span></label>)}</div> : <p className="px-3 py-4 text-xs text-[#91a3a7]">ยังไม่ได้กำหนด Checklist สำหรับ Talk นี้</p>}
      {talk.checklistItems.length && !canUpdate ? <p className="border-t border-[#edf2f2] px-3 py-2 text-[11px] text-[#81979c]">เฉพาะผู้เข้าประชุมหรือ Admin ที่สามารถติ๊ก Checklist ได้</p> : null}
    </div>
  )
}

function ActionItemsPanel({ talk, actor, isAdmin, today, busy, onStatusChange }: { talk: MorningTalk; actor: BmActor; isAdmin: boolean; today: string; busy: string; onStatusChange: (item: MorningTalkActionItem, status: MorningTalkActionStatus) => void }) {
  const done = talk.actionItems.filter((item) => item.status === 'done').length
  return (
    <div className="rounded-lg border border-[#dbe7e8] bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#eaf0f0] bg-[#f8fbfb] px-3 py-2.5"><span className="inline-flex items-center gap-1.5 text-xs font-bold text-[#315763]"><ClipboardList className="size-4 text-[#0b7f76]" /> Action items / งานติดตาม</span>{talk.actionItems.length ? <StatusBadge tone={done === talk.actionItems.length ? 'accepted' : 'warning'} label={`${done}/${talk.actionItems.length} ปิดแล้ว`} /> : <StatusBadge tone="neutral" label="ยังไม่มีงาน" />}</div>
      {talk.actionItems.length ? <div className="divide-y divide-[#edf2f2]">{talk.actionItems.map((item) => { const overdue = isOverdue(item, today); const canUpdate = isAdmin || item.ownerId === actor.id; return <div key={item.id} className="space-y-2 px-3 py-3"><div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0 flex-1"><p className={`text-sm font-semibold ${item.status === 'done' ? 'text-[#7f969a] line-through' : 'text-[#315763]'}`}>{item.title}</p><p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-[#81979c]"><span className="inline-flex items-center gap-1"><UserRound className="size-3" />{item.ownerName ?? 'ยังไม่มอบหมาย'}</span><span className="inline-flex items-center gap-1"><CalendarClock className="size-3" />{item.dueDate ? formatDate(item.dueDate) : 'ไม่กำหนดวัน'}</span></p></div>{canUpdate ? <Select aria-label={`สถานะของ ${item.title}`} className="min-h-9 w-auto min-w-36 px-2 py-1 text-xs" value={item.status} disabled={busy === `action:${item.id}`} onChange={(event) => onStatusChange(item, event.target.value as MorningTalkActionStatus)}>{ACTION_STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</Select> : <StatusBadge tone={actionStatusTone(item.status)} label={actionStatusLabel(item.status)} />}</div>{item.note ? <p className="rounded-md bg-[#f8fbfb] px-2.5 py-2 text-xs leading-5 text-[#58747d]">{item.note}</p> : null}<div className="flex flex-wrap items-center gap-2">{overdue ? <StatusBadge tone="rejected" label="เกินกำหนด" /> : null}{item.status === 'done' && item.completedAt ? <span className="inline-flex items-center gap-1 text-[10px] text-[#6f9691]"><CheckCircle2 className="size-3" /> ปิดเมื่อ {formatDateTime(item.completedAt)}</span> : null}{!canUpdate ? <span className="text-[10px] text-[#9aafb4]">เฉพาะเจ้าของงานหรือ Admin ที่เปลี่ยนสถานะได้</span> : null}</div></div> })}</div> : <p className="px-3 py-4 text-xs text-[#91a3a7]">ยังไม่มี Action item สำหรับ Talk นี้</p>}
    </div>
  )
}

function AttendeePanel({ talk, acknowledged }: { talk: MorningTalk; acknowledged: number }) {
  return <div className="rounded-lg border border-[#dbe7e8] bg-white"><div className="flex items-center justify-between border-b border-[#eaf0f0] px-3 py-2"><span className="inline-flex items-center gap-1 text-xs font-bold text-[#315763]"><Users className="size-3.5" /> ผู้เข้าประชุม</span><span className="text-xs text-[#0b7f76]">{acknowledged}/{talk.attendees.length}</span></div><div className="max-h-64 divide-y divide-[#edf2f2] overflow-y-auto">{talk.attendees.map((attendee) => <div key={attendee.userId} className="flex items-center justify-between gap-2 px-3 py-2 text-xs"><span className="min-w-0"><span className="block truncate font-semibold text-[#41616b]">{attendee.displayName}</span><span className="text-[10px] text-[#91a3a7]">{attendee.role}</span></span>{attendee.acknowledgedAt ? <span className="shrink-0 text-[10px] font-bold text-[#18763a]">รับทราบ</span> : <span className="shrink-0 text-[10px] font-bold text-[#a9700f]">รอรับทราบ</span>}</div>)}</div></div>
}
