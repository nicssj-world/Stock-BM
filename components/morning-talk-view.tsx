'use client'

import { useState } from 'react'
import { CheckCircle2, ClipboardCheck, Pencil, Plus, Trash2, Users, X } from 'lucide-react'
import type { BmActor } from '@/lib/bm/types'
import type { MorningTalk, MorningTalkWorkspace } from '@/lib/morning-talk/types'
import { formatDate, formatDateTime } from '@/lib/bm/rules'
import { api, Button, Card, Field, Input, Notice, PageHeader, Textarea } from '@/components/ui'

function todayBangkok() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date())
}

export function MorningTalkView({ actor, initialData }: { actor: BmActor; initialData: MorningTalkWorkspace }) {
  const [data, setData] = useState(initialData)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({ talkDate: todayBangkok(), title: '', agenda: '', attendeeIds: [] as string[] })
  const [busy, setBusy] = useState('')
  const [notice, setNotice] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null)
  const isAdmin = actor.role === 'Admin'
  const editing = editingId ? data.talks.find((talk) => talk.id === editingId) ?? null : null

  function resetForm() {
    setEditingId(null)
    setForm({ talkDate: todayBangkok(), title: '', agenda: '', attendeeIds: [] })
  }

  function startEdit(talk: MorningTalk) {
    setEditingId(talk.id)
    setForm({ talkDate: talk.talkDate, title: talk.title, agenda: talk.agenda ?? '', attendeeIds: talk.attendees.map((attendee) => attendee.userId) })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function toggleAttendee(userId: string) {
    setForm((current) => ({ ...current, attendeeIds: current.attendeeIds.includes(userId) ? current.attendeeIds.filter((id) => id !== userId) : [...current.attendeeIds, userId] }))
  }

  async function save(event: React.FormEvent) {
    event.preventDefault()
    if (!form.attendeeIds.length) return setNotice({ tone: 'danger', text: 'เลือกผู้เข้าประชุมอย่างน้อย 1 คน' })
    setBusy('save')
    try {
      const result = await api<{ workspace: MorningTalkWorkspace }>(editingId ? `/api/morning-talk/${editingId}` : '/api/morning-talk', {
        method: editingId ? 'PATCH' : 'POST',
        body: JSON.stringify({ ...form, agenda: form.agenda || null }),
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

  async function remove(talk: MorningTalk) {
    if (!window.confirm(`ลบ Morning Talk “${talk.title}” ใช่ไหม? รายการรับทราบทั้งหมดจะถูกลบด้วย`)) return
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

  return <div className="mx-auto max-w-[1300px] space-y-5">
    <PageHeader eyebrow="Team communication" title="Morning Talk" description="กำหนดผู้เข้าประชุมและติดตามการรับทราบรายบุคคล" actions={isAdmin ? <Button onClick={() => { resetForm(); window.scrollTo({ top: 0, behavior: 'smooth' }) }}><Plus className="size-4" /> สร้าง Morning Talk</Button> : null} />
    {notice ? <Notice tone={notice.tone}>{notice.text}</Notice> : null}

    {isAdmin ? <Card className="p-4">
      <div className="flex items-start justify-between gap-3"><div><h2 className="font-bold text-[#173d50]">{editing ? 'แก้ไข Morning Talk' : 'สร้าง Morning Talk'}</h2><p className="mt-1 text-xs text-[#789097]">ผู้ที่ได้รับมอบหมายจะกดรับทราบด้วยบัญชีของตนเอง</p></div>{editing ? <Button type="button" variant="ghost" className="px-2 py-1 text-xs" onClick={resetForm}><X className="size-3.5" /> ยกเลิก</Button> : null}</div>
      <form onSubmit={save} className="mt-4 grid gap-3 lg:grid-cols-2">
        <Field label="วันที่"><Input type="date" required value={form.talkDate} onChange={(event) => setForm({ ...form, talkDate: event.target.value })} /></Field>
        <Field label="หัวข้อ Morning Talk"><Input required value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="เช่น ทบทวนความปลอดภัยและแผนงานประจำวัน" /></Field>
        <div className="lg:col-span-2"><Field label="ประเด็นประชุม / Agenda"><Textarea rows={3} value={form.agenda} onChange={(event) => setForm({ ...form, agenda: event.target.value })} placeholder="ระบุสรุปหัวข้อหรือข้อควรรับทราบ" /></Field></div>
        <div className="lg:col-span-2 rounded-lg border border-[#d8e6e6] bg-[#f8fbfc] p-3">
          <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-xs font-bold text-[#315763]">ผู้เข้าประชุม ({form.attendeeIds.length}/{data.users.length})</p><p className="mt-0.5 text-[11px] text-[#81979c]">เลือกผู้ที่ต้องรับทราบ</p></div><div className="flex gap-2"><Button type="button" variant="ghost" className="min-h-8 px-2 py-1 text-xs" onClick={() => setForm({ ...form, attendeeIds: data.users.map((user) => user.id) })}>เลือกทั้งหมด</Button><Button type="button" variant="ghost" className="min-h-8 px-2 py-1 text-xs" onClick={() => setForm({ ...form, attendeeIds: [] })}>ล้าง</Button></div></div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{data.users.map((user) => <label key={user.id} className="flex items-center gap-2 rounded-md border border-[#dce8e9] bg-white px-3 py-2 text-sm text-[#41616b]"><input type="checkbox" checked={form.attendeeIds.includes(user.id)} onChange={() => toggleAttendee(user.id)} /><span className="min-w-0"><span className="block truncate font-semibold">{user.displayName}</span><span className="block text-[10px] text-[#91a3a7]">{user.role} · E-Phis {user.ephisId}</span></span></label>)}</div>
        </div>
        <div className="lg:col-span-2"><Button disabled={busy === 'save'}>{editing ? <Pencil className="size-4" /> : <ClipboardCheck className="size-4" />}{editing ? 'บันทึกการแก้ไข' : 'สร้างและกำหนดผู้เข้าประชุม'}</Button></div>
      </form>
    </Card> : null}

    <section className="space-y-3">{data.talks.map((talk) => {
      const mine = talk.attendees.find((attendee) => attendee.userId === actor.id)
      const acknowledged = talk.attendees.filter((attendee) => attendee.acknowledgedAt).length
      return <Card key={talk.id} className="overflow-hidden"><div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#e1eaeb] bg-[#fbfdfd] px-4 py-3"><div><p className="text-xs font-bold text-[#0b7f76]">{formatDate(talk.talkDate)}</p><h2 className="mt-1 font-bold text-[#173d50]">{talk.title}</h2><p className="mt-1 text-xs text-[#81979c]">สร้างโดย {talk.createdByName ?? '—'} · รับทราบแล้ว {acknowledged}/{talk.attendees.length}</p></div><div className="flex gap-1">{isAdmin ? <Button type="button" variant="ghost" className="px-2 py-1 text-xs" onClick={() => startEdit(talk)}><Pencil className="size-3.5" /> แก้ไข</Button> : null}{isAdmin ? <Button type="button" variant="ghost" className="px-2 py-1 text-xs text-red-600 hover:text-red-700" disabled={busy === `delete:${talk.id}`} onClick={() => remove(talk)}><Trash2 className="size-3.5" /></Button> : null}</div></div>
        <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_330px]"><div>{talk.agenda ? <p className="whitespace-pre-wrap text-sm leading-6 text-[#58747d]">{talk.agenda}</p> : <p className="text-sm text-[#91a3a7]">ไม่ได้ระบุประเด็นประชุม</p>}{mine ? <div className={`mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 ${mine.acknowledgedAt ? 'border-[#c7e0c8] bg-[#f1fbf4]' : 'border-[#eed4a6] bg-[#fff9ed]'}`}><div><p className="text-sm font-bold text-[#315763]">สถานะของคุณ</p><p className="mt-1 text-xs text-[#789097]">{mine.acknowledgedAt ? `รับทราบเมื่อ ${formatDateTime(mine.acknowledgedAt)}` : 'ยังไม่ได้รับทราบ Morning Talk นี้'}</p></div>{mine.acknowledgedAt ? <span className="inline-flex items-center gap-1 text-sm font-bold text-[#18763a]"><CheckCircle2 className="size-4" /> รับทราบแล้ว</span> : <Button disabled={busy === `ack:${talk.id}`} onClick={() => acknowledge(talk)}><CheckCircle2 className="size-4" /> รับทราบ</Button>}</div> : <Notice tone="info">คุณไม่ได้อยู่ในรายชื่อผู้เข้าประชุมรายการนี้</Notice>}</div>
          <div className="rounded-lg border border-[#dbe7e8] bg-white"><div className="flex items-center justify-between border-b border-[#eaf0f0] px-3 py-2"><span className="inline-flex items-center gap-1 text-xs font-bold text-[#315763]"><Users className="size-3.5" /> ผู้เข้าประชุม</span><span className="text-xs text-[#0b7f76]">{acknowledged}/{talk.attendees.length}</span></div><div className="max-h-64 divide-y divide-[#edf2f2] overflow-y-auto">{talk.attendees.map((attendee) => <div key={attendee.userId} className="flex items-center justify-between gap-2 px-3 py-2 text-xs"><span className="min-w-0"><span className="block truncate font-semibold text-[#41616b]">{attendee.displayName}</span><span className="text-[10px] text-[#91a3a7]">{attendee.role}</span></span>{attendee.acknowledgedAt ? <span className="shrink-0 text-[10px] font-bold text-[#18763a]">รับทราบ</span> : <span className="shrink-0 text-[10px] font-bold text-[#a9700f]">รอรับทราบ</span>}</div>)}</div></div>
        </div></Card>
    })}{!data.talks.length ? <Card className="p-10 text-center text-sm text-[#81979c]">ยังไม่มี Morning Talk</Card> : null}</section>
  </div>
}
