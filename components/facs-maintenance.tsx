'use client'

import { useEffect, useState } from 'react'
import { CheckSquare, Lock, X } from 'lucide-react'
import Link from 'next/link'
import type { BmActor } from '@/lib/bm/types'
import { responsibleCodeForDisplayName } from '@/lib/bm/responsible-codes'
import { FACS_DAILY_TASKS, FACS_MONTHLY_TASKS, type FacsMaintenanceFrequency, type FacsMaintenanceWorkspace, type FacsTaskResult } from '@/lib/equipment/facs-maintenance'
import { api, Button, Card, Field, Input, Notice, Select, Textarea } from '@/components/ui'

const emptyTasks = (frequency: FacsMaintenanceFrequency): FacsTaskResult[] => Array.from({ length: frequency === 'daily' ? FACS_DAILY_TASKS.length : FACS_MONTHLY_TASKS.length }, () => ({ state: 'done' }))
const currentMonthStart = (date: string) => `${date.slice(0, 7)}-01`

export function FacsMaintenance({ actor }: { actor: BmActor }) {
  const [data, setData] = useState<FacsMaintenanceWorkspace | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [holidayDate, setHolidayDate] = useState('')
  const [holidayNote, setHolidayNote] = useState('')
  const [activeForm, setActiveForm] = useState<FacsMaintenanceFrequency | null>(null)
  const [showHistory, setShowHistory] = useState(false)
  const [showReview, setShowReview] = useState(false)
  useEffect(() => {
    void api<{ maintenance: FacsMaintenanceWorkspace }>('/api/equipment/facs-maintenance')
      .then((result) => setData(result.maintenance))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'โหลดข้อมูลไม่สำเร็จ'))
  }, [])
  async function submit(body: Record<string, unknown>) { setBusy(true); setError(''); try { setData((await api<{ maintenance: FacsMaintenanceWorkspace }>('/api/equipment/facs-maintenance', { method: 'POST', body: JSON.stringify(body) })).maintenance); return true } catch (e) { setError(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ'); return false } finally { setBusy(false) } }
  if (!data) return <Card className="p-6 text-sm text-[#58747d]">กำลังโหลด Routine Maintenance…</Card>
  if (!data.equipment) return <Card className="p-6"><p className="font-bold text-[#a83541]">ยังไม่พบเครื่อง FACSLYRIC ในทะเบียน Equipment</p><p className="mt-1 text-sm text-[#58747d]">ให้ Admin เพิ่มรหัสเครื่อง `FACSLYRIC` ก่อนเปิดใช้ Checklist</p></Card>
  const isAdmin = actor.role === 'Admin'
  const myInitial = responsibleCodeForDisplayName(actor.displayName)
  const month = data.today.slice(0, 7); const year = data.today.slice(0, 4)
  const dailyLocked = data.reviews.some((review) => review.frequency === 'daily' && review.period === month)
  const monthlyLocked = data.reviews.some((review) => review.frequency === 'monthly' && review.period === year)
  const isReviewer = data.reviewerId === actor.id
  return <div className="space-y-4">
    <Card className="p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="flex items-center gap-2 font-bold text-[#173d50]"><CheckSquare className="size-5" /> FACSLyric Routine Maintenance</h2><p className="mt-1 text-sm text-[#58747d]">{data.equipment.code} · {data.equipment.name} · ผู้ปฏิบัติ: {myInitial ?? 'ไม่พบ Initial'}</p></div><div className="flex items-center gap-2"><Link className="text-xs font-bold text-[#0b7f76] hover:underline" href={`/equipment/facs-maintenance/report?frequency=daily&month=${data.today.slice(0, 7)}`}>รายงาน Daily</Link><Link className="text-xs font-bold text-[#0b7f76] hover:underline" href={`/equipment/facs-maintenance/report?frequency=monthly&year=${data.today.slice(0, 4)}`}>รายงาน Monthly</Link><span className="text-xs text-[#789097]">Daily หยุดเสาร์–อาทิตย์</span></div></div>{error ? <div className="mt-3"><Notice tone="danger">{error}</Notice></div> : null}</Card>
    <Card className="p-4"><div className="flex flex-wrap items-center gap-3"><Button disabled={busy || dailyLocked} onClick={() => setActiveForm('daily')}><CheckSquare className="size-4" /> Daily Maintenance</Button><Button disabled={busy || monthlyLocked} variant="secondary" onClick={() => setActiveForm('monthly')}><CheckSquare className="size-4" /> Monthly Maintenance</Button><span className="text-xs text-[#789097]">{dailyLocked ? 'Daily เดือนนี้ถูกล็อกแล้ว' : ''}{dailyLocked && monthlyLocked ? ' · ' : ''}{monthlyLocked ? 'Monthly ปีนี้ถูกล็อกแล้ว' : ''}</span></div></Card>
    <Card className="p-0"><button type="button" className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-bold text-[#315763] hover:bg-[#f6faf9]" onClick={() => setShowReview((value) => !value)}><span>Review & lock</span><span className="text-xs text-[#789097]">{showReview ? 'ซ่อน' : 'แสดง'}</span></button></Card>
    {showReview ? <Card className="p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-bold text-[#173d50]">Review & lock</h3><p className="mt-1 text-xs text-[#58747d]">Daily ล็อกรายเดือน · Monthly ล็อกรายปี</p></div>{isReviewer ? <div className="flex gap-2"><Button disabled={busy || dailyLocked} variant="secondary" onClick={() => submit({ action: 'review', frequency: 'daily', period: month })}><Lock className="size-4" /> Lock {month}</Button><Button disabled={busy || monthlyLocked} variant="secondary" onClick={() => submit({ action: 'review', frequency: 'monthly', period: year })}><Lock className="size-4" /> Lock {year}</Button></div> : <span className="text-xs text-[#789097]">ผู้ตรวจ: {data.users.find((user) => user.id === data.reviewerId)?.displayName ?? 'ยังไม่กำหนด'}</span>}</div>{isAdmin ? <div className="mt-4 grid gap-3 border-t pt-4 lg:grid-cols-2"><div><Field label="กำหนดผู้ตรวจ FACSLyric"><Select value={data.reviewerId ?? ''} onChange={(event) => submit({ action: 'set-reviewer', reviewerId: event.target.value })}><option value="">— เลือกผู้ตรวจ —</option>{data.users.map((user) => <option key={user.id} value={user.id}>{user.displayName}</option>)}</Select></Field></div><div className="grid grid-cols-[1fr_1fr_auto] items-end gap-2"><Field label="วันหยุด/ไม่ใช้งาน"><Input type="date" value={holidayDate} onChange={(event) => setHolidayDate(event.target.value)} /></Field><Field label="หมายเหตุ"><Input value={holidayNote} onChange={(event) => setHolidayNote(event.target.value)} /></Field><Button disabled={busy || !holidayDate} onClick={() => { void submit({ action: 'set-holiday', date: holidayDate, note: holidayNote || null }); setHolidayDate(''); setHolidayNote('') }}>เพิ่ม</Button></div></div> : null}</Card> : null}
    <Card className="p-0"><button type="button" className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-bold text-[#315763] hover:bg-[#f6faf9]" onClick={() => setShowHistory((value) => !value)}><span>ประวัติการทำ Maintenance</span><span className="text-xs text-[#789097]">{showHistory ? 'ซ่อน' : `แสดง (${data.entries.length})`}</span></button></Card>
    {showHistory ? <Card className="overflow-x-auto">
      <table className="w-full min-w-[700px] text-left text-sm">
        <thead className="bg-[#f5f9f9] text-xs text-[#58747d]"><tr><th className="p-3">วันที่</th><th className="p-3">รอบ</th><th className="p-3">ผู้ปฏิบัติ</th><th className="p-3">ผล</th><th className="p-3">หมายเหตุ</th>{isAdmin ? <th className="p-3 text-right">จัดการ</th> : null}</tr></thead>
        <tbody className="divide-y divide-[#e6eeee]">
          {data.entries.slice(0, 30).map((entry) => {
            const period = entry.frequency === 'daily' ? entry.performedOn.slice(0, 7) : entry.performedOn.slice(0, 4)
            const locked = data.reviews.some((review) => review.frequency === entry.frequency && review.period === period)
            return <tr key={entry.id}>
              <td className="p-3">{entry.performedOn}</td><td className="p-3">{entry.frequency}</td><td className="p-3">{entry.operatorCode} <span className="text-xs text-[#789097]">{entry.operatorName}</span></td><td className="p-3">✓ {entry.taskResults.filter((item) => item.state === 'done').length} · N/A {entry.taskResults.filter((item) => item.state === 'not-applicable').length}</td><td className="p-3">{entry.note ?? '—'}</td>
              {isAdmin ? <td className="p-3 text-right">{locked ? <span className="text-xs text-[#789097]">ล็อกแล้ว</span> : <button type="button" disabled={busy} className="text-xs font-bold text-[#a83541] hover:underline disabled:opacity-50" onClick={() => { if (window.confirm(`ลบรายการ ${entry.performedOn} นี้ใช่หรือไม่?`)) void submit({ action: 'delete', id: entry.id }) }}>ลบ</button>}</td> : null}
            </tr>
          })}
          {!data.entries.length ? <tr><td className="p-8 text-center text-[#789097]" colSpan={isAdmin ? 6 : 5}>ยังไม่มีประวัติ</td></tr> : null}
        </tbody>
      </table>
    </Card> : null}
    {activeForm ? <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 p-0 sm:items-center sm:p-5" role="presentation" onMouseDown={() => setActiveForm(null)}><section role="dialog" aria-modal="true" aria-label={`${activeForm} maintenance`} className="max-h-[92dvh] w-full max-w-3xl overflow-y-auto rounded-t-xl bg-white p-4 shadow-2xl sm:rounded-xl sm:p-5" onMouseDown={(event) => event.stopPropagation()}><div className="mb-3 flex justify-end"><button type="button" onClick={() => setActiveForm(null)} className="rounded p-1 text-[#58747d] hover:bg-[#eef5f4]" aria-label="ปิด"><X className="size-5" /></button></div><Checklist title={activeForm === 'daily' ? 'Daily Maintenance' : 'Monthly Maintenance'} frequency={activeForm} performedOn={activeForm === 'daily' ? data.today : currentMonthStart(data.today)} tasks={activeForm === 'daily' ? FACS_DAILY_TASKS : FACS_MONTHLY_TASKS} existing={data.entries.find((entry) => entry.frequency === activeForm && entry.performedOn === (activeForm === 'daily' ? data.today : currentMonthStart(data.today)))} locked={activeForm === 'daily' ? dailyLocked : monthlyLocked} busy={busy} onSave={(taskResults, note) => { void submit({ action: 'log', frequency: activeForm, performedOn: activeForm === 'daily' ? data.today : currentMonthStart(data.today), taskResults, note }).then((ok) => { if (ok) setActiveForm(null) }) }} /></section></div> : null}
  </div>
}

function Checklist({ title, frequency, performedOn, tasks, existing, locked, busy, onSave }: { title: string; frequency: FacsMaintenanceFrequency; performedOn: string; tasks: readonly string[]; existing?: FacsMaintenanceWorkspace['entries'][number]; locked: boolean; busy: boolean; onSave: (tasks: FacsTaskResult[], note: string) => void }) {
  const [results, setResults] = useState(() => emptyTasks(frequency)); const [note, setNote] = useState('')
  const displayed = existing?.taskResults ?? results
  return <Card className="p-4"><div className="flex items-start justify-between gap-3"><div><h3 className="font-bold text-[#173d50]">{title}</h3><p className="mt-1 text-xs text-[#789097]">{performedOn}{locked ? ' · Locked' : ''}</p></div>{existing ? <span className="rounded bg-[#eef8f6] px-2 py-1 text-xs font-bold text-[#0b7f76]">บันทึกแล้ว · {existing.operatorCode}</span> : null}</div><div className="mt-3 space-y-2">{tasks.map((task, index) => <div key={task} className="grid grid-cols-[1fr_120px] items-center gap-2 rounded border border-[#e1ebeb] p-2 text-sm"><span>{index + 1}. {task}</span><Select disabled={Boolean(existing) || locked} value={displayed[index]?.state ?? 'not-done'} onChange={(event) => setResults((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, state: event.target.value as FacsTaskResult['state'] } : item))}><option value="done">✓ ทำแล้ว</option><option value="not-applicable">N/A</option><option value="not-done">ยังไม่ทำ</option></Select></div>)}</div>{!existing && !locked ? <><div className="mt-3"><Field label="หมายเหตุ"><Textarea rows={2} value={note} onChange={(event) => setNote(event.target.value)} /></Field></div><Button className="mt-3" disabled={busy} onClick={() => onSave(results, note)}>บันทึก {title}</Button></> : null}</Card>
}
