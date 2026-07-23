'use client'

import { useState } from 'react'
import Link from 'next/link'
import { CalendarClock, ClipboardList, FolderOpen, Pencil, Send, Settings, Trash2, X } from 'lucide-react'
import type { BmActor } from '@/lib/bm/types'
import type { EqaResult, EqaRound, EqaWorkspace } from '@/lib/eqa/types'
import { formatDate } from '@/lib/bm/rules'
import { api, Button, Card, Field, Input, Notice, PageHeader, Select, StatCard, StatusBadge, Tabs, Textarea, type StatusTone } from '@/components/ui'
import { AttachmentList } from '@/components/attachments'

type Tab = 'rounds' | 'corrective' | 'manage'
type NoticeState = { tone: 'success' | 'danger'; text: string } | null

const OUTCOME_TONE: Record<string, StatusTone> = {
  acceptable: 'accepted',
  warning: 'warning',
  unacceptable: 'rejected',
  'not-evaluated': 'neutral',
}

export function EqaView({ actor, initialData }: { actor: BmActor; initialData: EqaWorkspace }) {
  const [data, setData] = useState(initialData)
  const [tab, setTab] = useState<Tab>('rounds')
  const [notice, setNotice] = useState<NoticeState>(null)
  const isAdmin = actor.role === 'Admin'

  function ok(text: string, next: EqaWorkspace) {
    setData(next)
    setNotice({ tone: 'success', text })
  }
  function err(text: string) {
    setNotice({ tone: 'danger', text })
  }

  const reminders = data.rounds.filter((r) => r.reminder)
  const tabs = [
    { key: 'rounds' as const, label: 'รอบ / Rounds', icon: CalendarClock },
    {
      key: 'corrective' as const,
      label: 'Corrective action',
      icon: ClipboardList,
    },
    ...(isAdmin ? [{ key: 'manage' as const, label: 'จัดการ / Manage', icon: Settings }] : []),
  ]

  return (
    <div className="mx-auto max-w-[1500px] space-y-5">
      <PageHeader eyebrow="External Quality Assessment" title="EQA" description="ทะเบียน scheme / round, ผลประเมิน, ปฏิทินเตือนกำหนดส่ง และไฟล์แนบ" />
      {notice ? <Notice tone={notice.tone}>{notice.text}</Notice> : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Schemes" value={data.summary.schemeCount} />
        <StatCard label="ใกล้ครบกำหนด" value={data.summary.dueSoon} tone={data.summary.dueSoon ? 'warning' : 'neutral'} />
        <StatCard label="เลยกำหนด" value={data.summary.overdue} tone={data.summary.overdue ? 'rejected' : 'neutral'} />
        <StatCard label="Unacceptable" value={data.summary.unacceptable} tone={data.summary.unacceptable ? 'rejected' : 'neutral'} hint={`${data.summary.openCorrectiveActions} corrective action ค้าง`} />
      </div>

      {reminders.length ? (
        <Card className="p-3">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-bold tracking-wide text-[#55727c] uppercase">
            <CalendarClock className="size-3.5" /> เตือนกำหนดส่ง
          </p>
          <div className="flex flex-wrap gap-2">
            {reminders.map((r) => (
              <span key={r.id} className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-semibold ${r.reminder === 'overdue' ? 'border-[#efc7cc] bg-[#fff5f6] text-[#c02a37]' : 'border-[#eed4a6] bg-[#fff9ed] text-[#a9700f]'}`}>
                {r.schemeName} · {r.roundLabel} · {r.reminder === 'overdue' ? `เลย ${Math.abs(r.dueInDays ?? 0)} วัน` : `อีก ${r.dueInDays} วัน`}
              </span>
            ))}
          </div>
        </Card>
      ) : null}

      <Tabs tabs={tabs} active={tab} onChange={setTab} />

      {tab === 'rounds' ? <RoundsTab data={data} actor={actor} onOk={ok} onErr={err} /> : null}
      {tab === 'corrective' ? <CorrectiveTab data={data} onOk={ok} onErr={err} /> : null}
      {tab === 'manage' && isAdmin ? <ManageTab data={data} onOk={ok} onErr={err} /> : null}
    </div>
  )
}

function RoundsTab({ data, actor, onOk, onErr }: { data: EqaWorkspace; actor: BmActor; onOk: (t: string, d: EqaWorkspace) => void; onErr: (t: string) => void }) {
  if (!data.rounds.length) return <Card className="p-8 text-center text-sm text-[#8198a0]">ยังไม่มี round — สร้างที่แท็บ จัดการ / Manage</Card>
  return (
    <div className="space-y-4">
      {data.rounds.map((round) => (
        <RoundCard key={round.id} round={round} iqcAnalytes={data.iqcAnalytes} actor={actor} onOk={onOk} onErr={onErr} />
      ))}
    </div>
  )
}

const STATUS_TONE: Record<string, StatusTone> = {
  scheduled: 'neutral',
  received: 'warning',
  submitted: 'accepted',
  evaluated: 'accepted',
  closed: 'neutral',
}

function RoundCard({ round, iqcAnalytes, actor, onOk, onErr }: { round: EqaRound; iqcAnalytes: EqaWorkspace['iqcAnalytes']; actor: BmActor; onOk: (t: string, d: EqaWorkspace) => void; onErr: (t: string) => void }) {
  const [analyte, setAnalyte] = useState('')
  const [value, setValue] = useState('')
  const [score, setScore] = useState('')
  const [outcome, setOutcome] = useState('not-evaluated')
  const [iqcAnalyteId, setIqcAnalyteId] = useState('')
  const [assignedValue, setAssignedValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [statusBusy, setStatusBusy] = useState(false)
  const [editingResultId, setEditingResultId] = useState<string | null>(null)
  const [resultBusyId, setResultBusyId] = useState<string | null>(null)
  const isSubmitted = round.status === 'submitted' || round.status === 'evaluated' || round.status === 'closed'

  function resetResultForm() {
    setAnalyte('')
    setValue('')
    setScore('')
    setOutcome('not-evaluated')
    setIqcAnalyteId('')
    setAssignedValue('')
    setEditingResultId(null)
  }

  function editResult(result: EqaResult) {
    setEditingResultId(result.id)
    setAnalyte(result.analyte)
    setValue(result.submittedValue ?? '')
    setScore(result.evaluationScore == null ? '' : String(result.evaluationScore))
    setOutcome(result.outcome)
    setIqcAnalyteId(result.iqcAnalyteId ?? '')
    setAssignedValue(result.assignedValue == null ? '' : String(result.assignedValue))
  }

  async function setStatus(status: string, okText = 'อัปเดตสถานะแล้ว') {
    setStatusBusy(true)
    try {
      const result = await api<{ eqa: EqaWorkspace }>(`/api/eqa/rounds/${round.id}`, { method: 'PATCH', body: JSON.stringify({ status }) })
      onOk(okText, result.eqa)
    } catch (e) {
      onErr(e instanceof Error ? e.message : 'อัปเดตไม่สำเร็จ')
    } finally {
      setStatusBusy(false)
    }
  }
  async function saveResult(event: React.FormEvent) {
    event.preventDefault()
    if (!analyte.trim()) return
    setBusy(true)
    try {
      const body = {
        analyte,
        submittedValue: value || null,
        evaluationScore: score === '' ? null : Number(score),
        outcome,
        iqcAnalyteId: iqcAnalyteId || null,
        assignedValue: assignedValue === '' ? null : Number(assignedValue),
      }
      const result = editingResultId
        ? await api<{ eqa: EqaWorkspace }>(`/api/eqa/results/${editingResultId}`, { method: 'PATCH', body: JSON.stringify(body) })
        : await api<{ eqa: EqaWorkspace }>('/api/eqa/results', {
            method: 'POST',
            body: JSON.stringify({ roundId: round.id, ...body }),
          })
      onOk(editingResultId ? 'แก้ไขผลแล้ว' : 'บันทึกผลแล้ว', result.eqa)
      resetResultForm()
    } catch (e) {
      onErr(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }
  async function removeResult(result: EqaResult) {
    if (!window.confirm(`ลบผล "${result.analyte}" ใช่ไหม?`)) return
    setResultBusyId(result.id)
    try {
      const response = await api<{ eqa: EqaWorkspace }>(`/api/eqa/results/${result.id}`, { method: 'DELETE' })
      if (editingResultId === result.id) resetResultForm()
      onOk('ลบผลแล้ว', response.eqa)
    } catch (e) {
      onErr(e instanceof Error ? e.message : 'ลบผลไม่สำเร็จ')
    } finally {
      setResultBusyId(null)
    }
  }

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-bold text-[#173d50]">
              {round.schemeName} · {round.roundLabel}
            </h3>
            <StatusBadge tone={STATUS_TONE[round.status]} label={round.status} />
            {round.equipment.map((equipment) => (
              <Link key={equipment.id} href={`/equipment?view=registry&equipment=${equipment.id}`} className={`rounded-full px-2 py-0.5 text-xs font-semibold underline ${equipment.status === 'maintenance' || equipment.status === 'out_of_service' ? 'bg-amber-100 text-amber-900' : 'bg-[#e9f5f3] text-[#087f75]'}`}>
                {equipment.status === 'maintenance' || equipment.status === 'out_of_service' ? '⚠ ' : ''}{equipment.code} · {equipment.status}
              </Link>
            ))}
            {round.reminder ? <StatusBadge tone={round.reminder === 'overdue' ? 'rejected' : 'warning'} label={round.reminder === 'overdue' ? 'overdue' : 'due soon'} /> : null}
          </div>
          <p className="mt-0.5 text-xs text-[#789097]">
            {round.providerName} · รับตัวอย่าง {formatDate(round.sampleReceivedDate)} · ครบกำหนด {formatDate(round.resultDueDate)} · ส่ง {formatDate(round.submissionDate)}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {!isSubmitted ? (
            <Button type="button" variant="secondary" className="h-9 px-3 text-xs" disabled={statusBusy} onClick={() => setStatus('submitted', 'บันทึกว่าส่งผลแล้ว')}>
              <Send className="size-3.5" /> ส่งผลแล้ว
            </Button>
          ) : null}
          <Select className="h-9 w-40" value={round.status} disabled={statusBusy} onChange={(e) => setStatus(e.target.value)}>
            <option value="scheduled">scheduled</option>
            <option value="received">received</option>
            <option value="submitted">submitted</option>
            <option value="evaluated">evaluated</option>
            <option value="closed">closed</option>
          </Select>
        </div>
      </div>

      {round.results.length ? (
        <div className="mt-3 overflow-x-auto rounded-md border border-[#e9eff0]">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#f6fafa] text-[#55727c]">
              <tr>
                <th className="px-2 py-1.5 font-semibold">Analyte</th>
                <th className="px-2 py-1.5 font-semibold">Submitted</th>
                <th className="px-2 py-1.5 text-right font-semibold">Score (z/SDI)</th>
                <th className="px-2 py-1.5 font-semibold">Outcome</th>
                <th className="px-2 py-1.5 text-right font-semibold">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#eef3f3]">
              {round.results.map((r) => (
                <tr key={r.id}>
                  <td className="px-2 py-1.5 font-semibold text-[#315763]">{r.analyte}</td>
                  <td className="mono px-2 py-1.5 tabular-nums">{r.submittedValue ?? '—'}</td>
                  <td className="mono px-2 py-1.5 text-right tabular-nums">{r.evaluationScore ?? '—'}</td>
                  <td className="px-2 py-1.5">
                    <StatusBadge tone={OUTCOME_TONE[r.outcome]} label={r.outcome} />
                  </td>
                  <td className="px-2 py-1.5">
                    <div className="flex items-center justify-end gap-1">
                      <Button type="button" variant="ghost" className="min-h-7 px-2 py-1" disabled={busy || resultBusyId === r.id} onClick={() => editResult(r)} title="แก้ไขผล">
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button type="button" variant="danger" className="min-h-7 px-2 py-1" disabled={busy || resultBusyId === r.id} onClick={() => removeResult(r)} title="ลบผล">
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <form onSubmit={saveResult} className="mt-3 grid gap-1.5 md:grid-cols-3 xl:grid-cols-[1fr_1fr_0.7fr_1fr_1fr_0.8fr_auto] items-end">
        <Field label="Analyte">
          <Input className="h-9" value={analyte} onChange={(e) => setAnalyte(e.target.value)} />
        </Field>
        <Field label="IQC analyte">
          <Select className="h-9" value={iqcAnalyteId} onChange={(e) => setIqcAnalyteId(e.target.value)}>
            <option value="">— ไม่ใช้ Sigma —</option>
            {iqcAnalytes.map((item) => (
              <option key={item.id} value={item.id}>
                {item.code} · {item.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Submitted">
          <Input className="mono h-9" value={value} onChange={(e) => setValue(e.target.value)} />
        </Field>
        <Field label="Assigned">
          <Input className="mono h-9" type="number" step="any" value={assignedValue} onChange={(e) => setAssignedValue(e.target.value)} />
        </Field>
        <Field label="Score">
          <Input className="mono h-9" type="number" step="any" value={score} onChange={(e) => setScore(e.target.value)} />
        </Field>
        <Field label="Outcome">
          <Select className="h-9" value={outcome} onChange={(e) => setOutcome(e.target.value)}>
            <option value="not-evaluated">not-evaluated</option>
            <option value="acceptable">acceptable</option>
            <option value="warning">warning</option>
            <option value="unacceptable">unacceptable</option>
          </Select>
        </Field>
        <div className="flex items-center gap-1">
          <Button className="h-9 whitespace-nowrap" disabled={busy}>
            {editingResultId ? 'บันทึกแก้ไข' : '+ ผล'}
          </Button>
          {editingResultId ? (
            <Button type="button" variant="ghost" className="h-9 px-2" disabled={busy} onClick={resetResultForm} title="ยกเลิกแก้ไข">
              <X className="size-4" />
            </Button>
          ) : null}
        </div>
      </form>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <AttachmentList module="eqa" entityType="eqa-round-receipt" entityId={round.id} kind="eqa-receipt" canDelete={actor.role === 'Admin'} label="แบบรับตัวอย่าง" />
        <AttachmentList module="eqa" entityType="eqa-round" entityId={round.id} kind="eqa-certificate" canDelete={actor.role === 'Admin'} label="Certificate / รายงานผล" />
      </div>
    </Card>
  )
}

function CorrectiveTab({ data, onOk, onErr }: { data: EqaWorkspace; onOk: (t: string, d: EqaWorkspace) => void; onErr: (t: string) => void }) {
  const [roundId, setRoundId] = useState('')
  const [problem, setProblem] = useState('')
  const [rootCause, setRootCause] = useState('')
  const [actionTaken, setActionTaken] = useState('')
  const [busy, setBusy] = useState(false)

  async function create(event: React.FormEvent) {
    event.preventDefault()
    if (!roundId || !problem.trim()) return onErr('เลือก round และระบุปัญหา')
    setBusy(true)
    try {
      const result = await api<{ eqa: EqaWorkspace }>('/api/eqa/corrective-actions', {
        method: 'POST',
        body: JSON.stringify({
          roundId,
          problem,
          rootCause: rootCause || null,
          actionTaken: actionTaken || null,
        }),
      })
      onOk('เปิด corrective action แล้ว', result.eqa)
      setProblem('')
      setRootCause('')
      setActionTaken('')
    } catch (e) {
      onErr(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }
  async function close(id: string) {
    try {
      const result = await api<{ eqa: EqaWorkspace }>(`/api/eqa/corrective-actions/${id}/close`, { method: 'POST', body: JSON.stringify({}) })
      onOk('ปิดแล้ว', result.eqa)
    } catch (e) {
      onErr(e instanceof Error ? e.message : 'ปิดไม่สำเร็จ')
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
      <Card className="space-y-3 p-4">
        <h2 className="font-bold text-[#173d50]">เปิด corrective action</h2>
        <form onSubmit={create} className="space-y-3">
          <Field label="Round">
            <Select value={roundId} onChange={(e) => setRoundId(e.target.value)} required>
              <option value="">—</option>
              {data.rounds.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.schemeName} · {r.roundLabel}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="ปัญหา / Problem">
            <Textarea rows={2} value={problem} onChange={(e) => setProblem(e.target.value)} required />
          </Field>
          <Field label="Root cause">
            <Textarea rows={2} value={rootCause} onChange={(e) => setRootCause(e.target.value)} />
          </Field>
          <Field label="Action taken">
            <Textarea rows={2} value={actionTaken} onChange={(e) => setActionTaken(e.target.value)} />
          </Field>
          <Button disabled={busy}>บันทึก</Button>
        </form>
      </Card>
      <div className="space-y-3">
        {data.correctiveActions.map((ca) => (
          <Card key={ca.id} className="p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-[#315763]">{ca.roundLabel}</span>
                  <StatusBadge tone={ca.status === 'open' ? 'warning' : 'accepted'} label={ca.status} />
                </div>
                <p className="mt-1 text-sm text-[#3f5c64]">{ca.problem}</p>
                {ca.rootCause ? <p className="mt-1 text-xs text-[#789097]">Root cause: {ca.rootCause}</p> : null}
                {ca.actionTaken ? <p className="text-xs text-[#789097]">Action: {ca.actionTaken}</p> : null}
              </div>
              {ca.status === 'open' ? (
                <Button variant="secondary" className="min-h-8 px-3 py-1.5 text-xs" onClick={() => close(ca.id)}>
                  ปิด
                </Button>
              ) : null}
            </div>
          </Card>
        ))}
        {!data.correctiveActions.length ? <Card className="p-8 text-center text-sm text-[#8198a0]">ยังไม่มี corrective action</Card> : null}
      </div>
    </div>
  )
}

function ManageTab({ data, onOk, onErr }: { data: EqaWorkspace; onOk: (t: string, d: EqaWorkspace) => void; onErr: (t: string) => void }) {
  async function request(url: string, body: unknown, okText: string, method: 'POST' | 'PATCH' | 'DELETE' = 'POST') {
    try {
      const result = await api<{ eqa: EqaWorkspace }>(url, {
        method,
        body: method === 'DELETE' ? undefined : JSON.stringify(body),
      })
      onOk(okText, result.eqa)
      return true
    } catch (e) {
      onErr(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ')
      return false
    }
  }
  const post = (url: string, body: unknown, text: string) => request(url, body, text)
  const patch = (url: string, body: unknown, text: string) => request(url, body, text, 'PATCH')
  const remove = (url: string, text: string) => request(url, null, text, 'DELETE')
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <ProviderForm onSubmit={(b) => post('/api/eqa/providers', b, 'เพิ่ม provider แล้ว')} onUpdate={(id, b) => patch(`/api/eqa/providers/${id}`, b, 'แก้ไข provider แล้ว')} onDelete={(id) => remove(`/api/eqa/providers/${id}`, 'ลบ provider แล้ว')} data={data} />
      <SchemeForm onSubmit={(b) => post('/api/eqa/schemes', b, 'เพิ่ม scheme แล้ว')} onUpdate={(id, b) => patch(`/api/eqa/schemes/${id}`, b, 'แก้ไข scheme แล้ว')} onDelete={(id) => remove(`/api/eqa/schemes/${id}`, 'ลบ scheme แล้ว')} data={data} />
      <RoundForm onSubmit={(b) => post('/api/eqa/rounds', b, 'เพิ่ม round แล้ว')} onUpdate={(id, b) => patch(`/api/eqa/rounds/${id}`, b, 'แก้ไข round แล้ว')} onDelete={(id) => remove(`/api/eqa/rounds/${id}`, 'ลบ round แล้ว')} data={data} />
      <AnnualSummary data={data} />
    </div>
  )
}

function ProviderForm({ onSubmit, onUpdate, onDelete, data }: { onSubmit: (b: unknown) => Promise<boolean>; onUpdate: (id: string, b: unknown) => Promise<boolean>; onDelete: (id: string) => Promise<boolean>; data: EqaWorkspace }) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [deletingId, setDeletingId] = useState('')
  const schemeCounts = new Map<string, number>()
  for (const scheme of data.schemes) schemeCounts.set(scheme.providerId, (schemeCounts.get(scheme.providerId) ?? 0) + 1)

  async function removeProvider(id: string, providerName: string) {
    if (!window.confirm(`ลบ provider "${providerName}" ใช่ไหม?`)) return
    setDeletingId(id)
    await onDelete(id)
    setDeletingId('')
  }

  return (
    <Card className="space-y-3 p-4">
      <h2 className="font-bold text-[#173d50]">Provider ({data.providers.length})</h2>
      <form
        className="flex items-end gap-2"
        onSubmit={async (e) => {
          e.preventDefault()
          setBusy(true)
          if (await onSubmit({ name })) setName('')
          setBusy(false)
        }}
      >
        <div className="flex-1">
          <Field label="ชื่อ provider">
            <Input value={name} onChange={(e) => setName(e.target.value)} required />
          </Field>
        </div>
        <Button disabled={busy}>เพิ่ม</Button>
      </form>
      <div className="space-y-2">
        {data.providers.map((provider) => {
          const schemeCount = schemeCounts.get(provider.id) ?? 0
          return (
            <div key={provider.id} className="flex items-center justify-between gap-3 rounded-md border border-[#e3ebec] bg-[#fbfefe] px-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-[#173d50]">{provider.name}</p>
                <p className="text-[11px] text-[#789097]">{schemeCount ? `${schemeCount} scheme` : 'ยังไม่มี scheme'}</p>
              </div>
              <div className="flex gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  className="min-h-8 px-2.5 py-1.5"
                  title="แก้ไข provider"
                  onClick={async () => {
                    const name = window.prompt('ชื่อ provider:', provider.name)
                    if (name?.trim()) await onUpdate(provider.id, { name })
                  }}
                >
                  <Pencil className="size-3.5" />
                </Button>
                <Button type="button" variant="danger" className="min-h-8 px-2.5 py-1.5 text-xs" disabled={deletingId === provider.id || schemeCount > 0} title={schemeCount > 0 ? 'ลบไม่ได้ เพราะมี scheme ผูกอยู่' : 'ลบ provider'} onClick={() => removeProvider(provider.id, provider.name)}>
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            </div>
          )
        })}
      </div>
    </Card>
  )
}

function SchemeForm({ onSubmit, onUpdate, onDelete, data }: { onSubmit: (b: unknown) => Promise<boolean>; onUpdate: (id: string, b: unknown) => Promise<boolean>; onDelete: (id: string) => Promise<boolean>; data: EqaWorkspace }) {
  const [form, setForm] = useState({
    providerId: '',
    name: '',
    code: '',
    analyteScope: '',
    roundsPerYear: '',
  })
  const [busy, setBusy] = useState(false)
  return (
    <Card className="space-y-3 p-4">
      <h2 className="font-bold text-[#173d50]">Scheme ({data.schemes.length})</h2>
      <form
        className="grid grid-cols-2 gap-2"
        onSubmit={async (e) => {
          e.preventDefault()
          if (!form.providerId) return
          setBusy(true)
          if (
            await onSubmit({
              ...form,
              roundsPerYear: form.roundsPerYear ? Number(form.roundsPerYear) : null,
            })
          )
            setForm({
              providerId: '',
              name: '',
              code: '',
              analyteScope: '',
              roundsPerYear: '',
            })
          setBusy(false)
        }}
      >
        <Field label="Provider">
          <Select value={form.providerId} onChange={(e) => setForm({ ...form, providerId: e.target.value })} required>
            <option value="">—</option>
            {data.providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="ชื่อ scheme">
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        </Field>
        <Field label="Code">
          <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
        </Field>
        <Field label="Rounds/ปี">
          <Input className="mono" type="number" value={form.roundsPerYear} onChange={(e) => setForm({ ...form, roundsPerYear: e.target.value })} />
        </Field>
        <div className="col-span-2">
          <Field label="Analyte scope">
            <Input value={form.analyteScope} onChange={(e) => setForm({ ...form, analyteScope: e.target.value })} placeholder="HIV VL, HBV VL…" />
          </Field>
        </div>
        <div className="col-span-2">
          <Button disabled={busy}>เพิ่ม scheme</Button>
        </div>
      </form>
      <div className="space-y-1">
        {data.schemes.map((scheme) => (
          <div key={scheme.id} className="flex items-center justify-between gap-2 rounded-md border border-[#e3ebec] px-2 py-1.5 text-xs">
            <span>
              {scheme.providerName} · {scheme.name}
              {scheme.equipment.map((equipment) => (
                <Link key={equipment.id} href={`/equipment?view=registry&equipment=${equipment.id}`} className={`ml-2 rounded-full px-2 py-0.5 font-semibold underline ${equipment.status === 'maintenance' || equipment.status === 'out_of_service' ? 'bg-amber-100 text-amber-900' : 'bg-[#e9f5f3] text-[#087f75]'}`}>
                  {equipment.code} · {equipment.status}
                </Link>
              ))}
            </span>
            <span className="flex gap-1">
              <Button
                type="button"
                variant="ghost"
                className="min-h-7 px-2"
                title="แก้ไข scheme"
                onClick={async () => {
                  const name = window.prompt('ชื่อ scheme:', scheme.name)
                  if (!name?.trim()) return
                  await onUpdate(scheme.id, {
                    providerId: scheme.providerId,
                    name,
                    code: scheme.code,
                    analyteScope: scheme.analyteScope,
                    roundsPerYear: scheme.roundsPerYear,
                  })
                }}
              >
                <Pencil className="size-3.5" />
              </Button>
              <Button type="button" variant="danger" className="min-h-7 px-2" title="ลบ scheme" onClick={() => window.confirm(`ลบ scheme \"${scheme.name}\" ใช่ไหม?`) && onDelete(scheme.id)}>
                <Trash2 className="size-3.5" />
              </Button>
            </span>
          </div>
        ))}
      </div>
    </Card>
  )
}

function RoundForm({ onSubmit, onUpdate, onDelete, data }: { onSubmit: (b: unknown) => Promise<boolean>; onUpdate: (id: string, b: unknown) => Promise<boolean>; onDelete: (id: string) => Promise<boolean>; data: EqaWorkspace }) {
  const [form, setForm] = useState({
    schemeId: '',
    roundLabel: '',
    sampleReceivedDate: '',
    resultDueDate: '',
  })
  const [busy, setBusy] = useState(false)
  return (
    <Card className="space-y-3 p-4">
      <h2 className="font-bold text-[#173d50]">Round ({data.rounds.length})</h2>
      <form
        className="grid grid-cols-2 gap-2"
        onSubmit={async (e) => {
          e.preventDefault()
          if (!form.schemeId) return
          setBusy(true)
          if (
            await onSubmit({
              ...form,
              sampleReceivedDate: form.sampleReceivedDate || null,
              resultDueDate: form.resultDueDate || null,
            })
          )
            setForm({
              schemeId: '',
              roundLabel: '',
              sampleReceivedDate: '',
              resultDueDate: '',
            })
          setBusy(false)
        }}
      >
        <Field label="Scheme">
          <Select value={form.schemeId} onChange={(e) => setForm({ ...form, schemeId: e.target.value })} required>
            <option value="">—</option>
            {data.schemes.map((s) => (
              <option key={s.id} value={s.id}>
                {s.providerName} · {s.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Round label">
          <Input value={form.roundLabel} onChange={(e) => setForm({ ...form, roundLabel: e.target.value })} placeholder="2026-1" required />
        </Field>
        <Field label="รับตัวอย่าง">
          <Input type="date" value={form.sampleReceivedDate} onChange={(e) => setForm({ ...form, sampleReceivedDate: e.target.value })} />
        </Field>
        <Field label="ครบกำหนดส่ง">
          <Input type="date" value={form.resultDueDate} onChange={(e) => setForm({ ...form, resultDueDate: e.target.value })} />
        </Field>
        <div className="col-span-2">
          <Button disabled={busy}>เพิ่ม round</Button>
        </div>
      </form>
      <div className="space-y-1">
        {data.rounds.map((round) => (
          <div key={round.id} className="flex items-center justify-between gap-2 rounded-md border border-[#e3ebec] px-2 py-1.5 text-xs">
            <span>
              {round.schemeName} · {round.roundLabel}
            </span>
            <span className="flex gap-1">
              <Button
                type="button"
                variant="ghost"
                className="min-h-7 px-2"
                title="แก้ไข round"
                onClick={async () => {
                  const roundLabel = window.prompt('ชื่อ round:', round.roundLabel)
                  if (!roundLabel?.trim()) return
                  await onUpdate(round.id, { roundLabel })
                }}
              >
                <Pencil className="size-3.5" />
              </Button>
              <Button type="button" variant="danger" className="min-h-7 px-2" title="ลบ round" onClick={() => window.confirm(`ลบ round \"${round.roundLabel}\" ใช่ไหม?`) && onDelete(round.id)}>
                <Trash2 className="size-3.5" />
              </Button>
            </span>
          </div>
        ))}
      </div>
    </Card>
  )
}

function AnnualSummary({ data }: { data: EqaWorkspace }) {
  const [schemeId, setSchemeId] = useState('')
  return (
    <Card className="space-y-3 p-4">
      <h2 className="flex items-center gap-1.5 font-bold text-[#173d50]">
        <FolderOpen className="size-4" /> ใบสรุปผล EQA ประจำปี
      </h2>
      <Field label="Scheme">
        <Select value={schemeId} onChange={(e) => setSchemeId(e.target.value)}>
          <option value="">— เลือก scheme —</option>
          {data.schemes.map((s) => (
            <option key={s.id} value={s.id}>
              {s.providerName} · {s.name}
            </option>
          ))}
        </Select>
      </Field>
      {schemeId ? <AttachmentList module="eqa" entityType="eqa-scheme" entityId={schemeId} kind="eqa-annual-summary" canDelete label="ใบสรุปประจำปี" /> : <p className="text-xs text-[#9aafb4]">เลือก scheme เพื่อแนบใบสรุปประจำปี</p>}
    </Card>
  )
}
