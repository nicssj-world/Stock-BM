'use client'

import { useRef, useState, type FormEvent } from 'react'
import {
  CalendarCheck,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  Clock3,
  ListTodo,
  PauseCircle,
  Pencil,
  Plus,
  RefreshCw,
  UserRound,
  X,
} from 'lucide-react'
import type { BmActor } from '@/lib/bm/types'
import { addMonths } from '@/lib/monthly-tasks/rules'
import type { MonthlyTask, MonthlyTaskTemplate, MonthlyTaskWorkspace } from '@/lib/monthly-tasks/types'
import { formatDate, formatDateTime, todayBangkok } from '@/lib/bm/rules'
import { api, Button, Card, Field, Input, Notice, PageHeader, Select, StatCard, StatusBadge } from '@/components/ui'

type TaskForm = {
  title: string
  assigneeId: string
  dueDay: string
}

function defaultAssignee(data: MonthlyTaskWorkspace, actor: BmActor) {
  return data.users.some((user) => user.id === actor.id) ? actor.id : data.users[0]?.id ?? ''
}

function emptyForm(data: MonthlyTaskWorkspace, actor: BmActor): TaskForm {
  return { title: '', assigneeId: defaultAssignee(data, actor), dueDay: '15' }
}

function formFromTemplate(template: MonthlyTaskTemplate): TaskForm {
  return { title: template.title, assigneeId: template.assigneeId, dueDay: String(template.dueDay) }
}

function isOverdue(task: MonthlyTask, today: string) {
  return !task.isCompleted && task.deadline < today
}

function taskStatus(task: MonthlyTask, today: string) {
  if (task.isCompleted) return { tone: 'accepted' as const, label: 'เสร็จแล้ว' }
  if (isOverdue(task, today)) return { tone: 'rejected' as const, label: 'เลยกำหนด' }
  return { tone: 'neutral' as const, label: `Deadline ${formatDate(task.deadline)}` }
}

export function MonthlyTasksView({ actor, initialData }: { actor: BmActor; initialData: MonthlyTaskWorkspace }) {
  const [data, setData] = useState(initialData)
  const [selectedMonth, setSelectedMonth] = useState(initialData.month)
  const [form, setForm] = useState<TaskForm>(() => emptyForm(initialData, actor))
  const [editingId, setEditingId] = useState<string | null>(null)
  const [busy, setBusy] = useState('')
  const [notice, setNotice] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null)
  const taskFormRef = useRef<HTMLFormElement | null>(null)
  const isAdmin = actor.role === 'Admin'
  const today = todayBangkok()
  const todayMonth = today.slice(0, 7)
  const openTasks = data.tasks.filter((task) => !task.isCompleted)
  const completedTasks = data.tasks.filter((task) => task.isCompleted)
  const progress = data.totalCount ? Math.round((data.completedCount / data.totalCount) * 100) : 0

  function resetForm() {
    setEditingId(null)
    setForm(emptyForm(data, actor))
  }

  function startCreate() {
    resetForm()
    scrollToTaskForm()
  }

  function startEdit(template: MonthlyTaskTemplate) {
    setEditingId(template.id)
    setForm(formFromTemplate(template))
    scrollToTaskForm()
  }

  function scrollToTaskForm() {
    window.requestAnimationFrame(() => {
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      taskFormRef.current?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' })
    })
  }

  async function loadMonth(month: string) {
    setBusy('month')
    setNotice(null)
    try {
      const result = await api<{ workspace: MonthlyTaskWorkspace }>(`/api/monthly-tasks?month=${encodeURIComponent(month)}`)
      setData(result.workspace)
      setSelectedMonth(result.workspace.month)
    } catch (error) {
      setNotice({ tone: 'danger', text: error instanceof Error ? error.message : 'โหลดงานประจำเดือนไม่สำเร็จ' })
    } finally {
      setBusy('')
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const title = form.title.trim()
    const dueDay = Number(form.dueDay)
    if (!title) {
      setNotice({ tone: 'danger', text: 'กรุณาระบุงานที่ต้องทำ' })
      return
    }
    if (!form.assigneeId) {
      setNotice({ tone: 'danger', text: 'กรุณาเลือกผู้รับผิดชอบ' })
      return
    }
    if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31) {
      setNotice({ tone: 'danger', text: 'Deadline ต้องอยู่ระหว่างวันที่ 1–31' })
      return
    }

    setBusy('save')
    setNotice(null)
    try {
      const result = await api<{ workspace: MonthlyTaskWorkspace }>(editingId ? `/api/monthly-tasks/${editingId}` : '/api/monthly-tasks', {
        method: editingId ? 'PATCH' : 'POST',
        body: JSON.stringify({ month: selectedMonth, title, assigneeId: form.assigneeId, dueDay }),
      })
      setData(result.workspace)
      setSelectedMonth(result.workspace.month)
      setNotice({ tone: 'success', text: editingId ? 'แก้ไขงานประจำเดือนแล้ว' : 'เพิ่มงานประจำเดือนแล้ว' })
      setEditingId(null)
      setForm(emptyForm(result.workspace, actor))
    } catch (error) {
      setNotice({ tone: 'danger', text: error instanceof Error ? error.message : 'บันทึกงานไม่สำเร็จ' })
    } finally {
      setBusy('')
    }
  }

  async function toggleTask(task: MonthlyTask) {
    setBusy(`task:${task.id}`)
    setNotice(null)
    try {
      const result = await api<{ workspace: MonthlyTaskWorkspace }>(`/api/monthly-tasks/occurrences/${task.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ month: selectedMonth, completed: !task.isCompleted }),
      })
      setData(result.workspace)
    } catch (error) {
      setNotice({ tone: 'danger', text: error instanceof Error ? error.message : 'อัปเดตสถานะงานไม่สำเร็จ' })
    } finally {
      setBusy('')
    }
  }

  async function deactivateTemplate(template: MonthlyTaskTemplate) {
    if (!window.confirm(`ปิดงาน “${template.title}” ไม่ให้สร้างในเดือนถัดไปใช่ไหม? ประวัติเดือนที่ผ่านมาจะยังคงอยู่`)) return
    setBusy(`deactivate:${template.id}`)
    setNotice(null)
    try {
      const result = await api<{ workspace: MonthlyTaskWorkspace }>(`/api/monthly-tasks/${template.id}?month=${encodeURIComponent(selectedMonth)}`, { method: 'DELETE' })
      setData(result.workspace)
      if (editingId === template.id) resetForm()
      setNotice({ tone: 'success', text: 'ปิดแม่แบบงานแล้ว งานนี้จะไม่โผล่ในเดือนถัดไป' })
    } catch (error) {
      setNotice({ tone: 'danger', text: error instanceof Error ? error.message : 'ปิดงานไม่สำเร็จ' })
    } finally {
      setBusy('')
    }
  }

  function renderTask(task: MonthlyTask) {
    const canToggle = isAdmin || task.assigneeId === actor.id
    const status = taskStatus(task, today)
    return (
      <div key={task.id} className={`group flex min-w-0 flex-col gap-3 px-3 py-4 transition sm:flex-row sm:items-center sm:justify-between sm:px-4 sm:py-3.5 ${task.isCompleted ? 'bg-[#fbfdfc]' : 'hover:bg-[#fbfefe]'}`}>
        <label className={`flex min-w-0 items-start gap-2.5 ${canToggle ? 'cursor-pointer' : 'cursor-not-allowed'}`}>
          <span className="flex size-11 shrink-0 items-center justify-center">
            <input
              type="checkbox"
              className="size-5 accent-[#0b7f76]"
              checked={task.isCompleted}
              disabled={!canToggle || busy === `task:${task.id}`}
              onChange={() => toggleTask(task)}
              aria-label={`${task.isCompleted ? 'เปิดงานอีกครั้ง' : 'ทำเครื่องหมายว่าเสร็จแล้ว'}: ${task.title}`}
            />
          </span>
          <span className="min-w-0">
            <span className={`block break-words text-base font-bold leading-6 sm:text-sm ${task.isCompleted ? 'text-[#82999b] line-through decoration-[#729694] decoration-2' : 'text-[#173d50]'}`}>{task.title}</span>
            <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#81979c]">
              <span className="inline-flex items-center gap-1"><UserRound className="size-3" aria-hidden="true" />{task.assigneeName}</span>
              <span className="inline-flex items-center gap-1"><CalendarDays className="size-3" aria-hidden="true" />{formatDate(task.deadline)}</span>
              {task.completedAt ? <span className="inline-flex items-center gap-1 text-[#5c8b86]"><CircleCheck className="size-3" aria-hidden="true" />ทำเสร็จเมื่อ {formatDateTime(task.completedAt)}</span> : null}
            </span>
          </span>
        </label>
        <div className="flex min-w-0 flex-wrap items-center gap-2 pl-14 sm:shrink-0 sm:pl-0">
          <StatusBadge tone={status.tone} label={status.label} />
          {!canToggle ? <span className="text-xs text-[#9aafb4]">เฉพาะผู้รับผิดชอบ</span> : null}
        </div>
      </div>
    )
  }

  return (
    <div className="stock-command mx-auto min-w-0 max-w-[1320px] space-y-4 sm:space-y-5">
      <PageHeader
        eyebrow="Operations rhythm"
        title="งานประจำเดือน"
        description="รวมงานที่ต้องทำซ้ำทุกเดือน มอบหมายผู้รับผิดชอบ ติดตาม Deadline และเก็บสถานะของแต่ละเดือนไว้แยกกัน"
        actions={isAdmin ? <Button type="button" className="w-full touch-manipulation sm:w-auto" onClick={startCreate}><Plus className="size-4" aria-hidden="true" /> เพิ่มงานประจำเดือน</Button> : null}
      />

      {notice ? <div role={notice.tone === 'danger' ? 'alert' : 'status'} aria-live="polite"><Notice tone={notice.tone === 'success' ? 'success' : 'danger'}>{notice.text}</Notice></div> : null}

      <div className="grid grid-cols-2 gap-2.5 sm:gap-3 xl:grid-cols-4">
        <StatCard label="งานทั้งหมด" value={data.totalCount} hint={`ของเดือน${data.monthLabel}`} />
        <StatCard label="เสร็จแล้ว" value={data.completedCount} tone="accepted" hint={data.totalCount ? `${progress}% ของงานทั้งหมด` : 'ยังไม่มีงานในเดือนนี้'} />
        <StatCard label="งานค้าง" value={data.openCount} tone={data.openCount ? 'warning' : 'accepted'} hint={data.openCount ? 'รอดำเนินการ' : 'ปิดงานครบแล้ว'} />
        <StatCard label="เลยกำหนด" value={data.overdueCount} tone={data.overdueCount ? 'rejected' : 'accepted'} hint={data.overdueCount ? 'ควรเร่งติดตาม' : 'ยังไม่มีงานเกินกำหนด'} />
      </div>

      <Card className="min-w-0 overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-[#e1ebeb] bg-[#fbfdfd] px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-4">
          <div className="flex w-full items-center justify-between gap-2 sm:w-auto">
            <button type="button" className="inline-flex size-11 touch-manipulation shrink-0 items-center justify-center rounded-md border border-[#cfe0df] text-[#0b7f76] transition hover:bg-[#e8f7f5] active:bg-[#e8f7f5] focus-visible:ring-2 focus-visible:ring-[#0b7f76] focus-visible:outline-none" onClick={() => loadMonth(addMonths(selectedMonth, -1))} disabled={busy === 'month'} aria-label="เดือนก่อนหน้า"><ChevronLeft className="size-4" aria-hidden="true" /></button>
            <div className="min-w-0 flex-1 text-center">
              <p className="text-[10px] font-bold tracking-[0.14em] text-[#0b7f76] uppercase">Monthly view</p>
              <p className="mt-0.5 truncate font-bold text-[#173d50]">{data.monthLabel}</p>
            </div>
            <button type="button" className="inline-flex size-11 touch-manipulation shrink-0 items-center justify-center rounded-md border border-[#cfe0df] text-[#0b7f76] transition hover:bg-[#e8f7f5] active:bg-[#e8f7f5] focus-visible:ring-2 focus-visible:ring-[#0b7f76] focus-visible:outline-none" onClick={() => loadMonth(addMonths(selectedMonth, 1))} disabled={busy === 'month'} aria-label="เดือนถัดไป"><ChevronRight className="size-4" aria-hidden="true" /></button>
          </div>
          <div className="flex w-full items-center gap-2 sm:w-auto sm:justify-end">
            {selectedMonth !== todayMonth ? <Button type="button" variant="secondary" className="min-w-0 flex-1 touch-manipulation whitespace-nowrap px-2 py-2 text-xs sm:flex-none sm:px-3" onClick={() => loadMonth(todayMonth)} disabled={busy === 'month'}><CalendarCheck className="size-3.5" aria-hidden="true" /> เดือนปัจจุบัน</Button> : null}
            <Button type="button" variant="ghost" className="min-w-0 flex-1 touch-manipulation whitespace-nowrap px-2 py-2 text-xs sm:flex-none sm:px-3" onClick={() => loadMonth(selectedMonth)} disabled={busy === 'month'} aria-label="รีเฟรชรายการ"><RefreshCw className={`size-3.5 ${busy === 'month' ? 'animate-spin' : ''}`} aria-hidden="true" /> รีเฟรช</Button>
          </div>
        </div>
        <div className="px-4 py-3">
          <div className="flex items-center justify-between gap-3 text-xs text-[#6f888f]"><span>ความคืบหน้าของเดือนนี้</span><span className="mono font-bold text-[#0b7f76]">{progress}%</span></div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#e7f0ef]" role="progressbar" aria-label="ความคืบหน้าของเดือน" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><div className="h-full rounded-full bg-[#0b7f76] transition-all duration-300" style={{ width: `${progress}%` }} /></div>
        </div>
      </Card>

      {isAdmin ? (
        <Card className="overflow-hidden">
          <div className="border-b border-[#e1ebeb] bg-[#f8fbfb] px-4 py-3">
            <div className="flex items-center gap-2"><ListTodo className="size-4 text-[#0b7f76]" aria-hidden="true" /><h2 className="font-bold text-[#173d50]">{editingId ? 'แก้ไขแม่แบบงาน' : 'เพิ่มงานที่ต้องทำซ้ำทุกเดือน'}</h2></div>
            <p className="mt-1 text-xs leading-5 text-[#81979c]">กำหนดวันที่เป็นเลขประจำเดือน เช่น วันที่ 15 ระบบจะสร้าง Deadline วันที่ 15 ให้ทุกเดือน หากเดือนไหนไม่มีวันนั้นจะใช้วันสุดท้ายของเดือนแทน</p>
          </div>
          <form ref={taskFormRef} className="scroll-mt-4 grid gap-4 p-4 sm:gap-3 lg:grid-cols-[minmax(0,1.5fr)_minmax(15rem,1fr)_10rem_auto] lg:items-end" onSubmit={save}>
            <Field label="งานที่ต้องทำ"><Input className="!text-base sm:!text-sm" value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} placeholder="เช่น ตรวจนับ stock ประจำเดือน" maxLength={240} /></Field>
            <Field label="ผู้รับผิดชอบ"><Select className="!text-base sm:!text-sm" value={form.assigneeId} onChange={(event) => setForm((current) => ({ ...current, assigneeId: event.target.value }))}><option value="">เลือกผู้รับผิดชอบ</option>{form.assigneeId && !data.users.some((user) => user.id === form.assigneeId) ? <option value={form.assigneeId}>ผู้รับผิดชอบเดิม (ไม่ active)</option> : null}{data.users.map((user) => <option key={user.id} value={user.id}>{user.displayName}</option>)}</Select></Field>
            <Field label="Deadline (วันที่)"><Input className="!text-base sm:!text-sm" type="number" min={1} max={31} value={form.dueDay} onChange={(event) => setForm((current) => ({ ...current, dueDay: event.target.value }))} /></Field>
            <div className="flex flex-col gap-2 sm:flex-row"><Button type="submit" className="w-full touch-manipulation sm:w-auto" disabled={busy === 'save'}>{busy === 'save' ? <RefreshCw className="size-4 animate-spin" aria-hidden="true" /> : editingId ? <Pencil className="size-4" aria-hidden="true" /> : <Plus className="size-4" aria-hidden="true" />}{editingId ? 'บันทึกการแก้ไข' : 'เพิ่มงาน'}</Button>{editingId ? <Button type="button" variant="ghost" className="w-full touch-manipulation sm:w-auto" onClick={resetForm}><X className="size-4" aria-hidden="true" /> ยกเลิก</Button> : null}</div>
          </form>
        </Card>
      ) : <Notice tone="info">คุณสามารถติ๊กงานที่รับผิดชอบให้เสร็จได้ ส่วนการเพิ่ม แก้ไข หรือปิดแม่แบบงานให้ติดต่อ Admin</Notice>}

      <div className={`grid gap-4 sm:gap-5 ${isAdmin ? 'xl:grid-cols-[minmax(0,1fr)_360px]' : ''}`}>
        <Card className="overflow-hidden">
          <div className="flex flex-col gap-3 border-b border-[#e1ebeb] bg-[#fbfdfd] px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-4">
            <div><div className="flex items-center gap-2"><Clock3 className="size-4 text-[#0b7f76]" aria-hidden="true" /><h2 className="font-bold text-[#173d50]">รายการงานของเดือนนี้</h2></div><p className="mt-1 text-xs text-[#81979c]">ติ๊กช่องด้านหน้าเมื่อทำเสร็จแล้ว ข้อความที่เสร็จจะมีเส้นคั่นกลาง</p></div>
            <span className="self-start rounded-full bg-[#e8f7f5] px-2.5 py-1 text-xs font-bold text-[#0b7f76] sm:self-auto">{data.completedCount}/{data.totalCount} เสร็จแล้ว</span>
          </div>
          {openTasks.length ? <div className="divide-y divide-[#edf2f2]">{openTasks.map(renderTask)}</div> : <div className="px-4 py-8 text-center text-sm text-[#81979c]">ไม่มีงานค้างในเดือนนี้</div>}
          {completedTasks.length ? <div className="flex items-center gap-3 border-t border-[#dfeaea] px-4 py-3"><span className="shrink-0 text-[10px] font-bold tracking-[0.14em] text-[#6c8a89] uppercase">เสร็จแล้ว</span><span className="h-px flex-1 bg-[#dfeaea]" /></div> : null}
          {completedTasks.length ? <div className="divide-y divide-[#edf2f2]">{completedTasks.map(renderTask)}</div> : null}
        </Card>

        {isAdmin ? (
          <Card className="overflow-hidden">
            <div className="border-b border-[#e1ebeb] bg-[#fbfdfd] px-3 py-3 sm:px-4"><div className="flex items-center gap-2"><CalendarCheck className="size-4 text-[#0b7f76]" aria-hidden="true" /><h2 className="font-bold text-[#173d50]">แม่แบบที่ใช้งานอยู่</h2></div><p className="mt-1 text-xs text-[#81979c]">แม่แบบจะสร้างงานชุดใหม่ให้โดยอัตโนมัติเมื่อเปิดดูแต่ละเดือน</p></div>
            {data.templates.length ? <div className="divide-y divide-[#edf2f2]">{data.templates.map((template) => <div key={template.id} className="space-y-2 px-3 py-3 sm:px-4"><p className="text-sm font-bold leading-5 text-[#315763]">{template.title}</p><p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[#81979c]"><span className="inline-flex items-center gap-1"><UserRound className="size-3" aria-hidden="true" />{template.assigneeName}</span><span>วันที่ {template.dueDay} ของทุกเดือน</span></p><div className="flex flex-wrap items-center gap-2"><Button type="button" variant="ghost" className="min-h-11 touch-manipulation px-2 py-1 text-xs" onClick={() => startEdit(template)}><Pencil className="size-3.5" aria-hidden="true" /> แก้ไข</Button><Button type="button" variant="ghost" className="min-h-11 touch-manipulation px-2 py-1 text-xs text-[#a35b63] hover:bg-[#fff1f2] hover:text-[#a35b63]" disabled={busy === `deactivate:${template.id}`} onClick={() => deactivateTemplate(template)}><PauseCircle className="size-3.5" aria-hidden="true" /> ปิดงาน</Button></div></div>)}</div> : <div className="px-3 py-8 text-center text-sm text-[#81979c] sm:px-4">ยังไม่มีแม่แบบงาน กด “เพิ่มงานประจำเดือน” เพื่อเริ่มต้น</div>}
          </Card>
        ) : null}
      </div>
    </div>
  )
}
