'use client'

import Link from 'next/link'
import { BellRing, Check, ExternalLink, LoaderCircle, Pencil, Plus, Send, Trash2, X } from 'lucide-react'
import { useState } from 'react'
import type { BmActor } from '@/lib/bm/types'
import { formatDateTime } from '@/lib/bm/rules'
import { formatHivDrtPosition } from '@/lib/hiv-drt/rules'
import type { HivLabAlert, HivLabAlertWorkspace } from '@/lib/hiv-lab-alert/types'
import { api, Button, Card, Field, Input, Notice, PageHeader, Select, StatusBadge } from '@/components/ui'
import { Pagination, usePagination } from '@/components/pagination'

type NoticeState = { tone: 'info' | 'success' | 'warning' | 'danger'; text: string } | null
type FormState = { hn: string; ln: string; patientName: string; rackId: string }

const emptyForm: FormState = { hn: '', ln: '', patientName: '', rackId: '' }
const HIV_LAB_ALERT_PAGE_SIZE = 20

export function HivLabAlertView({ actor, initialData }: { actor: BmActor; initialData: HivLabAlertWorkspace }) {
  const [workspace, setWorkspace] = useState(initialData)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [notice, setNotice] = useState<NoticeState>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const alertPagination = usePagination(workspace.alerts.length, HIV_LAB_ALERT_PAGE_SIZE)
  const pagedAlerts = workspace.alerts.slice(alertPagination.start, alertPagination.end)
  const availableRacks = workspace.racks.filter((rack) => rack.nextAutoPosition !== null)

  const selectedRack = availableRacks.find((rack) => rack.id === form.rackId) ?? null

  function resetForm() {
    setEditingId(null)
    setForm(emptyForm)
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!form.hn.trim() || !form.ln.trim() || (!editingId && !form.patientName.trim()) || (!editingId && !form.rackId)) return
    setBusy(editingId ? `edit:${editingId}` : 'create')
    setNotice(null)
    try {
      const body = editingId
        ? { hn: form.hn.trim(), ...(form.patientName.trim() ? { patientName: form.patientName.trim() } : {}) }
        : form
      const result = await api<{ workspace: HivLabAlertWorkspace }>(editingId ? `/api/hiv-alert/alerts/${editingId}` : '/api/hiv-alert/alerts', {
        method: editingId ? 'PATCH' : 'POST',
        body: JSON.stringify(body),
      })
      setWorkspace(result.workspace)
      resetForm()
      setNotice({ tone: 'success', text: editingId ? 'แก้ไข HIV LAB Alert แล้ว' : 'บันทึก Alert และเก็บตัวอย่างเข้า HIV DRT แล้ว — ยังไม่ได้ส่ง LINE' })
    } catch (error) {
      setNotice({ tone: 'danger', text: error instanceof Error ? error.message : 'เกิดข้อผิดพลาด' })
    } finally {
      setBusy(null)
    }
  }

  function editAlert(alert: HivLabAlert) {
    setEditingId(alert.id)
    setForm({ hn: alert.hn, ln: alert.ln, patientName: '', rackId: '' })
    setNotice({ tone: 'info', text: 'กรอกชื่อจริงใหม่เฉพาะกรณีต้องการเปลี่ยนชื่อ ระบบจะเก็บเฉพาะชื่อปกปิด' })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function removeAlert(alert: HivLabAlert) {
    if (!window.confirm(`ลบ Alert ของ HN ${alert.hn} / LN ${alert.ln}? ระบบจะลบตัวอย่างที่เชื่อมใน HIV DRT ด้วย`)) return
    setBusy(`delete:${alert.id}`)
    setNotice(null)
    try {
      const result = await api<{ workspace: HivLabAlertWorkspace }>(`/api/hiv-alert/alerts/${alert.id}`, { method: 'DELETE' })
      setWorkspace(result.workspace)
      setNotice({ tone: 'success', text: 'ลบ Alert และตัวอย่างที่เชื่อมใน HIV DRT แล้ว' })
    } catch (error) {
      setNotice({ tone: 'danger', text: error instanceof Error ? error.message : 'เกิดข้อผิดพลาด' })
    } finally {
      setBusy(null)
    }
  }

  async function sendAlert(alert: HivLabAlert) {
    if (!window.confirm(`ยืนยันส่ง Alert ของ HN ${alert.hn} / LN ${alert.ln} เข้า LINE กลุ่มผู้รับผิดชอบ?`)) return
    setBusy(`send:${alert.id}`)
    setNotice(null)
    try {
      const result = await api<{ workspace: HivLabAlertWorkspace }>(`/api/hiv-alert/alerts/${alert.id}/send`, { method: 'POST' })
      setWorkspace(result.workspace)
      setNotice({ tone: 'success', text: `ส่ง HN ${alert.hn} เข้า LINE สำเร็จแล้ว และล็อกข้อมูลรายการนี้` })
    } catch (error) {
      setNotice({ tone: 'danger', text: error instanceof Error ? error.message : 'ส่ง LINE ไม่สำเร็จ กรุณาลองอีกครั้ง' })
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="mx-auto max-w-[1500px] space-y-5">
      <PageHeader
        eyebrow="Management"
        title="HIV LAB Alert"
        description="บันทึกตัวอย่าง HIV-VL ที่เข้าเกณฑ์ > 1,000 copies/mL เข้า HIV DRT และส่งแจ้งเตือน LINE เมื่อเจ้าหน้าที่กดยืนยัน"
        actions={<div className="flex items-center gap-2 rounded-full border border-[#b9d7d5] bg-[#edf9f7] px-3 py-1.5 text-xs font-bold text-[#176b68]"><BellRing className="size-4" /> {actor.role} · Manual send</div>}
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,430px)_minmax(0,1fr)]">
        <Card className="h-fit overflow-hidden">
          <div className="border-b border-[#dce8e9] bg-[#123944] p-4 text-white">
            <div className="flex items-center gap-3"><div className="grid size-9 place-items-center rounded-lg bg-[#0b7f76]">{editingId ? <Pencil className="size-4" /> : <Plus className="size-4" />}</div><div><p className="text-[10px] font-bold tracking-[.16em] text-[#7ee3d8] uppercase">{editingId ? 'Edit pending alert' : 'New alert'}</p><h2 className="font-bold">{editingId ? 'แก้ไขข้อมูลก่อนส่ง' : 'บันทึก HIV LAB Alert'}</h2></div></div>
          </div>
          <form onSubmit={submit} className="space-y-4 p-4">
            <Field label="HN"><Input value={form.hn} onChange={(event) => setForm((current) => ({ ...current, hn: event.target.value }))} placeholder="HN" autoComplete="off" required /></Field>
            <Field label="LN / HIV DRT Barcode" hint={editingId ? 'LN ผูกกับตัวอย่าง HIV DRT แล้ว จึงแก้ไขไม่ได้' : 'ระบบจะใช้ LN เป็น Barcode / Sample ID ใน HIV DRT'}><Input value={form.ln} onChange={(event) => setForm((current) => ({ ...current, ln: event.target.value }))} className="mono" placeholder="LN / Sample ID" autoComplete="off" disabled={Boolean(editingId)} required /></Field>
            <Field label="ชื่อ-นามสกุล" hint={editingId ? 'เว้นว่างได้หากแก้เฉพาะ HN; ระบบไม่เก็บชื่อจริง' : 'ระบบจะเก็บและส่งต่อเฉพาะชื่อปกปิด เช่น ศิxxxน์ จำxxxน์'}><Input value={form.patientName} onChange={(event) => setForm((current) => ({ ...current, patientName: event.target.value }))} placeholder={editingId ? 'กรอกใหม่เมื่อเปลี่ยนชื่อ' : 'ชื่อจริงและนามสกุล'} autoComplete="off" required={!editingId} /></Field>
            {!editingId ? <>
              <Field label="Rack" hint="เลือกเฉพาะ Rack ที่ยังมีช่องว่าง; ตำแหน่งจะ Auto-fill และยืนยันซ้ำแบบ lock ตอนบันทึก"><Select value={form.rackId} onChange={(event) => setForm((current) => ({ ...current, rackId: event.target.value }))} disabled={!availableRacks.length} required><option value="">{availableRacks.length ? 'เลือก Rack' : 'ไม่มี Rack ที่ว่าง'}</option>{availableRacks.map((rack) => <option key={rack.id} value={rack.id}>{rack.rackCode} · ความจุ {rack.capacity}</option>)}</Select></Field>
              <div className="rounded-lg border border-[#c9dedf] bg-[#f3f9f9] p-3 text-sm text-[#315763]"><p className="font-semibold">ช่องเก็บที่จะใช้</p><p className="mt-1 text-lg font-bold text-[#0b7f76]">{selectedRack ? `${selectedRack.rackCode} · ${formatHivDrtPosition(selectedRack.nextAutoPosition)}` : 'เลือก Rack ก่อน'}</p><p className="mt-1 text-[11px] leading-5 text-[#789097]">เป็นตำแหน่งคาดการณ์ปัจจุบัน ตำแหน่งจริงจะถูกล็อกและคำนวณอีกครั้งใน transaction</p></div>
            </> : null}
            <div className="rounded-lg border border-[#eed4a6] bg-[#fff9ed] p-3 text-xs leading-5 text-[#8f5919]">การบันทึกยังไม่ส่ง LINE อัตโนมัติ ต้องกดปุ่ม “ส่งเข้า LINE” ที่รายการภายหลัง และหลังส่งสำเร็จจะแก้ไขหรือลบไม่ได้</div>
            <div className="flex flex-wrap gap-2"><Button disabled={busy !== null || (!editingId && (!selectedRack || selectedRack.nextAutoPosition === null))} className="flex-1">{busy === 'create' || busy?.startsWith('edit:') ? <LoaderCircle className="size-4 animate-spin" /> : <Check className="size-4" />}{editingId ? 'บันทึกการแก้ไข' : 'บันทึก Alert + เก็บเข้า Storage'}</Button>{editingId ? <Button type="button" variant="secondary" disabled={busy !== null} onClick={resetForm}><X className="size-4" /> ยกเลิก</Button> : null}</div>
            {!availableRacks.length ? <Link href="/hiv-drt?view=storage" className="inline-flex items-center gap-1 text-xs font-semibold text-[#0b7f76] hover:underline">สร้าง Rack หรือเพิ่ม Rack ที่ว่างใน HIV DRT ก่อน <ExternalLink className="size-3" /></Link> : null}
          </form>
        </Card>

        <div className="space-y-4">
          {notice ? <Notice tone={notice.tone}>{notice.text}</Notice> : null}
          <Card className="overflow-hidden">
            <div className="flex flex-col gap-2 border-b border-[#dce8e9] bg-[#fbfdfd] p-4 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-bold text-[#173d50]">รายการ HIV LAB Alert</h2><p className="mt-1 text-xs text-[#789097]">ชื่อที่แสดงในระบบและ LINE เป็นชื่อปกปิดเท่านั้น · {workspace.alerts.length} รายการ</p></div><Link href="/hiv-drt?view=storage" className="inline-flex items-center gap-1 text-xs font-semibold text-[#0b7f76] hover:underline">เปิด HIV DRT Storage <ExternalLink className="size-3" /></Link></div>
            <div className="overflow-x-auto"><table className="w-full min-w-[980px] text-left text-sm"><thead className="bg-[#f4f8f8] text-[10px] font-bold tracking-[.08em] text-[#718a91] uppercase"><tr><th className="px-4 py-3">HN / LN</th><th className="px-4 py-3">ชื่อปกปิด</th><th className="px-4 py-3">HIV DRT Storage</th><th className="px-4 py-3">LINE</th><th className="px-4 py-3">สร้างเมื่อ</th><th className="px-4 py-3 text-right">ดำเนินการ</th></tr></thead><tbody className="divide-y divide-[#edf2f2]">{pagedAlerts.map((alert) => <AlertRow key={alert.id} alert={alert} busy={busy} onEdit={editAlert} onDelete={removeAlert} onSend={sendAlert} />)}</tbody></table></div>
            {workspace.alerts.length > HIV_LAB_ALERT_PAGE_SIZE ? <Pagination {...alertPagination} total={workspace.alerts.length} onChange={alertPagination.setPage} /> : null}
            {!workspace.alerts.length ? <div className="grid place-items-center px-4 py-16 text-center text-sm text-[#8aa0a5]"><BellRing className="mb-2 size-8 text-[#91bbb8]" /><p>ยังไม่มี HIV LAB Alert</p><p className="mt-1 text-xs">เมื่อบันทึกแล้ว ตัวอย่างจะปรากฏใน HIV DRT Storage ทันที</p></div> : null}
          </Card>
        </div>
      </div>
    </div>
  )
}

function AlertRow({ alert, busy, onEdit, onDelete, onSend }: { alert: HivLabAlert; busy: string | null; onEdit: (alert: HivLabAlert) => void; onDelete: (alert: HivLabAlert) => void; onSend: (alert: HivLabAlert) => void }) {
  const sent = alert.lineStatus === 'sent' || Boolean(alert.lineSentAt)
  const sending = alert.lineStatus === 'sending'
  return (
    <tr id={`alert-${alert.id}`} className="align-top hover:bg-[#f8fbfb]">
      <td className="px-4 py-3"><strong className="mono block text-[#173d50]">{alert.hn}</strong><span className="mono mt-1 block text-xs text-[#58747d]">{alert.ln}</span></td>
      <td className="px-4 py-3"><span className="font-semibold text-[#315763]">{alert.patientNameMasked}</span><p className="mt-1 text-[11px] text-[#8ba0a5]">ไม่เก็บชื่อจริง</p></td>
      <td className="px-4 py-3"><p className="font-semibold text-[#315763]">{alert.storageRackCode ?? '-'} · {formatHivDrtPosition(alert.storagePosition)}</p><p className="mt-1 text-[11px] text-[#789097]">{alert.storageStatus || 'ไม่พบสถานะตัวอย่าง'}</p><Link href={`/hiv-drt?view=storage&sample=${encodeURIComponent(alert.hivDrtSampleId)}`} className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-[#0b7f76] hover:underline">เปิดตัวอย่างใน HIV DRT <ExternalLink className="size-3" /></Link></td>
      <td className="px-4 py-3">{sent ? <><StatusBadge tone="accepted" label="ส่งสำเร็จ" /><p className="mt-1 text-[11px] text-[#789097]">{alert.lineSentAt ? formatDateTime(alert.lineSentAt) : '-'}</p></> : sending ? <StatusBadge tone="warning" label="กำลังส่ง" /> : <><StatusBadge tone="neutral" label="ยังไม่ส่ง" /><p className="mt-1 text-[11px] text-[#789097]">ลองส่งแล้ว {alert.lineSendAttempts} ครั้ง</p></>}</td>
      <td className="px-4 py-3 text-xs text-[#58747d]">{formatDateTime(alert.createdAt)}</td>
      <td className="px-4 py-3"><div className="flex min-w-44 flex-wrap justify-end gap-2">{sent ? <Button type="button" variant="secondary" disabled><Check className="size-4" /> ส่งสำเร็จ</Button> : <Button type="button" disabled={busy !== null || sending} onClick={() => void onSend(alert)}><Send className="size-4" /> {busy === `send:${alert.id}` ? 'กำลังส่ง' : 'ส่งเข้า LINE'}</Button>}{!sent && !sending ? <><Button type="button" variant="ghost" disabled={busy !== null} onClick={() => onEdit(alert)} aria-label={`แก้ไข ${alert.ln}`}><Pencil className="size-4" /> แก้ไข</Button><Button type="button" variant="danger" disabled={busy !== null} onClick={() => void onDelete(alert)} aria-label={`ลบ ${alert.ln}`}><Trash2 className="size-4" /> ลบ</Button></> : null}</div></td>
    </tr>
  )
}
