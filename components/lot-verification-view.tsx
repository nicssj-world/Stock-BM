'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, CheckCircle2, ChevronDown, GitCompareArrows, Pencil, Plus, Settings2, Trash2, X } from 'lucide-react'
import type { BmActor } from '@/lib/bm/types'
import type { LotVerification, LotVerifParallelRow, LotVerifStatus, LotVerifWorkspace } from '@/lib/lotverif/types'
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
            <VerificationCard key={`${v.id}-${v.status}`} verification={v} data={data} actor={actor} onChanged={refresh} />
          ))}
        </div>
      ) : (
        <Card className="p-8 text-center text-sm text-[#789097]">ยังไม่มี verification — กดปุ่มสร้างใหม่</Card>
      )}
    </div>
  )
}

function CreateForm({ data, onDone }: { data: LotVerifWorkspace; onDone: () => void }) {
  const [subjectKind, setSubjectKind] = useState<'reagent-lot' | 'control-lot'>('reagent-lot')
  const [form, setForm] = useState({ instrumentId: '', title: '', method: 'parallel-comparison', acceptanceCriteria: '', newLot: '', oldLot: '', parallelAnalyteId: '', parallelLimit: '1' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const selectedInstrument = data.instruments.find((instrument) => instrument.id === form.instrumentId)
  const analytes = data.analytes.filter((analyte) => analyte.dataType === 'quantitative' && analyte.instrumentIds.includes(form.instrumentId))
  const lots = (subjectKind === 'reagent-lot' ? data.reagentLots : data.controlLots).filter((lot) => {
    if (!form.instrumentId || !lot.instrumentIds.includes(form.instrumentId)) return false
    return subjectKind === 'reagent-lot' || !form.parallelAnalyteId || lot.analyteIds.includes(form.parallelAnalyteId)
  })

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
          instrumentId: form.instrumentId,
          subjectKind,
          title: form.title.trim() || null,
          method: form.method,
          acceptanceCriteria: form.acceptanceCriteria.trim() || null,
          parallelAnalyteId: form.method === 'parallel-comparison' ? form.parallelAnalyteId || null : null,
          parallelLimit: form.method === 'parallel-comparison' ? Number(form.parallelLimit) : null,
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
        <div className="lg:col-span-2">
          <Field label="เครื่องมือ / Instrument" hint={data.unlinkedEquipment.length ? `เลือกก่อน เพื่อกรอง Analyte และ Lot ให้ตรงกับเครื่อง · ${data.unlinkedEquipment.map((equipment) => equipment.code).join(', ')} ยังไม่ผูก IQC` : 'เลือกก่อน เพื่อกรอง Analyte และ Lot ให้ตรงกับเครื่อง'}>
            <Select required value={form.instrumentId} onChange={(e) => setForm({ ...form, instrumentId: e.target.value, parallelAnalyteId: '', newLot: '', oldLot: '' })}>
              <option value="">— เลือกเครื่องมือก่อน —</option>
              {data.instruments.map((instrument) => <option key={instrument.id} value={instrument.id}>{instrument.code} · {instrument.name}{instrument.model ? ` · ${instrument.model}` : ''}</option>)}
              {data.unlinkedEquipment.map((equipment) => <option key={`unlinked-${equipment.id}`} value="" disabled>{equipment.code} · {equipment.name} · ยังไม่ผูก IQC</option>)}
            </Select>
          </Field>
        </div>
        <Field label="ชนิด / Subject" hint={subjectKind === 'reagent-lot' ? 'แสดงเฉพาะ Stock item หมวด Reagent ที่ยังใช้งาน และผูกกับเครื่องมือที่เลือก' : 'แสดงเฉพาะ Control lot ที่มี Analyte/Control spec ของเครื่องมือที่เลือก'}>
          <Select value={subjectKind} onChange={(e) => { setSubjectKind(e.target.value as 'reagent-lot' | 'control-lot'); setForm({ ...form, newLot: '', oldLot: '' }) }}>
            <option value="control-lot">Control lot (IQC)</option>
            <option value="reagent-lot">Reagent lot (Stock)</option>
          </Select>
        </Field>
        <Field label="วิธี / Method">
          <Select value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value, parallelAnalyteId: '', newLot: '', oldLot: '' })}>
            <option value="parallel-comparison">Parallel comparison</option>
            <option value="qc-acceptance">QC acceptance</option>
            <option value="patient-comparison">Patient comparison</option>
          </Select>
        </Field>
        {form.method === 'parallel-comparison' ? (
          <>
            <Field label="Analyte / ตัวตรวจ" hint={form.instrumentId && !analytes.length ? 'เครื่องมือนี้ยังไม่มี quantitative analyte ใน active Control plan' : 'เลือก quantitative analyte; Viral load จะใช้สเกล log10 อัตโนมัติ'}>
              <Select required disabled={!form.instrumentId} value={form.parallelAnalyteId} onChange={(e) => setForm({ ...form, parallelAnalyteId: e.target.value, newLot: '', oldLot: '' })}>
                <option value="">{form.instrumentId ? '— เลือก —' : '— เลือกเครื่องมือก่อน —'}</option>
                {analytes.map((analyte) => (
                  <option key={analyte.id} value={analyte.id}>{analyte.code} · {analyte.scale}{analyte.unit ? ` · ${analyte.unit}` : ''}</option>
                ))}
              </Select>
            </Field>
            <Field label="เกณฑ์ Parallel index" hint="ค่าเริ่มต้นตามฟอร์ม = 1; ปรับตาม SOP ของ Analyte ได้">
              <Input required type="number" min="0.000001" step="any" value={form.parallelLimit} onChange={(e) => setForm({ ...form, parallelLimit: e.target.value })} />
            </Field>
          </>
        ) : null}
        <Field label="Lot ใหม่ / New lot" hint={form.instrumentId && !lots.length ? 'ไม่พบ Lot ที่ผูกกับเครื่องมือและ Analyte นี้' : undefined}>
          <Select required disabled={!form.instrumentId} value={form.newLot} onChange={(e) => setForm({ ...form, newLot: e.target.value, oldLot: '' })}>
            <option value="">{form.instrumentId ? '— เลือก —' : '— เลือกเครื่องมือก่อน —'}</option>
            {lots.map((lot) => <option key={lot.id} value={lot.id}>{lot.label}{lot.subLabel ? ` · ${lot.subLabel}` : ''}</option>)}
          </Select>
        </Field>
        <Field label="Lot เดิม / Old lot (comparator)" hint={form.instrumentId && !lots.length ? 'ไม่พบ Lot ที่ผูกกับเครื่องมือและ Analyte นี้' : undefined}>
          <Select disabled={!form.instrumentId} value={form.oldLot} onChange={(e) => setForm({ ...form, oldLot: e.target.value })}>
            <option value="">{form.instrumentId ? '— ไม่ระบุ —' : '— เลือกเครื่องมือก่อน —'}</option>
            {lots.filter((lot) => lot.id !== form.newLot).map((lot) => <option key={lot.id} value={lot.id}>{lot.label}{lot.subLabel ? ` · ${lot.subLabel}` : ''}</option>)}
          </Select>
        </Field>
        <Field label="หัวข้อ / Title"><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="เช่น CD4 control lot BM0526L" /></Field>
        {form.method !== 'parallel-comparison' ? <Field label="เกณฑ์ยอมรับ / Acceptance criteria"><Input value={form.acceptanceCriteria} onChange={(e) => setForm({ ...form, acceptanceCriteria: e.target.value })} placeholder="เช่น %diff ≤ 10%" /></Field> : <p className="self-end text-xs text-[#789097]">{selectedInstrument ? `${selectedInstrument.code} · ${selectedInstrument.name}` : 'เลือกเครื่องมือก่อน'} · Parallel จะกรอง Analyte/Lot ตามเครื่อง และคำนวณใน scale ของ Analyte</p>}
        {error ? <div className="lg:col-span-2"><Notice tone="danger">{error}</Notice></div> : null}
        <div className="lg:col-span-2"><Button type="submit" disabled={busy}>{busy ? 'กำลังบันทึก…' : 'สร้าง'}</Button></div>
      </form>
    </Card>
  )
}

function VerificationCard({ verification: v, data, actor, onChanged }: { verification: LotVerification; data: LotVerifWorkspace; actor: BmActor; onChanged: () => void }) {
  const isAdmin = actor.role === 'Admin'
  const editable = true
  const canChangeStatus = v.status !== 'released' && v.status !== 'rejected'
  const [conclusion, setConclusion] = useState(v.conclusion ?? '')
  const [busy, setBusy] = useState('')
  const [editing, setEditing] = useState(false)
  const [expanded, setExpanded] = useState(v.status !== 'released' && v.status !== 'rejected')
  const [editForm, setEditForm] = useState({ instrumentId: v.instrumentId ?? '', title: v.title ?? '', method: v.method, acceptanceCriteria: v.acceptanceCriteria ?? '', parallelAnalyteId: v.parallelAnalyteId ?? '', parallelLimit: String(v.parallelLimit ?? 1) })
  const [actionError, setActionError] = useState('')
  const canPass = v.method !== 'parallel-comparison' || v.parallelSummary?.passed === true
  const editAnalytes = data.analytes.filter((analyte) => analyte.dataType === 'quantitative' && analyte.instrumentIds.includes(editForm.instrumentId))

  async function setStatus(status: LotVerifStatus) {
    setBusy(status)
    setActionError('')
    try {
      await api(`/api/lot-verification/verifications/${v.id}`, { method: 'PATCH', body: JSON.stringify({ status, conclusion: conclusion.trim() || null }) })
      onChanged()
    } catch (requestError) {
      setActionError(requestError instanceof Error ? requestError.message : 'เปลี่ยนสถานะไม่สำเร็จ')
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
          instrumentId: editForm.instrumentId || null,
          method: editForm.method,
          acceptanceCriteria: editForm.acceptanceCriteria.trim() || null,
          parallelAnalyteId: editForm.method === 'parallel-comparison' ? editForm.parallelAnalyteId || null : null,
          parallelLimit: editForm.method === 'parallel-comparison' ? Number(editForm.parallelLimit) : null,
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
    if (!window.confirm(`ลบ verification "${v.title || v.newLotLabel || 'รายการนี้'}" ใช่ไหม?\n\nการลบไม่สามารถย้อนกลับได้ และต้องไม่มีไฟล์แนบ`)) return
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
          {v.instrumentId ? <p className="text-[11px] text-[#55727c]"><Settings2 className="mr-1 inline size-3" aria-hidden="true" />เครื่องมือ: <span className="font-semibold">{v.instrumentCode ?? v.instrumentId} · {v.instrumentName ?? '—'}</span></p> : <p className="text-[11px] text-[#a86a2a]">เครื่องมือ: รายการเดิมยังไม่ได้ระบุ</p>}
          {v.parallelAnalyteCode ? <p className="text-[11px] text-[#8ba0a5]">Analyte: {v.parallelAnalyteCode} · scale: {v.parallelScale ?? 'linear'}{v.parallelUnit ? ` · ${v.parallelUnit}` : ''}</p> : null}
          {v.acceptanceCriteria ? <p className="text-[11px] text-[#8ba0a5]">เกณฑ์: {v.acceptanceCriteria}</p> : null}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-1">
          <p className="mr-1 text-[11px] text-[#8ba0a5]">{formatDate(v.createdAt.slice(0, 10))} · {v.performedByName ?? '—'}</p>
          {editable ? <Button type="button" variant="ghost" className="min-h-8 px-2 py-1" disabled={busy !== ''} onClick={() => { setExpanded(true); setEditing((value) => !value) }} title="แก้ไข verification" aria-label="แก้ไข verification"><Pencil className="size-3.5" /></Button> : null}
          {isAdmin && editable ? <Button type="button" variant="danger" className="min-h-8 px-2 py-1" disabled={busy !== ''} onClick={remove} title="ลบ verification" aria-label="ลบ verification"><Trash2 className="size-3.5" /></Button> : null}
          <Button
            type="button"
            variant="ghost"
            className="min-h-8 gap-1 px-2 py-1 text-xs"
            onClick={() => setExpanded((value) => !value)}
            aria-expanded={expanded}
            aria-controls={`lotverif-details-${v.id}`}
            aria-label={`${expanded ? 'หุบรายการ' : 'แสดงรายละเอียด'} ${v.title || v.newLotLabel || 'verification'}`}
          >
            <ChevronDown className={`size-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`} aria-hidden="true" />
            {expanded ? 'หุบรายการ' : 'แสดงรายละเอียด'}
          </Button>
        </div>
      </div>

      {v.conclusion ? (
        <div
          className={`mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3 ${isPositiveConclusion(v.conclusion) ? 'border-[#b9dfc7] bg-[#effaf3] text-[#236b39]' : 'border-[#efc7cc] bg-[#fff5f6] text-[#a83541]'}`}
          aria-label={`สรุปผล ${v.conclusion}`}
        >
          <div className="flex items-center gap-3">
            {isPositiveConclusion(v.conclusion) ? <CheckCircle2 className="size-6 shrink-0" aria-hidden="true" /> : <AlertTriangle className="size-6 shrink-0" aria-hidden="true" />}
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.12em]">สรุปผล</p>
              <p className="text-lg font-bold leading-tight">{v.conclusion}</p>
            </div>
          </div>
          {v.releasedByName ? <p className="text-xs font-medium">อนุมัติใช้โดย {v.releasedByName}{v.releasedAt ? ` · ${formatDate(v.releasedAt.slice(0, 10))}` : ''}</p> : null}
        </div>
      ) : null}

      {expanded ? (
        <div id={`lotverif-details-${v.id}`} className="mt-1">
          {editing ? (
            <form onSubmit={saveEdit} className="mt-3 grid gap-2 rounded-md border border-[#d7e6e7] bg-[#f8fbfb] p-3 sm:grid-cols-3">
              <Field label="เครื่องมือ / Instrument"><Select required value={editForm.instrumentId} onChange={(e) => setEditForm({ ...editForm, instrumentId: e.target.value, parallelAnalyteId: '' })}><option value="">— เลือกเครื่องมือ —</option>{data.instruments.map((instrument) => <option key={instrument.id} value={instrument.id}>{instrument.code} · {instrument.name}{instrument.model ? ` · ${instrument.model}` : ''}</option>)}{data.unlinkedEquipment.map((equipment) => <option key={`unlinked-${equipment.id}`} value="" disabled>{equipment.code} · {equipment.name} · ยังไม่ผูก IQC</option>)}</Select></Field>
              <Field label="หัวข้อ / Title"><Input value={editForm.title} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} /></Field>
              <Field label="วิธี / Method"><Select value={editForm.method} onChange={(e) => setEditForm({ ...editForm, method: e.target.value as LotVerification['method'], parallelAnalyteId: '' })}><option value="parallel-comparison">Parallel comparison</option><option value="qc-acceptance">QC acceptance</option><option value="patient-comparison">Patient comparison</option></Select></Field>
              {editForm.method === 'parallel-comparison' ? <>
                <Field label="Analyte / ตัวตรวจ"><Select required disabled={!editForm.instrumentId} value={editForm.parallelAnalyteId} onChange={(e) => setEditForm({ ...editForm, parallelAnalyteId: e.target.value })}><option value="">{editForm.instrumentId ? '— เลือก —' : '— เลือกเครื่องมือก่อน —'}</option>{editAnalytes.map((analyte) => <option key={analyte.id} value={analyte.id}>{analyte.code} · {analyte.scale}{analyte.unit ? ` · ${analyte.unit}` : ''}</option>)}</Select></Field>
                <Field label="Parallel index limit"><Input required type="number" min="0.000001" step="any" value={editForm.parallelLimit} onChange={(e) => setEditForm({ ...editForm, parallelLimit: e.target.value })} /></Field>
              </> : null}
              <Field label="เกณฑ์ยอมรับ / Acceptance criteria"><Input value={editForm.acceptanceCriteria} onChange={(e) => setEditForm({ ...editForm, acceptanceCriteria: e.target.value })} /></Field>
              <div className="flex items-center gap-2 sm:col-span-3"><Button disabled={busy !== ''}>{busy === 'edit' ? 'กำลังบันทึก…' : 'บันทึกการแก้ไข'}</Button><Button type="button" variant="ghost" disabled={busy !== ''} onClick={() => setEditing(false)}><X className="size-3.5" /> ยกเลิก</Button></div>
            </form>
          ) : null}
          {actionError ? <div className="mt-3"><Notice tone="danger">{actionError}</Notice></div> : null}

          {v.method === 'parallel-comparison' ? (
            <ParallelComparisonPanel key={`${v.id}-${v.updatedAt}`} verification={v} data={data} editable={editable} onSaved={onChanged} />
          ) : (
            <>
              <MeasurementTable verification={v} />
              {editable ? <AddMeasurement verification={v} data={data} onAdded={onChanged} /> : null}
            </>
          )}

          <div className="mt-3">
            <AttachmentList module="lotverif" entityType="verification" entityId={v.id} kind="verification-report" canDelete={isAdmin} label="รายงาน / CoA" />
          </div>

          {canChangeStatus ? (
            <div className="mt-3 border-t border-[#eef3f3] pt-3">
              <div className="space-y-2">
                <Field label="สรุปผล / Conclusion"><Textarea rows={2} value={conclusion} onChange={(e) => setConclusion(e.target.value)} /></Field>
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" disabled={busy !== '' || !canPass} onClick={() => setStatus('passed')}>ผ่าน</Button>
                  <Button variant="danger" disabled={busy !== ''} onClick={() => setStatus('failed')}>ไม่ผ่าน</Button>
                  {isAdmin && v.status === 'passed' ? <Button disabled={busy !== ''} onClick={() => setStatus('released')}>อนุมัติใช้ / Release</Button> : null}
                  {isAdmin && (v.status === 'failed' || v.status === 'passed') ? <Button variant="danger" disabled={busy !== ''} onClick={() => setStatus('rejected')}>ปฏิเสธ</Button> : null}
                </div>
                {v.method === 'parallel-comparison' && !canPass ? <p className="text-[11px] text-[#a86a2a]">ต้องมีข้อมูล Parallel ครบอย่างน้อย 2 level และผลต้องอยู่ในเกณฑ์ก่อนกด “ผ่าน”</p> : null}
                {v.status === 'passed' && !isAdmin ? <p className="text-[11px] text-[#8ba0a5]">รอ Admin อนุมัติใช้ (release)</p> : null}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </Card>
  )
}

function isPositiveConclusion(value: string) {
  const normalized = value.trim().toLocaleLowerCase()
  if (!normalized) return false
  if (/(not|ไม่|fail|reject|unaccept|ไม่ผ่าน)/i.test(normalized)) return false
  return /(accept|pass|ผ่าน|approved|อนุมัติ)/i.test(normalized)
}

type ParallelDraft = {
  level: number
  controlLotId: string
  controlMean: string
  controlSd: string
  oldRun1: string
  oldRun2: string
  newRun1: string
  newRun2: string
}

function parallelDraftValue(value: number | null) {
  return value == null ? '' : String(value)
}

function parallelDraftFromRow(row: LotVerifParallelRow | undefined, level: number): ParallelDraft {
  return {
    level,
    controlLotId: row?.controlLotId ?? '',
    controlMean: parallelDraftValue(row?.controlMean ?? null),
    controlSd: parallelDraftValue(row?.controlSd ?? null),
    oldRun1: parallelDraftValue(row?.oldRun1 ?? null),
    oldRun2: parallelDraftValue(row?.oldRun2 ?? null),
    newRun1: parallelDraftValue(row?.newRun1 ?? null),
    newRun2: parallelDraftValue(row?.newRun2 ?? null),
  }
}

function asNullableNumber(value: string) {
  return value.trim() === '' ? null : Number(value)
}

function displayParallelNumber(value: number | null, digits = 3) {
  return value == null || !Number.isFinite(value) ? '—' : value.toFixed(digits)
}

function parallelReasonLabel(reason: NonNullable<LotVerification['parallelSummary']>['reason']) {
  if (reason === 'insufficient-levels') return 'ต้องมีข้อมูลอย่างน้อย 2 level'
  if (reason === 'incomplete-level') return 'ผลเดิม/ผลใหม่ของบาง level ไม่ครบ'
  if (reason === 'invalid-control-stats') return 'Mean/SD ของ Control ไม่ถูกต้อง'
  if (reason === 'invalid-log-value') return 'ค่า Viral load ต้องมากกว่า 0'
  if (reason === 'invalid-denominator') return 'ตัวหารคำนวณไม่ได้หรือเป็นศูนย์'
  if (reason === 'invalid-criteria') return 'เกณฑ์ไม่ถูกต้อง'
  return 'คำนวณแล้ว'
}

function ParallelComparisonPanel({
  verification: v,
  data,
  editable,
  onSaved,
}: {
  verification: LotVerification
  data: LotVerifWorkspace
  editable: boolean
  onSaved: () => void
}) {
  const [rows, setRows] = useState<ParallelDraft[]>(() => [1, 2, 3].map((level) => parallelDraftFromRow(v.parallelRows.find((row) => row.level === level), level)))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const scale = v.parallelScale ?? 'linear'
  const unit = v.parallelUnit ?? (scale === 'log10' ? 'copies/mL' : null)
  const parallelAnalyte = data.analytes.find((analyte) => analyte.id === v.parallelAnalyteId)
  const vlQuantitative = parallelAnalyte?.dataType === 'quantitative' && /-VL\b/i.test(parallelAnalyte.code)
  const statsFor = (controlLotId: string) => {
    const matches = data.parallelControlStats.filter((stat) => stat.controlLotId === controlLotId && stat.analyteId === v.parallelAnalyteId)
    if (vlQuantitative) return matches.find((stat) => stat.instrumentId === v.instrumentId && stat.source === 'baseline')
    return matches.find((stat) => stat.instrumentId === v.instrumentId && stat.source === 'baseline') ?? matches.find((stat) => stat.instrumentId === v.instrumentId) ?? matches.find((stat) => stat.instrumentId == null)
  }
  const parallelControlLots = data.controlLots.filter((lot) =>
    (!v.instrumentId || lot.instrumentIds.includes(v.instrumentId)) &&
    (!v.parallelAnalyteId || lot.analyteIds.includes(v.parallelAnalyteId)),
  )

  function updateRow(level: number, patch: Partial<ParallelDraft>) {
    setRows((current) => current.map((row) => row.level === level ? { ...row, ...patch } : row))
  }

  function selectControl(level: number, controlLotId: string) {
    const stat = statsFor(controlLotId)
    updateRow(level, {
      controlLotId,
      controlMean: stat?.mean == null ? '' : String(stat.mean),
      controlSd: stat?.sd == null ? '' : String(stat.sd),
    })
  }

  async function save(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await api('/api/lot-verification/parallel', {
        method: 'POST',
        body: JSON.stringify({
          verificationId: v.id,
          rows: rows.map((row) => ({
            level: row.level,
            controlLotId: row.controlLotId || null,
            controlLabel: `Control level ${row.level}`,
            controlMean: asNullableNumber(row.controlMean),
            controlSd: asNullableNumber(row.controlSd),
            oldRun1: asNullableNumber(row.oldRun1),
            oldRun2: asNullableNumber(row.oldRun2),
            newRun1: asNullableNumber(row.newRun1),
            newRun2: asNullableNumber(row.newRun2),
          })),
        }),
      })
      onSaved()
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'บันทึก Parallel ไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  const summary = v.parallelSummary
  return (
    <div className="mt-3 space-y-3">
      <div className="rounded-md border border-[#d7e6e7] bg-[#f8fbfb] p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h4 className="font-semibold text-[#173d50]">Parallel comparison · {v.parallelAnalyteCode ?? 'ยังไม่เลือก analyte'}</h4>
            <p className="text-[11px] text-[#789097]">กรอกผลเดิม/ผลใหม่เป็น {unit ?? 'ค่าผลตรวจ'}; {scale === 'log10' ? 'ระบบจะแปลงเป็น log10 ก่อนคำนวณ' : 'ระบบคำนวณในสเกล linear'}</p>
          </div>
          {summary ? <StatusBadge tone={summary.passed === true ? 'accepted' : summary.passed === false ? 'rejected' : 'warning'} label={summary.passed === true ? 'ผ่าน' : summary.passed === false ? 'ไม่ผ่าน' : parallelReasonLabel(summary.reason)} /> : null}
        </div>

        {summary ? (
          <div className="mt-3 grid gap-2 text-xs sm:grid-cols-3 lg:grid-cols-6">
            <div><span className="text-[#789097]">Xc</span><strong className="mono ml-2">{displayParallelNumber(summary.currentMean)}</strong></div>
            <div><span className="text-[#789097]">Xn</span><strong className="mono ml-2">{displayParallelNumber(summary.newMean)}</strong></div>
            <div><span className="text-[#789097]">Xb</span><strong className="mono ml-2">{displayParallelNumber(summary.allSampleMean)}</strong></div>
            <div><span className="text-[#789097]">CV</span><strong className="mono ml-2">{summary.selectedCvPercent == null ? '—' : `${summary.selectedCvPercent.toFixed(2)}%`}</strong></div>
            <div><span className="text-[#789097]">Level ที่เลือก</span><strong className="mono ml-2">{summary.selectedLevel ?? '—'}</strong></div>
            <div><span className="text-[#789097]">ABS(Index)</span><strong className="mono ml-2">{displayParallelNumber(summary.index)}</strong></div>
          </div>
        ) : null}

        <div className="mt-3 overflow-x-auto rounded-md border border-[#e3ebec] bg-white">
          <table className="w-full min-w-[980px] text-left text-xs">
            <thead className="bg-[#f6fafa] text-[#55727c]"><tr>
              <th className="px-2 py-1.5">Level</th><th className="px-2 py-1.5">Control lot</th><th className="px-2 py-1.5">Mean ({scale})</th><th className="px-2 py-1.5">SD ({scale})</th>
              <th className="px-2 py-1.5">เดิม 1</th><th className="px-2 py-1.5">เดิม 2</th><th className="px-2 py-1.5">ใหม่ 1</th><th className="px-2 py-1.5">ใหม่ 2</th>
              <th className="px-2 py-1.5">Mean เดิม</th><th className="px-2 py-1.5">Mean ใหม่</th><th className="px-2 py-1.5">CV</th>
            </tr></thead>
            <tbody className="divide-y divide-[#eef3f3]">
              {rows.map((row) => {
                const calculated = v.parallelRows.find((item) => item.level === row.level)
                const stat = statsFor(row.controlLotId)
                const baselineRequired = vlQuantitative && Boolean(row.controlLotId) && (!stat || stat.mean == null || stat.sd == null)
                return <tr key={row.level}>
                  <td className="px-2 py-1.5 font-semibold text-[#3f6470]">{row.level}</td>
                   <td className="px-2 py-1.5"><Select disabled={!editable || busy} value={row.controlLotId} onChange={(event) => selectControl(row.level, event.target.value)}><option value="">{vlQuantitative ? 'เลือก Control lot ที่มี baseline' : 'Manual / ไม่ระบุ'}</option>{parallelControlLots.map((lot) => <option key={lot.id} value={lot.id}>{lot.label}</option>)}</Select>{row.controlLotId && stat ? <span className="mt-0.5 block text-[10px] text-[#789097]">ใช้ค่า {stat.source === 'baseline' ? 'QC baseline' : stat.source === 'lab' ? 'Lab' : 'Assigned'} จาก IQC{stat.source === 'baseline' ? ' · approved' : ''}</span> : null}{baselineRequired ? <span className="mt-0.5 block text-[10px] font-semibold text-[#b33b46]">ยังไม่มี approved QC baseline ของเครื่องมือนี้</span> : null}</td>
                   <td className="px-2 py-1.5"><Input readOnly={vlQuantitative || (stat?.mean != null && stat?.sd != null)} disabled={!editable || busy || baselineRequired} type="number" step="any" value={row.controlMean} onChange={(event) => updateRow(row.level, { controlMean: event.target.value })} /></td>
                   <td className="px-2 py-1.5"><Input readOnly={vlQuantitative || (stat?.mean != null && stat?.sd != null)} disabled={!editable || busy || baselineRequired} type="number" step="any" value={row.controlSd} onChange={(event) => updateRow(row.level, { controlSd: event.target.value })} /></td>
                  {(['oldRun1', 'oldRun2', 'newRun1', 'newRun2'] as const).map((field) => <td key={field} className="px-2 py-1.5"><Input disabled={!editable || busy} type="number" min={scale === 'log10' ? '0.000001' : undefined} step="any" value={row[field]} onChange={(event) => updateRow(row.level, { [field]: event.target.value })} /></td>)}
                  <td className="mono px-2 py-1.5 tabular-nums">{displayParallelNumber(calculated?.currentMean ?? null)}</td>
                  <td className="mono px-2 py-1.5 tabular-nums">{displayParallelNumber(calculated?.newMean ?? null)}</td>
                  <td className="mono px-2 py-1.5 tabular-nums">{calculated?.cvPercent == null ? '—' : `${calculated.cvPercent.toFixed(2)}%`}</td>
                </tr>
              })}
            </tbody>
          </table>
        </div>
        {editable ? <div className="mt-3 flex flex-wrap items-center gap-2"><Button type="button" disabled={busy} onClick={save}>{busy ? 'กำลังบันทึก…' : 'บันทึกผล Parallel'}</Button><span className="text-[11px] text-[#789097]">ใช้ 2 จาก 3 level ได้; แต่ละฝั่งกรอกผลเพียง 1 ค่าได้ และ level ที่ 3 เว้นว่างได้</span></div> : null}
        {error ? <div className="mt-2"><Notice tone="danger">{error}</Notice></div> : null}
      </div>
    </div>
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
