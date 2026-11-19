'use client'

import { useEffect, useId, useMemo, useState, type FormEvent } from 'react'
import { Copy, LoaderCircle, RefreshCw, Trash2 } from 'lucide-react'
import type { BmActor } from '@/lib/bm/types'
import { formatThaiDateTime } from '@/lib/bm/thai-date'
import { DAY_PART_LABEL, entryPermissionError, isLockedForStaff, KIND_LABEL, STAFF_EDIT_WINDOW_DAYS, THAI_DAYS_SHORT, THAI_MONTHS_SHORT, dayOfWeek } from '@/lib/calendar/rules'
import {
  CALENDAR_COLORS,
  CALENDAR_KINDS,
  DAY_PARTS,
  type CalendarColor,
  type CalendarEvent,
  type CalendarHistoryEntry,
  type CalendarHoliday,
  type CalendarKind,
  type CalendarType,
  type CalendarUser,
  type DayPart,
} from '@/lib/calendar/types'
import type { CalendarIconKey } from '@/lib/calendar/icon-keys'
import { api, Button, Input, Notice, Select, Textarea } from '@/components/ui'
import { CalendarIcon, COLOR_HEX, COLOR_LABELS, ICON_KEYS, ICON_LABELS } from '@/components/calendar/calendar-icon'
import { Modal } from '@/components/calendar/modal'

const labelClass = 'mb-1.5 block text-[13px] font-semibold text-[#173d50]'
const hintClass = 'mt-1 block text-xs text-[#6a838c]'

function colorVar(color: CalendarColor) {
  return { '--c': COLOR_HEX[color] } as React.CSSProperties
}

function messageOf(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}

/* ---------- entry ---------- */

export type EntryDraft = {
  id: string | null
  typeId: string
  userId: string
  startDate: string
  endDate: string
  dayPart: DayPart
  note: string
}

export function EntryDialog({
  draft,
  onClose,
  actor,
  today,
  types,
  users,
  onSaved,
  onDeleted,
}: {
  draft: EntryDraft | null
  onClose: () => void
  actor: BmActor
  today: string
  types: CalendarType[]
  users: CalendarUser[]
  onSaved: (event: CalendarEvent, isNew: boolean) => Promise<void>
  onDeleted: (id: string) => Promise<void>
}) {
  const labelId = useId()
  return (
    <Modal open={Boolean(draft)} onClose={onClose} title={draft?.id ? 'แก้ไขรายการ' : 'ลงรายการ'} labelId={labelId}>
      {draft ? <EntryForm key={draft.id ?? `new-${draft.startDate}`} draft={draft} onClose={onClose} actor={actor} today={today} types={types} users={users} onSaved={onSaved} onDeleted={onDeleted} /> : null}
    </Modal>
  )
}

function EntryForm({
  draft,
  onClose,
  actor,
  today,
  types,
  users,
  onSaved,
  onDeleted,
}: {
  draft: EntryDraft
  onClose: () => void
  actor: BmActor
  today: string
  types: CalendarType[]
  users: CalendarUser[]
  onSaved: (event: CalendarEvent, isNew: boolean) => Promise<void>
  onDeleted: (id: string) => Promise<void>
}) {
  const [form, setForm] = useState(draft)
  const [busy, setBusy] = useState<'' | 'save' | 'delete'>('')
  const [error, setError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [history, setHistory] = useState<CalendarHistoryEntry[] | null>(null)
  const isNew = !draft.id
  const isAdmin = actor.role === 'Admin'
  const choosable = types.filter((type) => type.isActive || type.id === draft.typeId)
  const selectedType = types.find((type) => type.id === form.typeId)
  const readOnly = !isNew && entryPermissionError(actor, { userId: draft.userId, endDate: draft.endDate }, today) !== null
  const lockedForStaff = !isNew && isLockedForStaff(draft.endDate, today)

  useEffect(() => {
    if (!draft.id) return
    let alive = true
    api<{ history: CalendarHistoryEntry[] }>(`/api/calendar/entries/${draft.id}/history`)
      .then((result) => alive && setHistory(result.history))
      .catch(() => alive && setHistory([]))
    return () => {
      alive = false
    }
  }, [draft.id])

  const peopleOptions = isAdmin ? users : users.filter((user) => user.id === actor.id)
  const ownerMissing = !peopleOptions.some((user) => user.id === form.userId)

  function update<K extends keyof EntryDraft>(key: K, value: EntryDraft[K]) {
    setForm((current) => {
      const next = { ...current, [key]: value }
      if (key === 'startDate' && next.endDate < next.startDate) next.endDate = next.startDate
      if (next.startDate !== next.endDate && next.dayPart !== 'full') next.dayPart = 'full'
      return next
    })
    setError('')
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!form.typeId) return setError('เลือกประเภทก่อนบันทึก')
    if (form.endDate < form.startDate) return setError('วันที่สิ้นสุดต้องไม่ก่อนวันเริ่ม แก้ช่อง “ถึง”')
    setBusy('save')
    try {
      const body = JSON.stringify({ ...form, note: form.note.trim() || null })
      const result = isNew
        ? await api<{ event: CalendarEvent }>('/api/calendar', { method: 'POST', body })
        : await api<{ event: CalendarEvent }>(`/api/calendar/entries/${draft.id}`, { method: 'PATCH', body })
      await onSaved(result.event, isNew)
    } catch (saveError) {
      setError(messageOf(saveError, 'บันทึกไม่สำเร็จ'))
    } finally {
      setBusy('')
    }
  }

  async function remove() {
    if (!draft.id) return
    setBusy('delete')
    try {
      await api(`/api/calendar/entries/${draft.id}`, { method: 'DELETE' })
      await onDeleted(draft.id)
    } catch (deleteError) {
      setError(messageOf(deleteError, 'ลบไม่สำเร็จ'))
      setConfirmDelete(false)
    } finally {
      setBusy('')
    }
  }

  const lineLine = selectedType
    ? selectedType.inLineDigest
      ? 'แจ้งในกลุ่ม LINE ล่วงหน้า 1 วัน ช่วงบ่าย (ไม่แสดงหมายเหตุ)'
      : `${selectedType.name} ไม่ได้แจ้งในกลุ่ม LINE`
    : ''

  return (
    <form onSubmit={submit} className="grid gap-4" noValidate>
      {readOnly ? <Notice tone="info">{draft.userId !== actor.id ? 'ดูได้อย่างเดียว แก้ได้เฉพาะเจ้าของรายการหรือ Admin' : `รายการนี้ผ่านมาเกิน ${STAFF_EDIT_WINDOW_DAYS} วันแล้ว แก้ไม่ได้ ติดต่อ Admin`}</Notice> : null}
      {!readOnly && isAdmin && lockedForStaff ? (
        <p className="rounded-lg bg-[#fff8e8] px-3 py-2 text-[13px] text-[#8a5410]">รายการนี้ผ่านมาเกิน {STAFF_EDIT_WINDOW_DAYS} วัน Staff แก้ไม่ได้แล้ว คุณแก้ได้เพราะเป็น Admin และการแก้จะถูกบันทึกในประวัติ</p>
      ) : null}

      <fieldset disabled={readOnly || Boolean(busy)} className="grid gap-4">
        <div>
          <span className={labelClass} id="cal-type-label">ประเภท</span>
          <div role="radiogroup" aria-labelledby="cal-type-label" className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-1.5">
            {choosable.map((type) => (
              <label key={type.id} className="cal-pick" style={colorVar(type.colorKey)}>
                <input type="radio" name="typeId" value={type.id} checked={form.typeId === type.id} onChange={() => update('typeId', type.id)} className="sr-only" />
                <CalendarIcon iconKey={type.iconKey} size={18} />
                {type.name}
              </label>
            ))}
          </div>
        </div>

        <label className="block">
          <span className={labelClass}>ของ</span>
          <Select value={form.userId} onChange={(event) => update('userId', event.target.value)} disabled={!isAdmin}>
            {ownerMissing ? <option value={form.userId}>{users.find((user) => user.id === form.userId)?.displayName ?? 'ผู้ใช้ที่ไม่อยู่ในทีมแล้ว'}</option> : null}
            {peopleOptions.map((user) => (
              <option key={user.id} value={user.id}>{user.displayName}{user.id === actor.id ? ' (ฉัน)' : ''}</option>
            ))}
          </Select>
          {!isAdmin ? <span className={hintClass}>ลงได้เฉพาะของตัวเอง · Admin ลงแทนคนอื่นได้</span> : null}
        </label>

        <div className="grid grid-cols-2 gap-2.5">
          <label className="block">
            <span className={labelClass}>ตั้งแต่</span>
            <Input type="date" required value={form.startDate} onChange={(event) => update('startDate', event.target.value)} />
          </label>
          <label className="block">
            <span className={labelClass}>ถึง</span>
            <Input type="date" required min={form.startDate} value={form.endDate} onChange={(event) => update('endDate', event.target.value)} aria-invalid={form.endDate < form.startDate} />
          </label>
        </div>

        <div>
          <span className={labelClass} id="cal-part-label">ช่วงเวลา</span>
          <div role="radiogroup" aria-labelledby="cal-part-label" className="flex flex-wrap gap-1.5">
            {DAY_PARTS.map((part) => {
              const disabled = part !== 'full' && form.startDate !== form.endDate
              return (
                <label key={part} className={`cal-seg-option ${disabled ? 'cursor-not-allowed opacity-45' : ''}`}>
                  <input type="radio" name="dayPart" value={part} checked={form.dayPart === part} disabled={disabled} onChange={() => update('dayPart', part)} className="sr-only" />
                  {DAY_PART_LABEL[part]}
                </label>
              )
            })}
          </div>
          {form.startDate !== form.endDate ? <span className={hintClass}>ลาครึ่งวันได้ทีละวันเดียว</span> : null}
        </div>

        <label className="block">
          <span className={labelClass}>หมายเหตุ <span className="font-normal text-[#6a838c]">(ไม่บังคับ)</span></span>
          <Textarea rows={2} maxLength={300} value={form.note} onChange={(event) => update('note', event.target.value)} placeholder="เช่น ติดต่อได้ทางไลน์" />
        </label>
      </fieldset>

      {lineLine ? (
        <p className="flex items-center gap-2.5 rounded-[10px] border border-[#d6e2e3] px-3 py-2.5 text-[13px] text-[#173d50]">
          <span aria-hidden="true" className="grid size-7 flex-none place-items-center rounded-[7px] bg-[#06c755] text-[9.5px] font-bold text-white">LINE</span>
          {lineLine}
        </p>
      ) : null}

      {!isNew ? (
        <details className="border-t border-[#edf2f2] pt-2.5 text-xs text-[#6a838c]">
          <summary className="flex min-h-8 cursor-pointer items-center font-semibold">
            {history === null ? 'กำลังโหลดประวัติ…' : history.length ? `ประวัติ · ${history.length} ครั้ง · ล่าสุด ${history[history.length - 1].actorName} ${formatThaiDateTime(history[history.length - 1].at)}` : 'ไม่มีประวัติ'}
          </summary>
          {history?.length ? (
            <ol className="mt-1.5 grid list-decimal gap-1 pl-5">
              {history.map((item, index) => (
                <li key={`${item.at}-${index}`}>
                  <span className="mono text-[11px]">{formatThaiDateTime(item.at)}</span> · {item.actorName}{' '}
                  {item.action === 'create' ? 'ลงรายการ' : item.action === 'delete' ? 'ลบ' : item.changes.length ? `แก้ ${item.changes.join(', ')}` : 'บันทึก (ไม่มีการเปลี่ยน)'}
                </li>
              ))}
            </ol>
          ) : null}
        </details>
      ) : null}

      {error ? <p role="alert" className="text-[13px] font-semibold text-[#af3541]">{error}</p> : null}

      {confirmDelete ? (
        <div role="alert" className="flex flex-wrap items-center gap-2 rounded-lg bg-[#fff1f2] px-3 py-2.5 text-[13px] text-[#173d50]">
          ลบ “{selectedType?.name} · {users.find((user) => user.id === form.userId)?.displayName ?? ''}” ใช่ไหม?
          <span className="flex-1" />
          <Button type="button" variant="secondary" onClick={() => setConfirmDelete(false)}>ไม่ลบ</Button>
          <Button type="button" variant="danger" onClick={remove} disabled={busy === 'delete'}>
            {busy === 'delete' ? <LoaderCircle className="size-4 animate-spin" /> : null} ลบรายการ
          </Button>
        </div>
      ) : null}

      <div className="flex flex-wrap justify-end gap-2">
        {!isNew && !readOnly && !confirmDelete ? (
          <Button type="button" variant="ghost" className="mr-auto !text-[#af3541]" onClick={() => setConfirmDelete(true)}>
            <Trash2 className="size-4" /> ลบ
          </Button>
        ) : null}
        <Button type="button" variant="secondary" onClick={onClose}>{readOnly ? 'ปิด' : 'ยกเลิก'}</Button>
        {!readOnly ? (
          <Button type="submit" disabled={Boolean(busy)}>
            {busy === 'save' ? <LoaderCircle className="size-4 animate-spin" /> : null}
            {isNew ? 'บันทึก' : 'บันทึกการแก้ไข'}
          </Button>
        ) : null}
      </div>
    </form>
  )
}

/* ---------- types (Admin) ---------- */

type TypeDraft = {
  id: string | null
  name: string
  iconKey: CalendarIconKey
  colorKey: CalendarColor
  kind: CalendarKind
  inLineDigest: boolean
  isActive: boolean
}

export function TypeDialog({ open, onClose, types, onChanged }: { open: boolean; onClose: () => void; types: CalendarType[]; onChanged: (types: CalendarType[]) => void }) {
  const labelId = useId()
  return (
    <Modal open={open} onClose={onClose} title="ประเภทรายการ" labelId={labelId}>
      <TypePanel types={types} onChanged={onChanged} />
    </Modal>
  )
}

/** Mounted only while the dialog is open, so its draft resets every time. */
function TypePanel({ types, onChanged }: { types: CalendarType[]; onChanged: (types: CalendarType[]) => void }) {
  const [draft, setDraft] = useState<TypeDraft | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function save() {
    if (!draft) return
    if (!draft.name.trim()) return setError('ใส่ชื่อประเภทก่อนบันทึก')
    setBusy(true)
    setError('')
    try {
      const { id, ...body } = draft
      const result = await api<{ types: CalendarType[] }>(id ? `/api/calendar/types/${id}` : '/api/calendar/types', {
        method: id ? 'PATCH' : 'POST',
        body: JSON.stringify(body),
      })
      onChanged(result.types)
      setDraft(null)
    } catch (saveError) {
      setError(messageOf(saveError, 'บันทึกประเภทไม่สำเร็จ'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      {!draft ? (
        <div className="grid gap-3">
          <ul className="grid gap-1.5">
            {types.map((type) => (
              <li key={type.id} className={`flex items-center gap-2.5 rounded-[9px] border border-[#d6e2e3] px-2.5 py-2 ${type.isActive ? '' : 'opacity-55'}`} style={colorVar(type.colorKey)}>
                <span className="cal-badge"><CalendarIcon iconKey={type.iconKey} size={20} /></span>
                <span className="grid min-w-0 flex-1">
                  <span className="text-sm font-semibold">{type.name}</span>
                  <span className="text-xs text-[#6a838c]">
                    {KIND_LABEL[type.kind]}{type.inLineDigest ? ' · แจ้ง LINE' : ''}{type.isActive ? '' : ' · ปิดใช้งาน'} · ใช้ {type.usageCount} รายการ
                  </span>
                </span>
                <Button
                  variant="secondary"
                  onClick={() => setDraft({ id: type.id, name: type.name, iconKey: (ICON_KEYS as readonly string[]).includes(type.iconKey) ? (type.iconKey as CalendarIconKey) : 'star', colorKey: type.colorKey, kind: type.kind, inLineDigest: type.inLineDigest, isActive: type.isActive })}
                >
                  แก้ไข
                </Button>
              </li>
            ))}
          </ul>
          <p className="text-xs text-[#6a838c]">ประเภทลบไม่ได้ ปิดใช้งานแทน ประวัติเดิมยังแสดงอยู่</p>
          <div className="flex justify-end">
            <Button onClick={() => setDraft({ id: null, name: '', iconKey: 'flask', colorKey: 'green', kind: 'other', inLineDigest: false, isActive: true })}>เพิ่มประเภท</Button>
          </div>
        </div>
      ) : (
        <div className="grid gap-4">
          <h3 className="text-sm font-bold text-[#173d50]">{draft.id ? 'แก้ไขประเภท' : 'เพิ่มประเภท'}</h3>
          <label className="block">
            <span className={labelClass}>ชื่อ</span>
            <Input value={draft.name} maxLength={40} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="เช่น ประชุมประจำเดือน" />
          </label>
          <label className="block">
            <span className={labelClass}>กลุ่ม</span>
            <Select value={draft.kind} onChange={(event) => setDraft({ ...draft, kind: event.target.value as CalendarKind })}>
              {CALENDAR_KINDS.map((kind) => <option key={kind} value={kind}>{KIND_LABEL[kind]}</option>)}
            </Select>
            <span className={hintClass}>เวร/หน้าที่ แสดงบนสุดของแต่ละวัน · การลาทั้งวัน นับว่าไม่อยู่ปฏิบัติงาน</span>
          </label>
          <div>
            <span className={labelClass} id="cal-icon-label">ไอคอน</span>
            <div role="group" aria-labelledby="cal-icon-label" className="grid max-h-[176px] grid-cols-[repeat(auto-fill,minmax(44px,1fr))] gap-1.5 overflow-auto p-0.5" style={colorVar(draft.colorKey)}>
              {ICON_KEYS.map((key) => (
                <button key={key} type="button" className="cal-icon-option" aria-pressed={draft.iconKey === key} aria-label={ICON_LABELS[key]} title={ICON_LABELS[key]} onClick={() => setDraft({ ...draft, iconKey: key })}>
                  <CalendarIcon iconKey={key} size={22} />
                </button>
              ))}
            </div>
          </div>
          <div>
            <span className={labelClass} id="cal-color-label">สี</span>
            <div role="group" aria-labelledby="cal-color-label" className="flex flex-wrap gap-2">
              {CALENDAR_COLORS.map((color) => (
                <button key={color} type="button" className="cal-swatch" style={colorVar(color)} aria-pressed={draft.colorKey === color} aria-label={COLOR_LABELS[color]} title={COLOR_LABELS[color]} onClick={() => setDraft({ ...draft, colorKey: color })} />
              ))}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2.5 rounded-[9px] bg-[#f4f8f7] p-2.5" style={colorVar(draft.colorKey)} aria-label="ตัวอย่าง">
            <span className="cal-chip !w-auto"><CalendarIcon iconKey={draft.iconKey} size={15} className="text-[var(--c)]" /><span className="font-semibold">ชื่อคน</span></span>
            <span className="cal-row !w-auto flex-1 !cursor-default">
              <span className="cal-badge"><CalendarIcon iconKey={draft.iconKey} size={20} /></span>
              <span className="grid"><span className="text-sm font-semibold">{draft.name || 'ชื่อประเภท'}</span><span className="text-xs text-[#6a838c]">{KIND_LABEL[draft.kind]}</span></span>
            </span>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="size-4 accent-[#0b7f76]" checked={draft.inLineDigest} onChange={(event) => setDraft({ ...draft, inLineDigest: event.target.checked })} />
            แจ้งประเภทนี้ในกลุ่ม LINE ล่วงหน้า 1 วัน (ช่วงบ่าย)
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="size-4 accent-[#0b7f76]" checked={draft.isActive} onChange={(event) => setDraft({ ...draft, isActive: event.target.checked })} />
            เปิดใช้งาน
          </label>
          {error ? <p role="alert" className="text-[13px] font-semibold text-[#af3541]">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => { setDraft(null); setError('') }}>ยกเลิก</Button>
            <Button onClick={save} disabled={busy}>{busy ? <LoaderCircle className="size-4 animate-spin" /> : null}บันทึก</Button>
          </div>
        </div>
      )}
    </>
  )
}

/* ---------- holidays (Admin) ---------- */

function holidayDateLabel(date: string) {
  const [y, m, d] = date.split('-').map(Number)
  return `${THAI_DAYS_SHORT[dayOfWeek(date)]} ${d} ${THAI_MONTHS_SHORT[m - 1]} ${String(y + 543).slice(2)}`
}

export function HolidayDialog({ open, onClose, syncedAt, syncError, onChanged }: { open: boolean; onClose: () => void; syncedAt: string | null; syncError: string | null; onChanged: () => void }) {
  const labelId = useId()
  return (
    <Modal open={open} onClose={onClose} title="วันหยุด" labelId={labelId}>
      <HolidayPanel syncedAt={syncedAt} syncError={syncError} onChanged={onChanged} />
    </Modal>
  )
}

/** Mounted only while the dialog is open; loads the list on mount. */
function HolidayPanel({ syncedAt, syncError, onChanged }: { syncedAt: string | null; syncError: string | null; onChanged: () => void }) {
  const [holidays, setHolidays] = useState<CalendarHoliday[] | null>(null)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [lastSync, setLastSync] = useState(syncedAt)
  const [form, setForm] = useState({ date: '', name: '' })

  useEffect(() => {
    let alive = true
    api<{ holidays: CalendarHoliday[] }>('/api/calendar/holidays')
      .then((result) => alive && setHolidays(result.holidays))
      .catch((loadError) => alive && setError(messageOf(loadError, 'โหลดวันหยุดไม่สำเร็จ')))
    return () => {
      alive = false
    }
  }, [])

  async function run(key: string, task: () => Promise<{ holidays: CalendarHoliday[] }>, done?: string) {
    setBusy(key)
    setError('')
    setNotice('')
    try {
      const result = await task()
      setHolidays(result.holidays)
      if (done) setNotice(done)
      onChanged()
    } catch (taskError) {
      setError(messageOf(taskError, 'ทำรายการไม่สำเร็จ'))
    } finally {
      setBusy('')
    }
  }

  const sorted = useMemo(() => [...(holidays ?? [])].sort((a, b) => a.date.localeCompare(b.date)), [holidays])

  return (
      <div className="grid gap-4">
        <div className="flex flex-wrap items-center gap-2.5 rounded-[10px] bg-[#f4f8f7] p-3">
          <span aria-hidden="true" className="grid size-8 flex-none place-items-center rounded-lg border border-[#d6e2e3] bg-white font-bold text-[#4285f4]">G</span>
          <span className="grid min-w-0 flex-1">
            <b className="text-sm">วันหยุดในไทย · Google Calendar</b>
            <small className="text-xs text-[#6a838c]">ซิงค์อัตโนมัติทุกวันตี 3 · ล่าสุด {lastSync ? formatThaiDateTime(lastSync) : 'ยังไม่เคย'}</small>
            {syncError && !notice ? <small className="text-xs text-[#af3541]">ครั้งก่อนไม่สำเร็จ: {syncError}</small> : null}
          </span>
          <Button
            variant="secondary"
            disabled={Boolean(busy)}
            onClick={() =>
              run('sync', async () => {
                const result = await api<{ result: { added: number }; holidays: CalendarHoliday[] }>('/api/calendar/holidays/sync', { method: 'POST' })
                setLastSync(new Date().toISOString())
                setNotice(result.result.added ? `ซิงค์แล้ว · เพิ่ม ${result.result.added} วัน` : 'ซิงค์แล้ว · ไม่มีวันหยุดใหม่')
                return result
              })
            }
          >
            {busy === 'sync' ? <LoaderCircle className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            {busy === 'sync' ? 'กำลังซิงค์…' : 'ซิงค์ตอนนี้'}
          </Button>
        </div>

        {notice ? <p role="status" className="text-[13px] font-semibold text-[#2f7d44]">{notice}</p> : null}
        {error ? <p role="alert" className="text-[13px] font-semibold text-[#af3541]">{error}</p> : null}

        {holidays === null ? (
          <p className="flex items-center gap-2 text-sm text-[#6a838c]"><LoaderCircle className="size-4 animate-spin" /> กำลังโหลด</p>
        ) : sorted.length ? (
          <ul className="grid max-h-[300px] gap-1 overflow-auto">
            {sorted.map((holiday) => (
              <li key={holiday.id} className="grid grid-cols-[1fr_auto] items-center gap-x-2.5 gap-y-0.5 rounded-lg border border-[#edf2f2] px-2.5 py-2 sm:grid-cols-[92px_minmax(0,1fr)_auto]">
                <span className="mono col-span-2 text-xs text-[#6a838c] sm:col-span-1">{holidayDateLabel(holiday.date)}</span>
                <span className={`min-w-0 text-sm ${holiday.isDayOff ? 'font-semibold' : 'text-[#6a838c]'}`}>
                  {holiday.name}
                  <span className="block text-[11px] font-normal text-[#6a838c]">
                    {holiday.source === 'google' ? (holiday.isObservance ? 'Google · วันสำคัญ (ไม่ใช่วันหยุด)' : 'Google') : 'เพิ่มเอง'}
                  </span>
                </span>
                <span className="flex items-center gap-1">
                  <label className="inline-flex min-h-8 items-center gap-1.5 text-xs whitespace-nowrap text-[#6a838c]">
                    <input
                      type="checkbox"
                      className="size-4 accent-[#0b7f76]"
                      checked={holiday.isDayOff}
                      disabled={Boolean(busy)}
                      onChange={(event) => run(`off-${holiday.id}`, () => api(`/api/calendar/holidays/${holiday.id}`, { method: 'PATCH', body: JSON.stringify({ isDayOff: event.target.checked }) }))}
                    />
                    นับเป็นวันหยุด
                  </label>
                  {holiday.source === 'manual' ? (
                    <button
                      type="button"
                      aria-label={`ลบ ${holiday.name}`}
                      disabled={Boolean(busy)}
                      onClick={() => run(`del-${holiday.id}`, () => api(`/api/calendar/holidays/${holiday.id}`, { method: 'DELETE' }), 'ลบวันหยุดแล้ว')}
                      className="inline-flex size-8 items-center justify-center rounded-md text-[#af3541] hover:bg-[#fff1f2] focus-visible:ring-2 focus-visible:ring-[#0b7f76] focus-visible:outline-none"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-[#6a838c]">ยังไม่มีวันหยุด กด “ซิงค์ตอนนี้” เพื่อดึงจาก Google</p>
        )}

        <form
          className="grid gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            if (!form.date || !form.name.trim()) return setError('ใส่ทั้งวันที่และชื่อวันหยุด')
            void run('add', () => api('/api/calendar/holidays', { method: 'POST', body: JSON.stringify(form) }), 'เพิ่มวันหยุดแล้ว').then(() => setForm({ date: '', name: '' }))
          }}
        >
          <span className={labelClass}>เพิ่มวันหยุดเอง <span className="font-normal text-[#6a838c]">เช่น วันหยุดพิเศษตามมติ ครม. หรือวันปิดแล็บ</span></span>
          <div className="grid gap-2 sm:grid-cols-[160px_minmax(0,1fr)_auto]">
            <Input type="date" aria-label="วันที่" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} />
            <Input aria-label="ชื่อวันหยุด" placeholder="ชื่อวันหยุด" maxLength={80} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
            <Button type="submit" disabled={Boolean(busy)}>เพิ่ม</Button>
          </div>
        </form>
      </div>
  )
}

/* ---------- phone calendar subscription ---------- */

export function SubscribeDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const labelId = useId()
  const [token, setToken] = useState<string | null>(null)
  const [scope, setScope] = useState<'mine' | 'team'>('mine')
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [confirmRotate, setConfirmRotate] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open || token) return
    api<{ token: string }>('/api/calendar/feed-token')
      .then((result) => setToken(result.token))
      .catch((loadError) => setError(messageOf(loadError, 'สร้างลิงก์ไม่สำเร็จ')))
  }, [open, token])

  const url = token ? `${window.location.origin}/api/calendar/feed/${token}.ics${scope === 'team' ? '?scope=team' : ''}` : ''

  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2500)
    } catch {
      ;(document.getElementById('cal-feed-url') as HTMLInputElement | null)?.select()
      setError('คัดลอกอัตโนมัติไม่ได้ เลือกลิงก์ไว้แล้ว กด Ctrl+C')
    }
  }

  async function rotate() {
    setBusy(true)
    try {
      const result = await api<{ token: string }>('/api/calendar/feed-token', { method: 'POST' })
      setToken(result.token)
      setConfirmRotate(false)
    } catch (rotateError) {
      setError(messageOf(rotateError, 'สร้างลิงก์ใหม่ไม่สำเร็จ'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="เพิ่มลงปฏิทินมือถือ" labelId={labelId}>
      <div className="grid gap-4">
        <div>
          <span className={labelClass} id="cal-scope-label">แสดงในปฏิทินมือถือ</span>
          <div role="radiogroup" aria-labelledby="cal-scope-label" className="flex flex-wrap gap-1.5">
            <label className="cal-seg-option"><input type="radio" className="sr-only" checked={scope === 'mine'} onChange={() => setScope('mine')} />เฉพาะของฉัน</label>
            <label className="cal-seg-option"><input type="radio" className="sr-only" checked={scope === 'team'} onChange={() => setScope('team')} />ทั้งทีม + วันหยุด</label>
          </div>
        </div>
        <label className="block">
          <span className={labelClass}>ลิงก์ส่วนตัวของคุณ</span>
          <span className="flex gap-1.5">
            <Input id="cal-feed-url" readOnly value={url || 'กำลังสร้างลิงก์…'} className="mono !text-[13px] text-[#6a838c]" onFocus={(event) => event.target.select()} />
            <Button type="button" onClick={copy} disabled={!url}><Copy className="size-4" />{copied ? 'คัดลอกแล้ว' : 'คัดลอก'}</Button>
          </span>
          <span className={hintClass}>ลิงก์นี้เป็นของคุณคนเดียว อย่าส่งต่อ หมายเหตุจะไม่แสดงในปฏิทินมือถือ</span>
        </label>
        <div>
          <span className={labelClass}>Google Calendar</span>
          <ol className="grid list-decimal gap-1 pl-5 text-[13px]">
            <li>เปิด calendar.google.com บนคอมพิวเตอร์</li>
            <li>ข้าง “ปฏิทินอื่นๆ” กด + แล้วเลือก “จาก URL”</li>
            <li>วางลิงก์ แล้วกด “เพิ่มปฏิทิน”</li>
          </ol>
        </div>
        <div>
          <span className={labelClass}>iPhone</span>
          <ol className="grid list-decimal gap-1 pl-5 text-[13px]">
            <li>การตั้งค่า → ปฏิทิน → บัญชี → เพิ่มบัญชี → อื่นๆ</li>
            <li>“เพิ่มปฏิทินที่สมัครรับ” แล้ววางลิงก์</li>
          </ol>
        </div>
        <p className="text-xs text-[#6a838c]">มือถือดึงข้อมูลใหม่เองทุกไม่กี่ชั่วโมง Google อาจช้าได้ถึง 1 วัน ถ้าต้องการดูล่าสุดให้เปิดในแอปนี้</p>
        {error ? <p role="alert" className="text-[13px] font-semibold text-[#af3541]">{error}</p> : null}
        {confirmRotate ? (
          <div role="alert" className="flex flex-wrap items-center gap-2 rounded-lg bg-[#fff1f2] px-3 py-2.5 text-[13px]">
            ลิงก์เดิมจะใช้ไม่ได้ทันที มือถือที่เพิ่มไว้ต้องเพิ่มใหม่
            <span className="flex-1" />
            <Button variant="secondary" onClick={() => setConfirmRotate(false)}>ไม่ทำ</Button>
            <Button variant="danger" onClick={rotate} disabled={busy}>{busy ? <LoaderCircle className="size-4 animate-spin" /> : null}สร้างลิงก์ใหม่</Button>
          </div>
        ) : null}
        <div className="flex flex-wrap justify-end gap-2">
          {!confirmRotate ? <Button variant="ghost" className="mr-auto !text-[#af3541]" onClick={() => setConfirmRotate(true)} disabled={!token}>ยกเลิกลิงก์เดิม สร้างใหม่</Button> : null}
          <Button variant="secondary" onClick={onClose}>เสร็จ</Button>
        </div>
      </div>
    </Modal>
  )
}

