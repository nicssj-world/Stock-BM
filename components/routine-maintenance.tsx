"use client"

import { useEffect, useState, type FormEvent } from "react"
import Link from "next/link"
import {
  ArrowDown,
  ArrowUp,
  CalendarDays,
  CheckSquare,
  ClipboardCheck,
  FileText,
  History,
  Lock,
  Pencil,
  Plus,
  QrCode,
  ShieldCheck,
  Trash2,
  Unlock,
  Wrench,
  X,
} from "lucide-react"
import type { BmActor } from "@/lib/bm/types"
import { formatDate } from "@/lib/bm/rules"
import {
  addRoutineDays,
  currentRoutineVersion,
  generateFormOccurrences,
  routineOccurrenceForPlannedDate,
  routinePeriodFor,
  routinePeriodKind,
  routineReviewPeriods,
  type RoutineFrequency,
  type RoutineMaintenanceEntry,
  type RoutineMaintenanceForm,
  type RoutineMaintenanceOccurrence,
  type RoutineMaintenanceReview,
  type RoutineMaintenanceWorkspace,
  type RoutineReviewPeriod,
  type RoutineTaskResult,
  type RoutineTaskState,
} from "@/lib/equipment/routine-maintenance"
import { api, Button, Card, Field, Input, Notice, Select, Textarea } from "@/components/ui"

type Draft = {
  formId: string | null
  name: string
  frequency: RoutineFrequency
  startsOn: string
  reviewerId: string
  items: string[]
  active: boolean
}

type LogPayload = {
  formId: string
  versionId: string
  plannedOn: string
  scheduledOn: string
  taskResults: RoutineTaskResult[]
  note: string | null
}

function frequencyLabel(value: RoutineFrequency) {
  return value[0].toUpperCase() + value.slice(1)
}

function frequencyDescription(value: RoutineFrequency) {
  return value === "daily"
    ? "ทุกวันทำการ"
    : value === "weekly"
      ? "ทุกสัปดาห์ ยึดวันจากวันเริ่ม"
      : value === "monthly"
        ? "ทุกเดือน ยึดเลขวันที่จากวันเริ่ม"
        : "ทุกปี ยึดเดือนและวันที่จากวันเริ่ม"
}

function taskStateLabel(value: RoutineTaskState) {
  return value === "done" ? "✓ ทำแล้ว" : value === "not-applicable" ? "N/A ไม่เกี่ยวข้อง" : "✕ ยังไม่ทำ"
}

function emptyDraft(today: string): Draft {
  return { formId: null, name: "", frequency: "daily", startsOn: today, reviewerId: "", items: [""], active: true }
}

function latestVersion(form: RoutineMaintenanceForm) {
  return [...form.versions].sort((a, b) => b.versionNumber - a.versionNumber || b.startsOn.localeCompare(a.startsOn))[0] ?? null
}

function entryLocked(entry: RoutineMaintenanceEntry, reviews: RoutineMaintenanceReview[]) {
  return reviews.some((review) => review.formId === entry.formId && review.frequency === entry.frequency && review.period === routinePeriodFor(entry.frequency, entry.plannedOn))
}

function occurrenceLocked(formId: string, frequency: RoutineFrequency, plannedOn: string, reviews: RoutineMaintenanceReview[]) {
  return reviews.some((review) => review.formId === formId && review.frequency === frequency && review.period === routinePeriodFor(frequency, plannedOn))
}

function reviewPeriodLabel(frequency: RoutineFrequency, period: string) {
  if (routinePeriodKind(frequency) === "year") return `ปี ${Number(period) + 543}`
  return new Intl.DateTimeFormat("th-TH", { month: "long", year: "numeric", timeZone: "Asia/Bangkok" }).format(new Date(`${period}-01T00:00:00+07:00`))
}

function availableReviewPeriods(form: RoutineMaintenanceForm, today: string, reviews: RoutineMaintenanceReview[]) {
  const periods = new Map<string, RoutineReviewPeriod>()
  for (const period of routineReviewPeriods(form, today)) periods.set(`${period.frequency}:${period.period}`, period)
  for (const review of reviews.filter((item) => item.formId === form.id)) {
    periods.set(`${review.frequency}:${review.period}`, { frequency: review.frequency, period: review.period })
  }
  return [...periods.values()].sort((a, b) => b.period.localeCompare(a.period) || a.frequency.localeCompare(b.frequency))
}

export function RoutineMaintenance({
  actor,
  equipmentId,
  token,
}: {
  actor: BmActor
  equipmentId?: string
  token?: string
}) {
  const endpoint = token
    ? `/api/equipment/routine-maintenance/qr/${encodeURIComponent(token)}`
    : `/api/equipment/routine-maintenance?equipmentId=${encodeURIComponent(equipmentId ?? "")}`
  const [data, setData] = useState<RoutineMaintenanceWorkspace | null>(null)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [busy, setBusy] = useState(false)
  const [selectedFormId, setSelectedFormId] = useState("")
  const [showHistory, setShowHistory] = useState(false)
  const [showReview, setShowReview] = useState(false)
  const [showHolidays, setShowHolidays] = useState(false)
  const [reviewFrequencySelection, setReviewFrequencySelection] = useState<RoutineFrequency | "">("")
  const [reviewPeriodSelection, setReviewPeriodSelection] = useState("")
  const [builderOpen, setBuilderOpen] = useState(false)
  const [draft, setDraft] = useState<Draft>(emptyDraft(""))
  const [logTarget, setLogTarget] = useState<{ form: RoutineMaintenanceForm; occurrence: RoutineMaintenanceOccurrence } | null>(null)
  const [holidayDate, setHolidayDate] = useState("")
  const [holidayNote, setHolidayNote] = useState("")
  const isAdmin = actor.role === "Admin"

  useEffect(() => {
    let active = true
    void api<{ workspace: RoutineMaintenanceWorkspace }>(endpoint)
      .then((result) => {
        if (active) setData(result.workspace)
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : "โหลด Routine Maintenance ไม่สำเร็จ")
      })
    return () => {
      active = false
    }
  }, [endpoint])

  async function submit(url: string, body: Record<string, unknown>, success?: string) {
    setBusy(true)
    setError("")
    setNotice("")
    try {
      const result = await api<{ workspace: RoutineMaintenanceWorkspace }>(url, { method: "POST", body: JSON.stringify(body) })
      setData(result.workspace)
      if (success) setNotice(success)
      return true
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "บันทึกไม่สำเร็จ")
      return false
    } finally {
      setBusy(false)
    }
  }

  const visibleForms = data?.forms.filter((form) => !token || form.active) ?? []
  const activeForms = visibleForms.filter((form) => form.active)
  const selectedForm = visibleForms.find((form) => form.id === selectedFormId) ?? activeForms[0] ?? visibleForms[0] ?? null
  const selectedHolidays = new Set((data?.holidays ?? []).filter((holiday) => holiday.formId === selectedForm?.id).map((holiday) => holiday.date))
  const occurrences = selectedForm && data
    ? generateFormOccurrences(selectedForm, addRoutineDays(data.today, -370), addRoutineDays(data.today, 370), selectedHolidays)
    : []
  const selectedEntries = data?.entries.filter((entry) => entry.formId === selectedForm?.id) ?? []
  const currentVersion = selectedForm && data ? currentRoutineVersion(selectedForm, data.today) : null
  const currentVersionOccurrence = currentVersion && data ? occurrences.find((occurrence) => occurrence.versionId === currentVersion.id && occurrence.scheduledOn === data.today) : null
  const currentPeriodDate = currentVersionOccurrence?.plannedOn ?? data?.today ?? ""
  const currentLocked = Boolean(currentVersion && selectedForm && currentPeriodDate && occurrenceLocked(selectedForm.id, currentVersion.frequency, currentPeriodDate, data?.reviews ?? []))
  const reviewPeriods = selectedForm && data ? availableReviewPeriods(selectedForm, data.today, data.reviews) : []
  const reviewFrequencies = [...new Set(reviewPeriods.map((item) => item.frequency))]
  const effectiveReviewFrequency: RoutineFrequency | "" = reviewFrequencySelection !== "" && reviewFrequencies.includes(reviewFrequencySelection)
    ? reviewFrequencySelection
    : currentVersion?.frequency ?? reviewFrequencies[0] ?? ""
  const selectedReviewPeriods = reviewPeriods.filter((item) => item.frequency === effectiveReviewFrequency)
  const effectiveReviewPeriod = selectedReviewPeriods.some((item) => item.period === reviewPeriodSelection)
    ? reviewPeriodSelection
    : selectedReviewPeriods[0]?.period ?? ""
  const selectedReviewLocked = Boolean(selectedForm && effectiveReviewFrequency && effectiveReviewPeriod && data?.reviews.some((reviewItem) => reviewItem.formId === selectedForm.id && reviewItem.frequency === effectiveReviewFrequency && reviewItem.period === effectiveReviewPeriod))
  const reviewerName = selectedForm && data ? data.users.find((user) => user.id === selectedForm.reviewerId)?.displayName ?? "ยังไม่กำหนด" : "ยังไม่กำหนด"
  const todayOccurrence = occurrences.find((occurrence) => occurrence.scheduledOn === data?.today)
  const nextOccurrence = occurrences.find((occurrence) => occurrence.scheduledOn >= (data?.today ?? ""))

  function openCreate() {
    setDraft(emptyDraft(data?.today ?? ""))
    setBuilderOpen(true)
  }

  function openEdit(form: RoutineMaintenanceForm) {
    const version = latestVersion(form)
    setSelectedFormId(form.id)
    setDraft({
      formId: form.id,
      name: form.name,
      frequency: version?.frequency ?? "daily",
      startsOn: version?.startsOn ?? data?.today ?? "",
      reviewerId: form.reviewerId ?? "",
      items: version?.items.map((item) => item.label) ?? [""],
      active: form.active,
    })
    setBuilderOpen(true)
  }

  async function saveDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const body = {
      action: draft.formId ? "update-form" : "create-form",
      ...(draft.formId ? { formId: draft.formId } : { equipmentId: data?.equipment?.id }),
      name: draft.name,
      frequency: draft.frequency,
      startsOn: draft.startsOn,
      reviewerId: draft.reviewerId || null,
      items: draft.items,
      active: draft.active,
    }
    const ok = await submit(endpointForInternal(endpoint, token), body, draft.formId ? "สร้าง Version ใหม่ให้ฟอร์มแล้ว" : "เพิ่มฟอร์ม Routine Maintenance แล้ว")
    if (ok) setBuilderOpen(false)
  }

  async function deactivate(form: RoutineMaintenanceForm) {
    if (!window.confirm(`ปิดใช้งานฟอร์ม “${form.name}” ใช่หรือไม่? ประวัติเดิมจะยังคงอยู่`)) return
    await submit(endpointForInternal(endpoint, token), { action: "deactivate-form", formId: form.id }, "ปิดใช้งานฟอร์มแล้ว")
  }

  async function addHoliday() {
    if (!selectedForm || !holidayDate) return
    const ok = await submit(endpointForInternal(endpoint, token), { action: "set-holiday", formId: selectedForm.id, date: holidayDate, note: holidayNote || null }, "บันทึกวันยกเว้นให้ฟอร์มแล้ว")
    if (ok) {
      setHolidayDate("")
      setHolidayNote("")
    }
  }

  function openLog(form: RoutineMaintenanceForm) {
    const formHolidays = new Set((data?.holidays ?? []).filter((holiday) => holiday.formId === form.id).map((holiday) => holiday.date))
    const formOccurrences = data ? generateFormOccurrences(form, addRoutineDays(data.today, -370), addRoutineDays(data.today, 370), formHolidays) : []
    const usable = formOccurrences.filter((occurrence) => occurrence.scheduledOn <= (data?.today ?? "") && !data?.entries.some((entry) => entry.formId === form.id && entry.plannedOn === occurrence.plannedOn) && !occurrenceLocked(form.id, occurrence.frequency, occurrence.plannedOn, data?.reviews ?? []))
    const target = isAdmin ? usable.at(-1) : formOccurrences.find((occurrence) => occurrence.scheduledOn === data?.today)
    if (!target) {
      setNotice(isAdmin ? "ยังไม่มีรอบที่พร้อมบันทึก หรือรอบทั้งหมดถูกล็อกแล้ว" : "ฟอร์มนี้ยังไม่ถึงกำหนดในวันนี้")
      return
    }
    setSelectedFormId(form.id)
    setLogTarget({ form, occurrence: target })
  }

  async function saveLog(payload: LogPayload) {
    const body = token
      ? { ...payload, idempotencyKey: crypto.randomUUID() }
      : { action: "log", ...payload, idempotencyKey: crypto.randomUUID() }
    const ok = await submit(endpoint, body, "บันทึก Routine Maintenance แล้ว")
    if (ok) setLogTarget(null)
  }

  async function review() {
    if (!selectedForm || !effectiveReviewFrequency || !effectiveReviewPeriod) return
    await submit(endpointForInternal(endpoint, token), { action: "review", formId: selectedForm.id, frequency: effectiveReviewFrequency, period: effectiveReviewPeriod }, "ล็อกงวด Review แล้ว")
  }

  async function unlock(reviewItem: RoutineMaintenanceReview) {
    await submit(endpointForInternal(endpoint, token), { action: "unlock", formId: reviewItem.formId, frequency: reviewItem.frequency, period: reviewItem.period }, "ปลดล็อกงวดแล้ว")
  }

  if (!data) return <Card className="p-6 text-sm text-[#58747d]">กำลังโหลด Routine Maintenance…</Card>
  if (!data.equipment) return <Card className="p-6"><p className="font-bold text-[#a83541]">ไม่พบเครื่องมือสำหรับ Routine Maintenance</p></Card>

  return <div className="space-y-4">
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold tracking-[.16em] text-[#0b7f76] uppercase">Equipment · Controlled checklist</p>
          <h2 className="mt-1 flex items-center gap-2 text-xl font-bold text-[#173d50]"><ClipboardCheck className="size-5 text-[#0b7f76]" /> Routine Maintenance</h2>
          <p className="mt-1 text-sm text-[#58747d]">{data.equipment.code} · {data.equipment.name} · {visibleForms.length} ฟอร์ม</p>
          {token ? <p className="mt-1 text-xs text-[#a9700f]">เปิดจาก QR หลัง Login · รายการจะบันทึกเป็นแหล่งที่มา QR</p> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
          <Link className="inline-flex min-h-9 items-center gap-1 rounded-md border border-[#c9dadd] bg-white px-3 text-[#0b7f76] hover:bg-[#f4fbfa]" href={`/equipment/routine/report?equipmentId=${data.equipment.id}${selectedForm ? `&formId=${selectedForm.id}` : ""}`}><FileText className="size-3.5" /> รายงาน</Link>
          {!token ? <>
            <Link className="inline-flex min-h-9 items-center gap-1 rounded-md border border-[#9ed8d1] bg-[#f3fbfa] px-3 text-[#0b7f76] hover:bg-[#e8f7f4]" href={`/equipment/routine/qr/${data.equipment.qrToken}`} target="_blank" rel="noreferrer" aria-label={`เปิด QR Routine Maintenance ของ ${data.equipment.name}`}><QrCode className="size-3.5" /> QR Routine</Link>
            <Link className="inline-flex min-h-9 items-center gap-1 rounded-md border border-[#c9dadd] bg-white px-3 text-[#58747d] hover:bg-[#f4fbfa]" href={`/service/equipment/${data.equipment.qrToken}`} target="_blank" rel="noreferrer" aria-label={`เปิด QR ฟอร์มช่างของ ${data.equipment.name}`}><Wrench className="size-3.5" /> QR ช่าง</Link>
          </> : null}
          {isAdmin && !token ? <Button type="button" className="min-h-9" onClick={openCreate}><Plus className="size-4" /> เพิ่มฟอร์ม</Button> : null}
        </div>
      </div>
      {error ? <div className="mt-3"><Notice tone="danger">{error}</Notice></div> : null}
      {notice ? <div className="mt-3"><Notice tone="success">{notice}</Notice></div> : null}
    </Card>

    {visibleForms.length ? <>
      <Card className="p-3">
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Routine Maintenance forms">
          {visibleForms.map((form) => <button key={form.id} type="button" role="tab" aria-selected={selectedForm?.id === form.id} onClick={() => setSelectedFormId(form.id)} className={`flex min-h-11 items-center gap-2 rounded-md border px-3 py-2 text-left text-sm font-bold transition ${selectedForm?.id === form.id ? "border-[#0b7f76] bg-[#0b7f76] text-white" : "border-[#d3e1e2] bg-white text-[#315763] hover:bg-[#f2f9f8]"}`}><CheckSquare className="size-4" /><span>{form.name}</span>{!form.active ? <span className="rounded-full bg-[#fff4df] px-1.5 py-0.5 text-[10px] text-[#9a641d]">ปิด</span> : null}</button>)}
        </div>
      </Card>

      {selectedForm ? <>
        <Card className="p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2"><h3 className="text-lg font-bold text-[#173d50]">{selectedForm.name}</h3><span className={`rounded-full px-2 py-1 text-[11px] font-bold ${selectedForm.active ? "bg-[#e8f7f4] text-[#0b7f76]" : "bg-[#f2f4f4] text-[#70868b]"}`}>{selectedForm.active ? "Active" : "Inactive"}</span></div>
              <p className="mt-1 text-sm text-[#58747d]">รอบ {currentVersion ? frequencyLabel(currentVersion.frequency) : "-"} · {currentVersion ? frequencyDescription(currentVersion.frequency) : "ยังไม่มี Version"} · เริ่ม {currentVersion?.startsOn ?? "-"}</p>
              <p className="mt-1 text-xs text-[#789097]">ผู้ตรวจ: {reviewerName} · Version {currentVersion?.versionNumber ?? "-"}</p>
            </div>
            {isAdmin && !token ? <div className="flex flex-wrap gap-2"><Button type="button" variant="secondary" className="min-h-9" onClick={() => openEdit(selectedForm)}><Pencil className="size-3.5" /> แก้ไข / Version ใหม่</Button>{selectedForm.active ? <Button type="button" variant="danger" className="min-h-9" onClick={() => void deactivate(selectedForm)}><Trash2 className="size-3.5" /> ปิดใช้งาน</Button> : null}</div> : null}
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]">
            <div className={`rounded-lg border p-3 ${todayOccurrence ? "border-[#b9ded8] bg-[#f3fbfa]" : "border-[#dbe6e6] bg-[#fafcfc]"}`}>
              <div className="flex items-start gap-3"><CalendarDays className="mt-0.5 size-5 text-[#0b7f76]" /><div><p className="text-xs font-bold tracking-[.1em] text-[#6d858b] uppercase">รอบวันนี้</p><p className="mt-1 font-bold text-[#173d50]">{todayOccurrence ? `${formatDate(todayOccurrence.plannedOn)}${todayOccurrence.shifted ? ` → ทำวันที่ ${formatDate(todayOccurrence.scheduledOn)}` : ""}` : "วันนี้ไม่มีรอบของฟอร์มนี้"}</p><p className="mt-1 text-xs text-[#789097]">{currentLocked ? "งวดนี้ถูก Review & Lock แล้ว" : selectedForm.active ? `งวดถัดไป: ${nextOccurrence ? formatDate(nextOccurrence.scheduledOn) : "-"}` : "ฟอร์มปิดใช้งาน"}</p></div></div>
            </div>
            <div className="flex items-center justify-end"><Button type="button" disabled={busy || !selectedForm.active || (!todayOccurrence && !isAdmin)} onClick={() => openLog(selectedForm)}><CheckSquare className="size-4" /> {isAdmin ? "บันทึก / แก้ไขรอบ" : "บันทึกวันนี้"}</Button></div>
          </div>
        </Card>

        <Card className="p-0">
          <button type="button" className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-bold text-[#315763] hover:bg-[#f6faf9]" onClick={() => setShowReview((value) => !value)}><span className="flex items-center gap-2"><ShieldCheck className="size-4 text-[#0b7f76]" /> Review & lock</span><span className="text-xs text-[#789097]">{showReview ? "ซ่อน" : "แสดง"}</span></button>
        </Card>
        {showReview ? <Card className="p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><h4 className="font-bold text-[#173d50]">Review & lock ต่อฟอร์ม</h4><p className="mt-1 text-xs text-[#58747d]">{effectiveReviewFrequency && effectiveReviewPeriod ? `${frequencyLabel(effectiveReviewFrequency)} ล็อกเป็น${routinePeriodKind(effectiveReviewFrequency) === "month" ? "รายเดือน" : "รายปี"} · ${reviewPeriodLabel(effectiveReviewFrequency, effectiveReviewPeriod)}` : "ยังไม่มีรอบ"}</p></div><div className="flex flex-wrap items-center gap-2">{selectedForm.reviewerId === actor.id && effectiveReviewFrequency && effectiveReviewPeriod && !selectedReviewLocked ? <Button type="button" variant="secondary" disabled={busy} onClick={() => void review()}><Lock className="size-4" /> Lock {reviewPeriodLabel(effectiveReviewFrequency, effectiveReviewPeriod)}</Button> : null}{selectedReviewLocked ? <span className="inline-flex items-center gap-1 rounded-full bg-[#e8f7f4] px-2 py-1 text-xs font-bold text-[#0b7f76]"><Lock className="size-3" /> Locked</span> : null}</div></div><div className="mt-4 grid gap-3 sm:grid-cols-2"><Field label="รอบที่ต้องการ Lock"><Select value={effectiveReviewFrequency} disabled={!reviewFrequencies.length} onChange={(event) => { setReviewFrequencySelection(event.target.value as RoutineFrequency); setReviewPeriodSelection("") }}><option value="">— เลือกรอบ —</option>{reviewFrequencies.map((frequency) => <option key={frequency} value={frequency}>{frequencyLabel(frequency)}</option>)}</Select></Field><Field label="งวดที่ต้องการ Lock"><Select value={effectiveReviewPeriod} disabled={!selectedReviewPeriods.length} onChange={(event) => setReviewPeriodSelection(event.target.value)}><option value="">— เลือกงวด —</option>{selectedReviewPeriods.map((item) => <option key={`${item.frequency}:${item.period}`} value={item.period}>{reviewPeriodLabel(item.frequency, item.period)} ({item.period})</option>)}</Select></Field></div><p className="mt-3 text-xs text-[#789097]">เลือกได้ทั้งงวดปัจจุบันและงวดที่ผ่านมา เช่น สิงหาคม เพื่อปิด Review ย้อนหลัง · ผู้ตรวจที่กำหนด: {reviewerName}{selectedForm.reviewerId !== actor.id ? " · เฉพาะผู้ตรวจที่กำหนดเท่านั้นที่ Lock ได้" : ""}</p>{isAdmin && data.reviews.filter((reviewItem) => reviewItem.formId === selectedForm.id).length ? <div className="mt-4 border-t border-[#e6eeee] pt-3"><p className="mb-2 text-xs font-bold text-[#58747d]">งวดที่ Lock แล้ว</p><div className="flex flex-wrap gap-2">{data.reviews.filter((reviewItem) => reviewItem.formId === selectedForm.id).slice(0, 12).map((reviewItem) => <span key={reviewItem.id} className="inline-flex items-center gap-1 rounded border border-[#dbe6e6] bg-[#fbfdfd] px-2 py-1 text-xs text-[#58747d]">{reviewItem.frequency} · {reviewItem.period}<button type="button" disabled={busy} className="ml-1 text-[#a83541] hover:underline" onClick={() => void unlock(reviewItem)} aria-label={`ปลดล็อก ${reviewItem.period}`}><Unlock className="size-3" /></button></span>)}</div></div> : null}</Card> : null}

        <Card className="p-0">
          <button type="button" className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-bold text-[#315763] hover:bg-[#f6faf9]" onClick={() => setShowHolidays((value) => !value)}><span>วันยกเว้นของฟอร์ม</span><span className="text-xs text-[#789097]">{showHolidays ? "ซ่อน" : `แสดง (${data.holidays.filter((holiday) => holiday.formId === selectedForm.id).length})`}</span></button>
        </Card>
        {showHolidays ? <Card className="p-4"><p className="text-xs leading-5 text-[#58747d]">เมื่อรอบตรงวันหยุด ระบบจะเลื่อนไปวันทำการถัดไป โดยยังเก็บวันที่ตามรอบเดิมไว้ในประวัติ</p>{isAdmin && !token ? <div className="mt-3 grid gap-2 md:grid-cols-[180px_1fr_auto]"><Field label="วันที่ยกเว้น"><Input type="date" value={holidayDate} onChange={(event) => setHolidayDate(event.target.value)} /></Field><Field label="หมายเหตุ"><Input value={holidayNote} onChange={(event) => setHolidayNote(event.target.value)} placeholder="เช่น ปิดปรับปรุง" /></Field><Button type="button" className="self-end" disabled={busy || !holidayDate} onClick={() => void addHoliday()}>เพิ่มวันยกเว้น</Button></div> : null}<div className="mt-4 divide-y divide-[#edf2f2]">{data.holidays.filter((holiday) => holiday.formId === selectedForm.id).map((holiday) => <div key={holiday.id} className="flex items-center justify-between gap-3 py-2 text-sm"><span><strong>{formatDate(holiday.date)}</strong><span className="ml-2 text-xs text-[#789097]">{holiday.note ?? "วันยกเว้น"}</span></span>{isAdmin && !token ? <button type="button" disabled={busy} className="text-xs font-bold text-[#a83541] hover:underline" onClick={() => void submit(endpointForInternal(endpoint, token), { action: "delete-holiday", formId: selectedForm.id, date: holiday.date }, "ลบวันยกเว้นแล้ว")}>ลบ</button> : null}</div>)}{!data.holidays.some((holiday) => holiday.formId === selectedForm.id) ? <p className="py-3 text-xs text-[#789097]">ยังไม่มีวันยกเว้นเฉพาะฟอร์มนี้</p> : null}</div></Card> : null}

        <Card className="p-0">
          <button type="button" className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-bold text-[#315763] hover:bg-[#f6faf9]" onClick={() => setShowHistory((value) => !value)}><span className="flex items-center gap-2"><History className="size-4 text-[#0b7f76]" /> ประวัติการทำ Maintenance</span><span className="text-xs text-[#789097]">{showHistory ? "ซ่อน" : `แสดง (${selectedEntries.length})`}</span></button>
        </Card>
        {showHistory ? <Card className="overflow-x-auto p-0"><table className="w-full min-w-[900px] text-left text-sm"><thead className="bg-[#f5f9f9] text-xs text-[#58747d]"><tr><th className="p-3">วันที่ตามรอบ</th><th className="p-3">วันที่ทำจริง</th><th className="p-3">ผู้ปฏิบัติ</th><th className="p-3">ผล</th><th className="p-3">หมายเหตุ</th><th className="p-3">แหล่งที่มา</th><th className="p-3">สถานะ</th>{isAdmin ? <th className="p-3 text-right">จัดการ</th> : null}</tr></thead><tbody className="divide-y divide-[#e6eeee]">{selectedEntries.slice(0, 100).map((entry) => { const locked = entryLocked(entry, data.reviews); return <tr key={entry.id}><td className="p-3">{formatDate(entry.plannedOn)}</td><td className="p-3">{entry.scheduledOn !== entry.plannedOn ? <>{formatDate(entry.scheduledOn)} <span className="text-[11px] text-[#a9700f]">(เลื่อน)</span></> : formatDate(entry.scheduledOn)}</td><td className="p-3"><strong>{entry.operatorCode}</strong><span className="ml-1 text-xs text-[#789097]">{entry.operatorName}</span></td><td className="p-3">✓ {entry.taskResults.filter((item) => item.state === "done").length} · N/A {entry.taskResults.filter((item) => item.state === "not-applicable").length} · ✕ {entry.taskResults.filter((item) => item.state === "not-done").length}</td><td className="max-w-[220px] p-3">{entry.note ?? "—"}</td><td className="p-3"><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${entry.source === "qr" ? "bg-[#fff4df] text-[#9a641d]" : "bg-[#eef7f6] text-[#0b7f76]"}`}>{entry.source === "qr" ? "QR" : "ภายในระบบ"}</span></td><td className="p-3">{locked ? <span className="inline-flex items-center gap-1 text-xs font-bold text-[#0b7f76]"><Lock className="size-3" /> Locked</span> : "เปิดแก้ไข"}</td>{isAdmin ? <td className="p-3 text-right">{locked ? <span className="text-xs text-[#789097]">ล็อกแล้ว</span> : <button type="button" disabled={busy} className="text-xs font-bold text-[#a83541] hover:underline disabled:opacity-50" onClick={() => { if (window.confirm(`ลบรายการ ${entry.plannedOn} นี้ใช่หรือไม่?`)) void submit(endpointForInternal(endpoint, token), { action: "delete-entry", id: entry.id }, "ลบรายการแล้ว") }}>ลบ</button>}</td> : null}</tr> })}{!selectedEntries.length ? <tr><td className="p-8 text-center text-[#789097]" colSpan={isAdmin ? 8 : 7}>ยังไม่มีประวัติของฟอร์มนี้</td></tr> : null}</tbody></table></Card> : null}
      </> : null}
    </> : <Card className="p-6"><p className="font-bold text-[#173d50]">ยังไม่มีฟอร์ม Routine Maintenance สำหรับเครื่องมือนี้</p><p className="mt-1 text-sm text-[#58747d]">Admin สามารถเพิ่มฟอร์มและ Checklist ได้จากปุ่ม “เพิ่มฟอร์ม”</p>{isAdmin && !token ? <Button type="button" className="mt-4" onClick={openCreate}><Plus className="size-4" /> เพิ่มฟอร์มแรก</Button> : null}</Card>}

    {builderOpen ? <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 p-0 sm:items-center sm:p-5" role="presentation" onMouseDown={() => setBuilderOpen(false)}><section role="dialog" aria-modal="true" aria-label="Routine Maintenance Form Builder" className="max-h-[94dvh] w-full max-w-3xl overflow-y-auto rounded-t-xl bg-white p-4 shadow-2xl sm:rounded-xl sm:p-6" onMouseDown={(event) => event.stopPropagation()}><div className="flex items-start justify-between gap-3"><div><p className="text-[11px] font-bold tracking-[.16em] text-[#0b7f76] uppercase">Form Builder</p><h3 className="mt-1 text-xl font-bold text-[#173d50]">{draft.formId ? "แก้ไขฟอร์มและสร้าง Version ใหม่" : "เพิ่ม Routine Maintenance Form"}</h3><p className="mt-1 text-xs text-[#789097]">Checklist เท่านั้น · แก้ไขรายการแล้วประวัติเดิมจะใช้ Snapshot ของ Version เดิม</p></div><button type="button" onClick={() => setBuilderOpen(false)} className="rounded p-1 text-[#58747d] hover:bg-[#eef5f4]" aria-label="ปิด"><X className="size-5" /></button></div><form className="mt-5 space-y-4" onSubmit={saveDraft}><div className="grid gap-3 sm:grid-cols-2"><Field label="ชื่อฟอร์ม *"><Input required value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="เช่น Weekly Cleaning" /></Field><Field label="รอบ *"><Select value={draft.frequency} onChange={(event) => setDraft({ ...draft, frequency: event.target.value as RoutineFrequency })}>{(["daily", "weekly", "monthly", "yearly"] as RoutineFrequency[]).map((frequency) => <option key={frequency} value={frequency}>{frequencyLabel(frequency)} · {frequencyDescription(frequency)}</option>)}</Select></Field><Field label="วันเริ่มต้น *" hint="ใช้เป็นวันตั้งต้นในการคำนวณรอบ"><Input required type="date" value={draft.startsOn} onChange={(event) => setDraft({ ...draft, startsOn: event.target.value })} /></Field><Field label="ผู้ตรวจประจำฟอร์ม"><Select value={draft.reviewerId} onChange={(event) => setDraft({ ...draft, reviewerId: event.target.value })}><option value="">— ยังไม่กำหนด —</option>{data.users.map((user) => <option key={user.id} value={user.id}>{user.displayName}</option>)}</Select></Field></div><label className="flex items-center gap-2 text-sm text-[#315763]"><input type="checkbox" checked={draft.active} onChange={(event) => setDraft({ ...draft, active: event.target.checked })} className="size-4 accent-[#0b7f76]" /> เปิดใช้งานฟอร์ม</label><div className="rounded-lg border border-[#dbe6e6] bg-[#fbfdfd] p-3"><div className="flex items-center justify-between gap-3"><div><h4 className="font-bold text-[#173d50]">Checklist</h4><p className="text-xs text-[#789097]">เพิ่ม ลบ และเลื่อนลำดับรายการได้</p></div><Button type="button" variant="secondary" className="min-h-9" onClick={() => setDraft({ ...draft, items: [...draft.items, ""] })}><Plus className="size-3.5" /> เพิ่มรายการ</Button></div><div className="mt-3 space-y-2">{draft.items.map((item, index) => <div key={`${index}-${item}`} className="flex items-start gap-2"><span className="mt-3 w-6 text-center text-xs font-bold text-[#789097]">{index + 1}</span><Input required value={item} onChange={(event) => setDraft({ ...draft, items: draft.items.map((current, itemIndex) => itemIndex === index ? event.target.value : current) })} placeholder="รายการตรวจสอบ" /><Button type="button" variant="ghost" className="min-h-11 px-2" disabled={draft.items.length <= 1} onClick={() => setDraft({ ...draft, items: draft.items.filter((_, itemIndex) => itemIndex !== index) })} aria-label={`ลบรายการที่ ${index + 1}`}><Trash2 className="size-4 text-[#a83541]" /></Button><div className="flex flex-col"><Button type="button" variant="ghost" className="min-h-5 px-1 py-0" disabled={index === 0} onClick={() => { const items = [...draft.items]; [items[index - 1], items[index]] = [items[index], items[index - 1]]; setDraft({ ...draft, items }) }} aria-label="เลื่อนขึ้น"><ArrowUp className="size-3.5" /></Button><Button type="button" variant="ghost" className="min-h-5 px-1 py-0" disabled={index === draft.items.length - 1} onClick={() => { const items = [...draft.items]; [items[index], items[index + 1]] = [items[index + 1], items[index]]; setDraft({ ...draft, items }) }} aria-label="เลื่อนลง"><ArrowDown className="size-3.5" /></Button></div></div>)}</div></div><div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setBuilderOpen(false)}>ยกเลิก</Button><Button type="submit" disabled={busy}><ClipboardCheck className="size-4" /> บันทึกฟอร์ม</Button></div></form></section></div> : null}
    {logTarget && selectedForm ? <RoutineLogDialog key={`${logTarget.form.id}:${logTarget.occurrence.versionId}:${logTarget.occurrence.plannedOn}`} actor={actor} form={logTarget.form} occurrence={logTarget.occurrence} entries={data.entries} reviews={data.reviews} holidays={new Set(data.holidays.filter((holiday) => holiday.formId === logTarget.form.id).map((holiday) => holiday.date))} today={data.today} busy={busy} onClose={() => setLogTarget(null)} onSave={(payload) => void saveLog(payload)} /> : null}
  </div>
}

function endpointForInternal(endpoint: string, token: string | undefined) {
  return token ? "/api/equipment/routine-maintenance" : endpoint
}

function RoutineLogDialog({
  actor,
  form,
  occurrence,
  entries,
  reviews,
  holidays,
  today,
  busy,
  onClose,
  onSave,
}: {
  actor: BmActor
  form: RoutineMaintenanceForm
  occurrence: RoutineMaintenanceOccurrence
  entries: RoutineMaintenanceEntry[]
  reviews: RoutineMaintenanceReview[]
  holidays: Set<string>
  today: string
  busy: boolean
  onClose: () => void
  onSave: (payload: LogPayload) => void
}) {
  const version = form.versions.find((item) => item.id === occurrence.versionId) ?? latestVersion(form)
  const [plannedDate, setPlannedDate] = useState(occurrence.plannedOn)
  const [results, setResults] = useState<RoutineTaskResult[]>(() => version?.items.map((item) => ({ itemId: item.id, label: item.label, state: "done" })) ?? [])
  const [note, setNote] = useState("")
  if (!version) return null
  const resolved = routineOccurrenceForPlannedDate(version, plannedDate, holidays)
  const existing = resolved ? entries.find((entry) => entry.formId === form.id && entry.plannedOn === resolved.plannedOn) : undefined
  const locked = resolved ? occurrenceLocked(form.id, version.frequency, resolved.plannedOn, reviews) : false
  const future = Boolean(resolved && (resolved.scheduledOn > today || resolved.plannedOn > today))

  function updateResult(itemId: string, state: RoutineTaskState) {
    setResults((current) => current.map((item) => item.itemId === itemId ? { ...item, state } : item))
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!resolved || existing || locked || future) return
    onSave({ formId: form.id, versionId: version.id, plannedOn: resolved.plannedOn, scheduledOn: resolved.scheduledOn, taskResults: results, note: note.trim() || null })
  }

  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 p-0 sm:items-center sm:p-5" role="presentation" onMouseDown={onClose}><section role="dialog" aria-modal="true" aria-label={`${form.name} checklist`} className="max-h-[94dvh] w-full max-w-3xl overflow-y-auto rounded-t-xl bg-white p-4 shadow-2xl sm:rounded-xl sm:p-6" onMouseDown={(event) => event.stopPropagation()}><div className="flex items-start justify-between gap-3"><div><p className="text-[11px] font-bold tracking-[.16em] text-[#0b7f76] uppercase">Routine Maintenance Checklist</p><h3 className="mt-1 text-xl font-bold text-[#173d50]">{form.name}</h3><p className="mt-1 text-sm text-[#58747d]">Version {version.versionNumber} · {frequencyLabel(version.frequency)}</p></div><button type="button" onClick={onClose} className="rounded p-1 text-[#58747d] hover:bg-[#eef5f4]" aria-label="ปิด"><X className="size-5" /></button></div><form className="mt-5 space-y-4" onSubmit={save}>{actor.role === "Admin" ? <Field label="วันที่ตามรอบ" hint="Admin เลือกย้อนหลังได้ ระบบจะตรวจว่าวันนี้ตรงกับรอบจริง"><Input type="date" value={plannedDate} onChange={(event) => setPlannedDate(event.target.value)} /></Field> : <div className="rounded-lg bg-[#f5f9f9] p-3 text-sm text-[#315763]">วันที่ตามรอบ: <strong>{formatDate(plannedDate)}</strong></div>}{resolved ? <div className="rounded-lg border border-[#cfe3e1] bg-[#f3fbfa] p-3 text-sm text-[#315763]">วันที่ระบบคำนวณให้ทำจริง: <strong>{formatDate(resolved.scheduledOn)}</strong>{resolved.shifted ? <span className="ml-2 text-xs font-bold text-[#a9700f]">เลื่อนจากวันหยุด/วันหยุดสุดสัปดาห์</span> : null}{existing ? <span className="ml-2 text-xs font-bold text-[#0b7f76]">บันทึกแล้วโดย {existing.operatorCode}</span> : null}{locked ? <span className="ml-2 text-xs font-bold text-[#a83541]">งวดถูก Lock</span> : null}</div> : <Notice tone="danger">วันที่นี้ไม่ตรงกับรอบของฟอร์ม หรืออยู่นอกช่วง Version</Notice>}{future ? <Notice tone="warning">วันที่ทำงานยังเป็นอนาคต จึงยังบันทึกไม่ได้</Notice> : null}<div className="space-y-2">{version.items.map((item, index) => <div key={item.id} className="grid gap-2 rounded-lg border border-[#e1ebeb] p-3 sm:grid-cols-[1fr_180px] sm:items-center"><span className="text-sm text-[#315763]"><strong className="mr-1 text-[#789097]">{index + 1}.</strong>{item.label}</span><Select disabled={Boolean(existing || locked || future || !resolved)} value={results.find((result) => result.itemId === item.id)?.state ?? "not-done"} onChange={(event) => updateResult(item.id, event.target.value as RoutineTaskState)}><option value="done">{taskStateLabel("done")}</option><option value="not-applicable">{taskStateLabel("not-applicable")}</option><option value="not-done">{taskStateLabel("not-done")}</option></Select></div>)}</div><Field label="หมายเหตุรวม"><Textarea rows={3} disabled={Boolean(existing || locked || future || !resolved)} value={existing?.note ?? note} onChange={(event) => setNote(event.target.value)} placeholder="บันทึกหมายเหตุของรอบนี้" /></Field><div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>ปิด</Button>{!existing ? <Button type="submit" disabled={busy || locked || future || !resolved}>{locked ? <Lock className="size-4" /> : <CheckSquare className="size-4" />} บันทึก Checklist</Button> : null}</div></form></section></div>
}
