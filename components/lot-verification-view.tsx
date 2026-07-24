'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { GitCompareArrows, Pencil, Plus, Trash2, X } from 'lucide-react'
import type { BmActor } from '@/lib/bm/types'
import type { LotVerification, LotVerifStatus, LotVerifWorkspace } from '@/lib/lotverif/types'
import { formatDate } from '@/lib/bm/rules'
import { api, Button, Card, Field, Input, Notice, PageHeader, Select, StatCard, StatusBadge, type StatusTone, Textarea } from '@/components/ui'
import { AttachmentList } from '@/components/attachments'

const STATUS_TONE: Record<LotVerifStatus, StatusTone> = {
  draft: 'neutral',
  'in-progress': 'warning',
  passed: 'accepted',
  failed: 'rejected',
  released: 'accepted',
  rejected: 'rejected',
}
const STATUS_LABEL: Record<LotVerifStatus, string> = {
  draft: 'ร่าง',
  'in-progress': 'กำลังทำ',
  passed: 'ผ่าน',
  failed: 'ไม่ผ่าน',
  released: 'อนุมัติใช้',
  rejected: 'ปฏิเสธ',
}

export function LotVerificationView({ actor, initialData }: { actor: BmActor; initialData: LotVerifWorkspace }) {
  const router = useRouter()
  const [creating, setCreating] = useState(false)
  const data = initialData
  const refresh = () => router.refresh()

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Monitoring"
        title="Lot-to-lot verification"
        description="ตรวจรับ reagent / control lot ใหม่เทียบ lot เดิมก่อนนำมาใช้ (ISO 15189)"
        actions={<Button onClick={() => setCreating((v) => !v)}><Plus className="size-4" /> สร้างใหม่</Button>}
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="ทั้งหมด" value={data.summary.total} />
        <StatCard label="กำลังดำเนินการ" value={data.summary.open} tone={data.summary.open ? 'warning' : 'neutral'} />
        <StatCard label="อนุมัติใช้แล้ว" value={data.summary.released} tone="accepted" />
        <StatCard label="ไม่ผ่าน/ปฏิเสธ" value={data.summary.failedOrRejected} tone={data.summary.failedOrRejected ? 'rejected' : 'neutral'} />
      </div>

      {creating ? <CreateForm data={data} onDone={() => { setCreating(false); refresh() }} /> : null}

      {data.verifications.length ? (
        <div className="space-y-4">
          {data.verifications.map((v) => (
            <VerificationCard key={v.id} verification={v} data={data} actor={actor} onChanged={refresh} />
          ))}
        </div>
      ) : (
        <Card className="p-8 text-center text-sm text-[#789097]">ยังไม่มี verification — กดปุ่มสร้างใหม่</Card>
      )}
    </div>
  )
}

function CreateForm({ data, onDone }: { data: LotVerifWorkspace; onDone: () => void }) {
  const [subjectKind, setSubjectKind] = useState<'reagent-lot' | 'control-lot'>('control-lot')
  const [form, setForm] = useState({ title: '', method: 'parallel-comparison', acceptanceCriteria: '', newLot: '', oldLot: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const lots = subjectKind === 'reagent-lot' ? data.reagentLots : data.controlLots

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const lotFields =
        subjectKind === 'reagent-lot'
          ? { newStockLotId: form.newLot || null, oldStockLotId: form.oldLot || null }
          : { newControlLotId: form.newLot || null, oldControlLotId: form.oldLot || null }
      await api('/api/lot-verification/verifications', {
        method: 'POST',
        body: JSON.stringify({
          subjectKind,
          title: form.title.trim() || null,
          method: form.method,
          acceptanceCriteria: form.acceptanceCriteria.trim() || null,
          ...lotFields,
        }),
      })
      onDone()
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'สร้างไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="p-4">
      <h3 className="flex items-center gap-2 font-bold text-[#173d50]"><GitCompareArrows className="size-4" /> สร้าง verification</h3>
      <form onSubmit={submit} className="mt-3 grid gap-3 lg:grid-cols-2">
        <Field label="ชนิด / Subject" hint={subjectKind === 'reagent-lot' ? 'แสดงเฉพาะ Stock item หมวด Reagent ที่ยังใช้งาน' : undefined}>
          <Select value={subjectKind} onChange={(e) => { setSubjectKind(e.target.value as 'reagent-lot' | 'control-lot'); setForm({ ...form, newLot: '', oldLot: '' }) }}>
            <option value="control-lot">Control lot (IQC)</option>
            <option value="reagent-lot">Reagent lot (Stock)</option>
          </Select>
        </Field>
        <Field label="วิธี / Method">
          <Select value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })}>
            <option value="parallel-comparison">Parallel comparison</option>
            <option value="qc-acceptance">QC acceptance</option>
            <option value="patient-comparison">Patient comparison</option>
          </Select>
        </Field>
        <Field label="Lot ใหม่ / New lot">
          <Select required value={form.newLot} onChange={(e) => setForm({ ...form, newLot: e.target.value })}>
            <option value="">— เลือก —</option>
            {lots.map((lot) => <option key={lot.id} value={lot.id}>{lot.label}{lot.subLabel ? ` · ${lot.subLabel}` : ''}</option>)}
          </Select>
        </Field>
        <Field label="Lot เดิม / Old lot (comparator)">
          <Select value={form.oldLot} onChange={(e) => setForm({ ...form, oldLot: e.target.value })}>
            <option value="">— ไม่ระบุ —</option>
            {lots.filter((lot) => lot.id !== form.newLot).map((lot) => <option key={lot.id} value={lot.id}>{lot.label}{lot.subLabel ? ` · ${lot.subLabel}` : ''}</option>)}
          </Select>
        </Field>
        <Field label="หัวข้อ / Title"><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="เช่น CD4 control lot BM0526L" /></Field>
        <Field label="เกณฑ์ยอมรับ / Acceptance criteria"><Input value={form.acceptanceCriteria} onChange={(e) => setForm({ ...form, acceptanceCriteria: e.target.value })} placeholder="เช่น %diff ≤ 10%" /></Field>
        {error ? <div className="lg:col-span-2"><Notice tone="danger">{error}</Notice></div> : null}
        <div className="lg:col-span-2"><Button type="submit" disabled={busy}>{busy ? 'กำลังบันทึก…' : 'สร้าง'}</Button></div>
      </form>
    </Card>
  )
}

function VerificationCard({ verification: v, data, actor, onChanged }: { verification: LotVerification; data: LotVerifWorkspace; actor: BmActor; onChanged: () => void }) {
  const isAdmin = actor.role === 'Admin'
  const editable = v.status === 'draft' || v.status === 'in-progress' || v.status === 'passed' || v.status === 'failed'
  const [conclusion, setConclusion] = useState(v.conclusion ?? '')
  const [busy, setBusy] = useState('')
  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState({ title: v.title ?? '', method: v.method, acceptanceCriteria: v.acceptanceCriteria ?? '' })
  const [actionError, setActionError] = useState('')

  async function setStatus(status: LotVerifStatus) {
    setBusy(status)
    try {
      await api(`/api/lot-verification/verifications/${v.id}`, { method: 'PATCH', body: JSON.stringify({ status, conclusion: conclusion.trim() || null }) })
      onChanged()
    } finally {
      setBusy('')
    }
  }

  async function saveEdit(event: React.FormEvent) {
    event.preventDefault()
    setBusy('edit')
    setActionError('')
    try {
      await api(`/api/lot-verification/verifications/${v.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          title: editForm.title.trim() || null,
          method: editForm.method,
          acceptanceCriteria: editForm.acceptanceCriteria.trim() || null,
        }),
      })
      setEditing(false)
      onChanged()
    } catch (requestError) {
      setActionError(requestError instanceof Error ? requestError.message : 'แก้ไขไม่สำเร็จ')
    } finally {
      setBusy('')
    }
  }

  async function remove() {
    if (!window.confirm(`ลบ verification "${v.title || v.newLotLabel || 'รายการนี้'}" ใช่ไหม?\n\nลบได้เฉพาะรายการที่ยังไม่ final และไม่มีไฟล์แนบ`)) return
    setBusy('delete')
    setActionError('')
    try {
      await api(`/api/lot-verification/verifications/${v.id}`, { method: 'DELETE' })
      onChanged()
    } catch (requestError) {
      setActionError(requestError instanceof Error ? requestError.message : 'ลบไม่สำเร็จ')
    } finally {
      setBusy('')
    }
  }

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-bold text-[#173d50]">{v.title || (v.subjectKind === 'reagent-lot' ? 'Reagent lot' : 'Control lot')}</h3>
            <StatusBadge tone={STATUS_TONE[v.status]} label={STATUS_LABEL[v.status]} />
          </div>
          <p className="mt-0.5 text-xs text-[#789097]">
            {v.subjectKind === 'reagent-lot' ? 'Reagent' : 'Control'} · {v.method}
            {' · '}ใหม่: <span className="font-semibold text-[#3f6470]">{v.newLotLabel ?? '—'}</span>
            {v.oldLotLabel ? <> · เทียบ: {v.oldLotLabel}</> : null}
          </p>
          {v.acceptanceCriteria ? <p className="text-[11px] text-[#8ba0a5]">เกณฑ์: {v.acceptanceCriteria}</p> : null}
        </div>
        <div className="flex items-center gap-1">
          <p className="mr-1 text-[11px] text-[#8ba0a5]">{formatDate(v.createdAt.slice(0, 10))} · {v.performedByName ?? '—'}</p>
          {editable ? <Button type="button" variant="ghost" className="min-h-8 px-2 py-1" disabled={busy !== ''} onClick={() => setEditing((value) => !value)} title="แก้ไข verification"><Pencil className="size-3.5" /></Button> : null}
          {isAdmin && editable ? <Button type="button" variant="danger" className="min-h-8 px-2 py-1" disabled={busy !== ''} onClick={remove} title="ลบ verification"><Trash2 className="size-3.5" /></Button> : null}
        </div>
      </div>

      {editing ? (
        <form onSubmit={saveEdit} className="mt-3 grid gap-2 rounded-md border border-[#d7e6e7] bg-[#f8fbfb] p-3 sm:grid-cols-3">
          <Field label="หัวข้อ / Title"><Input value={editForm.title} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} /></Field>
          <Field label="วิธี / Method"><Select value={editForm.method} onChange={(e) => setEditForm({ ...editForm, method: e.target.value as LotVerification['method'] })}><option value="parallel-comparison">Parallel comparison</option><option value="qc-acceptance">QC acceptance</option><option value="patient-comparison">Patient comparison</option></Select></Field>
          <Field label="เกณฑ์ยอมรับ / Acceptance criteria"><Input value={editForm.acceptanceCriteria} onChange={(e) => setEditForm({ ...editForm, acceptanceCriteria: e.target.value })} /></Field>
          <div className="flex items-center gap-2 sm:col-span-3"><Button disabled={busy !== ''}>{busy === 'edit' ? 'กำลังบันทึก…' : 'บันทึกการแก้ไข'}</Button><Button type="button" variant="ghost" disabled={busy !== ''} onClick={() => setEditing(false)}><X className="size-3.5" /> ยกเลิก</Button></div>
        </form>
      ) : null}
      {actionError ? <div className="mt-3"><Notice tone="danger">{actionError}</Notice></div> : null}

      <MeasurementTable verification={v} />

      {editable ? <AddMeasurement verification={v} data={data} onAdded={onChanged} /> : null}

      <div className="mt-3">
        <AttachmentList module="lotverif" entityType="verification" entityId={v.id} kind="verification-report" canDelete={isAdmin} label="รายงาน / CoA" />
      </div>

      <div className="mt-3 border-t border-[#eef3f3] pt-3">
        {editable ? (
          <div className="space-y-2">
            <Field label="สรุปผล / Conclusion"><Textarea rows={2} value={conclusion} onChange={(e) => setConclusion(e.target.value)} /></Field>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" disabled={busy !== ''} onClick={() => setStatus('passed')}>ผ่าน</Button>
              <Button variant="danger" disabled={busy !== ''} onClick={() => setStatus('failed')}>ไม่ผ่าน</Button>
              {isAdmin && v.status === 'passed' ? <Button disabled={busy !== ''} onClick={() => setStatus('released')}>อนุมัติใช้ / Release</Button> : null}
              {isAdmin && (v.status === 'failed' || v.status === 'passed') ? <Button variant="danger" disabled={busy !== ''} onClick={() => setStatus('rejected')}>ปฏิเสธ</Button> : null}
            </div>
            {v.status === 'passed' && !isAdmin ? <p className="text-[11px] text-[#8ba0a5]">รอ Admin อนุมัติใช้ (release)</p> : null}
          </div>
        ) : (
          <div className="text-sm text-[#3f6470]">
            {v.conclusion ? <p><span className="font-semibold">สรุป:</span> {v.conclusion}</p> : null}
            {v.releasedByName ? <p className="text-[11px] text-[#8ba0a5]">{STATUS_LABEL[v.status]} โดย {v.releasedByName} · {v.releasedAt ? formatDate(v.releasedAt.slice(0, 10)) : ''}</p> : null}
          </div>
        )}
      </div>
    </Card>
  )
}

function MeasurementTable({ verification: v }: { verification: LotVerification }) {
  if (!v.measurements.length) return <p className="mt-3 text-xs text-[#91a4a9]">ยังไม่มีข้อมูลเทียบ</p>
  return (
    <div className="mt-3 overflow-x-auto rounded-md border border-[#e3ebec]">
      <table className="w-full text-left text-xs">
        <thead className="bg-[#f6fafa] text-[#55727c]">
          <tr>
            <th className="px-2 py-1.5 font-semibold">Analyte / Sample</th>
            <th className="px-2 py-1.5 text-right font-semibold">เดิม</th>
            <th className="px-2 py-1.5 text-right font-semibold">ใหม่</th>
            <th className="px-2 py-1.5 text-right font-semibold">%diff</th>
            <th className="px-2 py-1.5 font-semibold">ผล</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#eef3f3]">
          {v.measurements.map((m) => {
            const qualitative = m.oldQualitative != null || m.newQualitative != null
            const ok = qualitative ? m.concordant : m.withinCriteria
            return (
              <tr key={m.id}>
                <td className="px-2 py-1.5 text-[#3f6470]">{m.analyteLabel || m.sampleLabel || '—'}</td>
                <td className="mono px-2 py-1.5 text-right tabular-nums">{qualitative ? m.oldQualitative ?? '—' : m.oldValue ?? '—'}</td>
                <td className="mono px-2 py-1.5 text-right tabular-nums">{qualitative ? m.newQualitative ?? '—' : m.newValue ?? '—'}</td>
                <td className="mono px-2 py-1.5 text-right tabular-nums">{m.percentDiff != null ? `${m.percentDiff.toFixed(1)}%` : '—'}</td>
                <td className="px-2 py-1.5">{ok == null ? '—' : <StatusBadge tone={ok ? 'accepted' : 'rejected'} label={ok ? 'ผ่าน' : 'เกิน'} />}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function AddMeasurement({ verification: v, data, onAdded }: { verification: LotVerification; data: LotVerifWorkspace; onAdded: () => void }) {
  const [row, setRow] = useState({ analyteId: '', sampleLabel: '', oldValue: '', newValue: '', acceptancePercent: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function add(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const analyte = data.analytes.find((a) => a.id === row.analyteId)
      await api('/api/lot-verification/measurements', {
        method: 'POST',
        body: JSON.stringify({
          verificationId: v.id,
          rows: [{
            analyteId: row.analyteId || null,
            analyteLabel: analyte ? analyte.name : null,
            sampleLabel: row.sampleLabel.trim() || null,
            oldValue: row.oldValue === '' ? null : Number(row.oldValue),
            newValue: row.newValue === '' ? null : Number(row.newValue),
            acceptancePercent: row.acceptancePercent === '' ? null : Number(row.acceptancePercent),
          }],
        }),
      })
      setRow({ analyteId: '', sampleLabel: '', oldValue: '', newValue: '', acceptancePercent: '' })
      onAdded()
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'เพิ่มไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={add} className="mt-3 grid items-end gap-2 rounded-md border border-[#e3ebec] bg-[#f8fbfb] p-3 sm:grid-cols-6">
      <Field label="Analyte">
        <Select value={row.analyteId} onChange={(e) => setRow({ ...row, analyteId: e.target.value })}>
          <option value="">— ไม่ระบุ —</option>
          {data.analytes.map((a) => <option key={a.id} value={a.id}>{a.code}</option>)}
        </Select>
      </Field>
      <Field label="Sample"><Input value={row.sampleLabel} onChange={(e) => setRow({ ...row, sampleLabel: e.target.value })} placeholder="QC L1" /></Field>
      <Field label="ค่าเดิม"><Input type="number" step="any" value={row.oldValue} onChange={(e) => setRow({ ...row, oldValue: e.target.value })} /></Field>
      <Field label="ค่าใหม่"><Input type="number" step="any" value={row.newValue} onChange={(e) => setRow({ ...row, newValue: e.target.value })} /></Field>
      <Field label="เกณฑ์ %"><Input type="number" step="any" value={row.acceptancePercent} onChange={(e) => setRow({ ...row, acceptancePercent: e.target.value })} placeholder="10" /></Field>
      <Button type="submit" disabled={busy}>{busy ? '…' : 'เพิ่ม'}</Button>
      {error ? <div className="sm:col-span-6"><Notice tone="danger">{error}</Notice></div> : null}
    </form>
  )
}
