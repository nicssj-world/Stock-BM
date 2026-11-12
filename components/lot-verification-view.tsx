'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { AlertTriangle, CheckCircle2, ChevronDown, GitCompareArrows, Pencil, Plus, Search, Settings2, Trash2, X } from 'lucide-react'
import type { BmActor } from '@/lib/bm/types'
import type { LotVerification, LotVerifParallelRow, LotVerifStatus, LotVerifWorkspace } from '@/lib/lotverif/types'
import { calculateParallelComparison } from '@/lib/lotverif/compare'
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

const FOLLOW_UP_STATUSES: LotVerifStatus[] = ['draft', 'in-progress', 'passed', 'failed']
const METHOD_LABEL: Record<LotVerification['method'], string> = {
  'parallel-comparison': 'Parallel comparison (เทียบผลเดิม/ใหม่)',
  'qc-acceptance': 'QC acceptance (ประเมินผล QC)',
  'patient-comparison': 'Patient comparison (เทียบตัวอย่างผู้ป่วย)',
}
const METHOD_HELP: Record<LotVerification['method'], string> = {
  'parallel-comparison': 'เลือก Analyte แล้วกรอกผลที่วัดจาก Lot เดิมและ Lot ใหม่ โดยใช้ Control levels ประกอบการคำนวณ ต้องบันทึกอย่างน้อย 2 จาก 3 levels',
  'qc-acceptance': 'บันทึกผลและเกณฑ์ QC ตาม SOP ของห้องปฏิบัติการ วิธีนี้ไม่ใช้ Parallel index',
  'patient-comparison': 'บันทึกผลตัวอย่างผู้ป่วยคู่เดิม/ใหม่และเกณฑ์ตาม SOP ของห้องปฏิบัติการ วิธีนี้ไม่ใช้ Parallel index',
}

function isFollowUpVerification(verification: LotVerification) {
  return FOLLOW_UP_STATUSES.includes(verification.status)
}

function nextActionLabel(verification: LotVerification, isAdmin: boolean) {
  if (verification.status === 'draft') {
    return verification.method === 'parallel-comparison'
      ? 'ขั้นต่อไป: กรอกผล Lot เดิมและ Lot ใหม่อย่างน้อย 2 Control levels แล้วบันทึก'
      : 'ขั้นต่อไป: เพิ่มผลเปรียบเทียบ แล้วบันทึกสรุปผล'
  }
  if (verification.status === 'in-progress' && verification.method === 'parallel-comparison' && verification.parallelSummary?.reason !== 'evaluated') {
    return 'ขั้นต่อไป: ตรวจ Control lot, Mean/SD และกรอกผลให้ครบอย่างน้อย 2 levels แล้วบันทึก'
  }
  if (verification.status === 'in-progress' && verification.method === 'parallel-comparison' && verification.parallelSummary?.passed === false) {
    return 'ผลที่บันทึกยังเกินเกณฑ์ ตรวจทานค่ากับ SOP ก่อนสรุปผล'
  }
  if (verification.status === 'in-progress') return 'ขั้นต่อไป: ตรวจผลที่บันทึก แล้วเลือกผ่านหรือไม่ผ่าน'
  if (verification.status === 'passed') return isAdmin ? 'ขั้นต่อไป: ผู้ดูแลระบบตรวจทานและอนุมัติใช้' : 'รอผู้ดูแลระบบตรวจทานและอนุมัติใช้'
  if (verification.status === 'failed') return 'ตรวจทานผลและข้อมูล แล้วบันทึกผลอีกครั้งหรือปฏิเสธรายการ'
  if (verification.status === 'released') return 'เสร็จสิ้น: อนุมัติใช้แล้ว'
  return 'ปิดรายการแล้ว: ปฏิเสธ verification'
}

export function LotVerificationView({ actor, initialData }: { actor: BmActor; initialData: LotVerifWorkspace }) {
  const router = useRouter()
  const [creating, setCreating] = useState(false)
  const [listFilter, setListFilter] = useState<'follow-up' | 'all'>('follow-up')
  const [search, setSearch] = useState('')
  const [newVerificationId, setNewVerificationId] = useState<string | null>(null)
  const data = initialData
  const refresh = () => router.refresh()
  const firstFollowUpId = data.verifications.find(isFollowUpVerification)?.id
  const normalizedSearch = search.trim().toLocaleLowerCase()
  const visibleVerifications = data.verifications.filter((verification) => {
    if (listFilter === 'follow-up' && !isFollowUpVerification(verification)) return false
    if (!normalizedSearch) return true
    const searchableText = [
      verification.title,
      verification.subjectKind === 'reagent-lot' ? 'Reagent lot' : 'Control lot',
      verification.newLotLabel,
      verification.oldLotLabel,
      verification.instrumentCode,
      verification.instrumentName,
      verification.parallelAnalyteCode,
      verification.performedByName,
      verification.createdByName,
      STATUS_LABEL[verification.status],
      METHOD_LABEL[verification.method],
    ].filter(Boolean).join(' ').toLocaleLowerCase()
    return searchableText.includes(normalizedSearch)
  })
  const visibleIds = new Set(visibleVerifications.map((verification) => verification.id))

  useEffect(() => {
    if (!newVerificationId || !data.verifications.some((verification) => verification.id === newVerificationId)) return
    const createdCard = document.getElementById(`lotverif-card-${newVerificationId}`)
    if (!createdCard) return
    createdCard.scrollIntoView({ behavior: 'smooth', block: 'start' })
    setNewVerificationId(null)
  }, [data.verifications, newVerificationId])

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Monitoring"
        title="Lot-to-lot verification"
        description="สร้างรายการ → บันทึกผล → สรุปผ่าน/ไม่ผ่าน → ผู้ดูแลระบบอนุมัติใช้"
        actions={<Button onClick={() => setCreating((v) => !v)}>{creating ? <X className="size-4" /> : <Plus className="size-4" />} {creating ? 'ปิดฟอร์ม' : 'สร้าง verification'}</Button>}
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="ทั้งหมด" value={data.summary.total} />
        <StatCard label="ต้องติดตาม" value={data.summary.open} tone={data.summary.open ? 'warning' : 'neutral'} />
        <StatCard label="อนุมัติใช้แล้ว" value={data.summary.released} tone="accepted" />
        <StatCard label="ไม่ผ่าน/ปฏิเสธ" value={data.summary.failedOrRejected} tone={data.summary.failedOrRejected ? 'rejected' : 'neutral'} />
      </div>

      {creating ? (
        <CreateForm
          data={data}
          onCancel={() => setCreating(false)}
          onDone={(id) => {
            setNewVerificationId(id)
            setListFilter('follow-up')
            setSearch('')
            setCreating(false)
            refresh()
          }}
        />
      ) : null}

      <section aria-label="รายการ verification" className="space-y-3">
        <div className="flex flex-col gap-3 rounded-lg border border-[#d7e6e7] bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-2" role="group" aria-label="กรองรายการ verification">
            <button
              type="button"
              aria-pressed={listFilter === 'follow-up'}
              onClick={() => setListFilter('follow-up')}
              className={`min-h-10 rounded-md border px-3 text-sm font-semibold transition-colors ${listFilter === 'follow-up' ? 'border-[#176b75] bg-[#e8f4f4] text-[#14545d]' : 'border-[#d7e6e7] bg-white text-[#55727c] hover:bg-[#f6fafa]'}`}
            >
              ต้องติดตาม <span className="mono ml-1">{data.summary.open}</span>
            </button>
            <button
              type="button"
              aria-pressed={listFilter === 'all'}
              onClick={() => setListFilter('all')}
              className={`min-h-10 rounded-md border px-3 text-sm font-semibold transition-colors ${listFilter === 'all' ? 'border-[#176b75] bg-[#e8f4f4] text-[#14545d]' : 'border-[#d7e6e7] bg-white text-[#55727c] hover:bg-[#f6fafa]'}`}
            >
              ทั้งหมด <span className="mono ml-1">{data.summary.total}</span>
            </button>
          </div>
          <label className="relative block w-full sm:max-w-sm">
            <span className="sr-only">ค้นหา Lot, เครื่องมือ หรือหัวข้อ</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#789097]" aria-hidden="true" />
            <Input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="ค้นหา Lot, เครื่องมือ หรือหัวข้อ"
              className="pl-9"
            />
          </label>
        </div>

        {data.verifications.length ? (
          <div className="space-y-3">
            {data.verifications.map((v) => {
              const initialExpanded = v.id === newVerificationId || (listFilter === 'follow-up' && v.id === firstFollowUpId)

              return (
                <div id={`lotverif-card-${v.id}`} key={v.id} hidden={!visibleIds.has(v.id)}>
                  <VerificationCard
                    verification={v}
                    data={data}
                    actor={actor}
                    initialExpanded={initialExpanded}
                    onChanged={refresh}
                  />
                </div>
              )
            })}
            {!visibleVerifications.length ? (
              <Card className="p-6 text-center text-sm text-[#789097]">
                {normalizedSearch
                  ? <>ไม่พบรายการที่ตรงกับ “{search.trim()}”</>
                  : 'ไม่มีรายการที่ต้องติดตามในขณะนี้'}
              </Card>
            ) : null}
          </div>
        ) : (
          <Card className="p-8 text-center text-sm text-[#789097]">ยังไม่มี verification — กด “สร้าง verification” เพื่อเริ่มรายการแรก</Card>
        )}
      </section>
    </div>
  )
}

function CreateForm({ data, onDone, onCancel }: { data: LotVerifWorkspace; onDone: (id: string) => void; onCancel: () => void }) {
  const [subjectKind, setSubjectKind] = useState<'reagent-lot' | 'control-lot'>('reagent-lot')
  const [form, setForm] = useState({ instrumentId: '', title: '', method: 'parallel-comparison' as LotVerification['method'], acceptanceCriteria: '', newLot: '', oldLot: '', parallelAnalyteId: '', parallelLimit: '1' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const isParallel = form.method === 'parallel-comparison'
  const analytes = data.analytes.filter((analyte) => analyte.dataType === 'quantitative' && analyte.instrumentIds.includes(form.instrumentId))
  const lots = (subjectKind === 'reagent-lot' ? data.reagentLots : data.controlLots).filter((lot) => {
    if (!form.instrumentId || !lot.instrumentIds.includes(form.instrumentId)) return false
    return subjectKind === 'reagent-lot' || !form.parallelAnalyteId || lot.analyteIds.includes(form.parallelAnalyteId)
  })
  const oldLots = lots.filter((lot) => lot.id !== form.newLot)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (isParallel && !form.parallelAnalyteId) {
      setError('เลือก Analyte ที่ผูกกับเครื่องมือก่อนสร้าง Parallel comparison')
      return
    }
    if (isParallel && !form.oldLot) {
      setError('เลือก Lot เดิมเพื่อใช้เปรียบเทียบก่อนสร้าง Parallel comparison')
      return
    }
    setBusy(true)
    setError('')
    try {
      const lotFields =
        subjectKind === 'reagent-lot'
          ? { newStockLotId: form.newLot || null, oldStockLotId: form.oldLot || null }
          : { newControlLotId: form.newLot || null, oldControlLotId: form.oldLot || null }
      const result = await api<{ id: string }>('/api/lot-verification/verifications', {
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
      onDone(result.id)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'สร้างไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="p-4">
      <h3 className="flex items-center gap-2 font-bold text-[#173d50]"><GitCompareArrows className="size-4" /> สร้าง verification</h3>
      <p className="mt-1 text-sm text-[#55727c]">กรอกตามลำดับ: เลือกชนิดและเครื่องมือ → เลือกวิธีตาม SOP → เลือก Lot ใหม่/เดิม จากนั้นสร้างรายการเพื่อไปกรอกผล</p>
      <form onSubmit={submit} className="mt-4 space-y-4">
        <section className="rounded-lg border border-[#e3ebec] p-3 sm:p-4" aria-labelledby="lotverif-create-scope">
          <div className="mb-3 flex items-start gap-3">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[#e8f4f4] text-sm font-bold text-[#14545d]">1</span>
            <div>
              <h4 id="lotverif-create-scope" className="font-semibold text-[#173d50]">ระบุ Lot ที่ต้องการตรวจ</h4>
              <p className="text-xs text-[#789097]">เลือกชนิด Lot และเครื่องมือก่อน ระบบจะกรอง Lot ที่ใช้ได้ให้</p>
            </div>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            <Field label="สิ่งที่ตรวจ / Lot type" hint={subjectKind === 'reagent-lot' ? 'เลือก Reagent lot ใหม่จาก Stock' : 'เลือก Control lot ใหม่จาก IQC'}>
              <Select value={subjectKind} onChange={(e) => { setSubjectKind(e.target.value as 'reagent-lot' | 'control-lot'); setForm({ ...form, newLot: '', oldLot: '' }) }}>
                <option value="reagent-lot">Reagent lot (น้ำยาใน Stock)</option>
                <option value="control-lot">Control lot (IQC)</option>
              </Select>
            </Field>
            <Field label="เครื่องมือ / Instrument" hint={data.unlinkedEquipment.length ? `เลือกเพื่อกรอง Analyte และ Lot · ${data.unlinkedEquipment.map((equipment) => equipment.code).join(', ')} ยังไม่ผูก IQC` : 'เลือกเครื่องมือที่จะใช้ตรวจ Lot นี้'}>
              <Select required value={form.instrumentId} onChange={(e) => setForm({ ...form, instrumentId: e.target.value, parallelAnalyteId: '', newLot: '', oldLot: '' })}>
                <option value="">— เลือกเครื่องมือ —</option>
                {data.instruments.map((instrument) => <option key={instrument.id} value={instrument.id}>{instrument.code} · {instrument.name}{instrument.model ? ` · ${instrument.model}` : ''}</option>)}
                {data.unlinkedEquipment.map((equipment) => <option key={`unlinked-${equipment.id}`} value="" disabled>{equipment.code} · {equipment.name} · ยังไม่ผูก IQC</option>)}
              </Select>
            </Field>
          </div>
          <p className="mt-2 text-xs text-[#58747d]">เครื่องมือ Lot Verification ใช้การเชื่อมเดียวกับ IQC · <Link href="/iqc?setup=equipment" className="font-bold text-[#0b7f76] underline">จัดการเครื่องมือ Portal ใน IQC</Link></p>
        </section>

        <section className="rounded-lg border border-[#e3ebec] p-3 sm:p-4" aria-labelledby="lotverif-create-method">
          <div className="mb-3 flex items-start gap-3">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[#e8f4f4] text-sm font-bold text-[#14545d]">2</span>
            <div>
              <h4 id="lotverif-create-method" className="font-semibold text-[#173d50]">เลือกวิธีตรวจตาม SOP</h4>
              <p className="text-xs text-[#789097]">คำอธิบายด้านล่างจะบอกข้อมูลที่ต้องกรอกในขั้นต่อไป</p>
            </div>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            <Field label="วิธีตรวจ / Method">
              <Select value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value as LotVerification['method'], parallelAnalyteId: '', newLot: '', oldLot: '' })}>
            <option value="parallel-comparison">Parallel comparison (เทียบผลเดิม/ใหม่)</option>
                <option value="qc-acceptance">QC acceptance (ประเมินผล QC)</option>
                <option value="patient-comparison">Patient comparison (เทียบตัวอย่างผู้ป่วย)</option>
              </Select>
            </Field>
            <div className="rounded-md bg-[#f6fafa] p-3 text-sm text-[#3f6470]" role="status" aria-live="polite">{METHOD_HELP[form.method]}</div>
          </div>
          {isParallel ? (
            <div className="mt-3 grid gap-3 lg:grid-cols-2">
              <Field label="Analyte / ตัวตรวจ" hint={form.instrumentId && !analytes.length ? 'เครื่องมือนี้ยังไม่มี quantitative analyte ใน active Control plan ให้ผู้ดูแล IQC ตรวจสอบก่อน' : 'Viral load จะคำนวณใน scale log10 อัตโนมัติ'}>
                <Select required disabled={!form.instrumentId} value={form.parallelAnalyteId} onChange={(e) => setForm({ ...form, parallelAnalyteId: e.target.value, newLot: '', oldLot: '' })}>
                  <option value="">{form.instrumentId ? '— เลือก Analyte —' : '— เลือกเครื่องมือก่อน —'}</option>
                  {analytes.map((analyte) => (
                    <option key={analyte.id} value={analyte.id}>{analyte.code} · {analyte.scale}{analyte.unit ? ` · ${analyte.unit}` : ''}</option>
                  ))}
                </Select>
              </Field>
              <Field label="เกณฑ์ ABS(Index)" hint="ค่าเริ่มต้น 1; ตรวจสอบหรือปรับตาม SOP ของ Analyte ก่อนสร้าง">
                <Input required type="number" min="0.000001" step="any" value={form.parallelLimit} onChange={(e) => setForm({ ...form, parallelLimit: e.target.value })} />
              </Field>
            </div>
          ) : null}
        </section>

        <section className="rounded-lg border border-[#e3ebec] p-3 sm:p-4" aria-labelledby="lotverif-create-lots">
          <div className="mb-3 flex items-start gap-3">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[#e8f4f4] text-sm font-bold text-[#14545d]">3</span>
            <div>
              <h4 id="lotverif-create-lots" className="font-semibold text-[#173d50]">เลือก Lot ใหม่และ Lot เดิม</h4>
              <p className="text-xs text-[#789097]">Lot ใหม่คือ Lot ที่กำลังประเมิน; Lot เดิมใช้เป็นตัวเปรียบเทียบ</p>
            </div>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            <Field label={subjectKind === 'reagent-lot' ? 'Reagent lot ใหม่ / New lot' : 'Control lot ใหม่ / New lot'} hint={form.instrumentId && !lots.length ? 'ไม่พบ Lot ที่ตรงกับเครื่องมือและเงื่อนไขที่เลือก' : undefined}>
              <Select required disabled={!form.instrumentId} value={form.newLot} onChange={(e) => setForm({ ...form, newLot: e.target.value, oldLot: '' })}>
                <option value="">{form.instrumentId ? '— เลือก Lot ใหม่ —' : '— เลือกเครื่องมือก่อน —'}</option>
                {lots.map((lot) => <option key={lot.id} value={lot.id}>{lot.label}{lot.subLabel ? ` · ${lot.subLabel}` : ''}</option>)}
              </Select>
            </Field>
            <Field
              label={subjectKind === 'reagent-lot' ? 'Reagent lot เดิม / Comparator' : 'Control lot เดิม / Comparator'}
              hint={isParallel
                ? oldLots.length ? 'จำเป็นสำหรับ Parallel comparison และต้องเป็นคนละ Lot กับรายการใหม่' : 'ไม่พบ Lot เดิมที่เลือกได้ ตรวจสอบว่ามี Lot อื่นสำหรับเครื่องมือนี้'
                : 'เลือกได้เมื่อมี Lot เดิมที่ต้องการใช้เปรียบเทียบ'}
            >
              <Select required={isParallel} disabled={!form.instrumentId} value={form.oldLot} onChange={(e) => setForm({ ...form, oldLot: e.target.value })}>
                <option value="">{!form.instrumentId ? '— เลือกเครื่องมือก่อน —' : isParallel ? '— เลือก Lot เดิม (จำเป็น) —' : '— ไม่ระบุ —'}</option>
                {oldLots.map((lot) => <option key={lot.id} value={lot.id}>{lot.label}{lot.subLabel ? ` · ${lot.subLabel}` : ''}</option>)}
              </Select>
            </Field>
          </div>
        </section>

        <div className="grid gap-3 lg:grid-cols-2">
          <Field label="หัวข้อ / Title (ไม่บังคับ)"><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="เช่น CD4 control lot BM0526L" /></Field>
          {!isParallel ? <Field label="เกณฑ์ยอมรับ / Acceptance criteria ตาม SOP"><Input value={form.acceptanceCriteria} onChange={(e) => setForm({ ...form, acceptanceCriteria: e.target.value })} placeholder="ระบุเกณฑ์ที่ใช้ประเมิน" /></Field> : null}
        </div>
        {error ? <div className="lg:col-span-2"><Notice tone="danger">{error}</Notice></div> : null}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={busy}>{busy ? 'กำลังสร้างรายการ…' : 'สร้างรายการและไปกรอกผล'}</Button>
          <Button type="button" variant="ghost" disabled={busy} onClick={onCancel}>ยกเลิก</Button>
        </div>
      </form>
    </Card>
  )
}

function VerificationCard({ verification: v, data, actor, initialExpanded, onChanged }: { verification: LotVerification; data: LotVerifWorkspace; actor: BmActor; initialExpanded: boolean; onChanged: () => void }) {
  const isAdmin = actor.role === 'Admin'
  const editable = true
  const canChangeStatus = v.status !== 'released' && v.status !== 'rejected'
  const [conclusion, setConclusion] = useState(v.conclusion ?? '')
  const [busy, setBusy] = useState('')
  const [editing, setEditing] = useState(false)
  const [expanded, setExpanded] = useState(initialExpanded)
  const [parallelDraftDirty, setParallelDraftDirty] = useState(false)
  const [editForm, setEditForm] = useState({ instrumentId: v.instrumentId ?? '', title: v.title ?? '', method: v.method, acceptanceCriteria: v.acceptanceCriteria ?? '', parallelAnalyteId: v.parallelAnalyteId ?? '', parallelLimit: String(v.parallelLimit ?? 1) })
  const [actionError, setActionError] = useState('')
  const canPass = v.method !== 'parallel-comparison' || (!parallelDraftDirty && v.parallelSummary?.passed === true)
  const expandActionLabel = expanded ? 'ย่อ' : isFollowUpVerification(v) ? 'ทำต่อ' : 'ดูผล'
  const editAnalytes = data.analytes.filter((analyte) => analyte.dataType === 'quantitative' && analyte.instrumentIds.includes(editForm.instrumentId))

  function toggleExpanded() {
    if (expanded && parallelDraftDirty) {
      setActionError('มีผล Parallel ที่แก้ไขแล้วยังไม่บันทึก กรุณาบันทึกผลก่อนย่อรายการ')
      return
    }
    setActionError('')
    setExpanded((value) => !value)
  }

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
            <h3 className="font-bold text-[#173d50]">{v.title || v.newLotLabel || (v.subjectKind === 'reagent-lot' ? 'Reagent lot' : 'Control lot')}</h3>
            <StatusBadge tone={STATUS_TONE[v.status]} label={STATUS_LABEL[v.status]} />
          </div>
          <p className="mt-0.5 text-xs text-[#789097]">
            {v.subjectKind === 'reagent-lot' ? 'Reagent lot' : 'Control lot'} · {METHOD_LABEL[v.method]}
            {' · '}ใหม่: <span className="font-semibold text-[#3f6470]">{v.newLotLabel ?? '—'}</span>
            {v.oldLotLabel ? <> · เทียบ: {v.oldLotLabel}</> : null}
          </p>
          {v.instrumentId ? <p className="text-[11px] text-[#55727c]"><Settings2 className="mr-1 inline size-3" aria-hidden="true" />เครื่องมือ: <span className="font-semibold">{v.instrumentCode ?? v.instrumentId} · {v.instrumentName ?? '—'}</span></p> : <p className="text-[11px] text-[#a86a2a]">เครื่องมือ: รายการเดิมยังไม่ได้ระบุ</p>}
          {v.parallelAnalyteCode ? <p className="text-[11px] text-[#8ba0a5]">Analyte: {v.parallelAnalyteCode} · scale: {v.parallelScale ?? 'linear'}{v.parallelUnit ? ` · ${v.parallelUnit}` : ''}</p> : null}
          {v.acceptanceCriteria ? <p className="text-[11px] text-[#8ba0a5]">เกณฑ์: {v.acceptanceCriteria}</p> : null}
          <p className="mt-1 text-xs font-semibold text-[#176b75]">{nextActionLabel(v, isAdmin)}</p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-1">
          <p className="mr-1 text-[11px] text-[#8ba0a5]">{formatDate(v.createdAt.slice(0, 10))} · {v.performedByName ?? '—'}</p>
          {editable ? <Button type="button" variant="ghost" className="min-h-8 px-2 py-1" disabled={busy !== '' || parallelDraftDirty} onClick={() => { setExpanded(true); setEditing((value) => !value) }} title="แก้ไข verification" aria-label="แก้ไข verification"><Pencil className="size-3.5" /></Button> : null}
          {isAdmin && editable ? <Button type="button" variant="danger" className="min-h-8 px-2 py-1" disabled={busy !== '' || parallelDraftDirty} onClick={remove} title="ลบ verification" aria-label="ลบ verification"><Trash2 className="size-3.5" /></Button> : null}
          <Button
            type="button"
            variant="ghost"
            className="min-h-8 gap-1 px-2 py-1 text-xs"
            onClick={toggleExpanded}
            aria-expanded={expanded}
            aria-controls={`lotverif-details-${v.id}`}
            aria-label={`${expandActionLabel} ${v.title || v.newLotLabel || 'verification'}`}
          >
            <ChevronDown className={`size-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`} aria-hidden="true" />
            {expandActionLabel}
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
              <Field label="วิธีตรวจตาม SOP / Method"><Select value={editForm.method} onChange={(e) => setEditForm({ ...editForm, method: e.target.value as LotVerification['method'], parallelAnalyteId: '' })}><option value="parallel-comparison">{METHOD_LABEL['parallel-comparison']}</option><option value="qc-acceptance">{METHOD_LABEL['qc-acceptance']}</option><option value="patient-comparison">{METHOD_LABEL['patient-comparison']}</option></Select></Field>
              <p className="rounded-md bg-white p-2 text-xs text-[#55727c] sm:col-span-3">{METHOD_HELP[editForm.method]}</p>
              {editForm.method === 'parallel-comparison' ? <>
                <Field label="Analyte / ตัวตรวจ"><Select required disabled={!editForm.instrumentId} value={editForm.parallelAnalyteId} onChange={(e) => setEditForm({ ...editForm, parallelAnalyteId: e.target.value })}><option value="">{editForm.instrumentId ? '— เลือก —' : '— เลือกเครื่องมือก่อน —'}</option>{editAnalytes.map((analyte) => <option key={analyte.id} value={analyte.id}>{analyte.code} · {analyte.scale}{analyte.unit ? ` · ${analyte.unit}` : ''}</option>)}</Select></Field>
                <Field label="เกณฑ์ ABS(Index)"><Input required type="number" min="0.000001" step="any" value={editForm.parallelLimit} onChange={(e) => setEditForm({ ...editForm, parallelLimit: e.target.value })} /></Field>
              </> : null}
              <Field label={editForm.method === 'parallel-comparison' ? 'รายละเอียดเกณฑ์' : 'เกณฑ์ยอมรับ / Acceptance criteria'}><Input value={editForm.acceptanceCriteria} onChange={(e) => setEditForm({ ...editForm, acceptanceCriteria: e.target.value })} /></Field>
              <div className="flex items-center gap-2 sm:col-span-3"><Button disabled={busy !== ''}>{busy === 'edit' ? 'กำลังบันทึก…' : 'บันทึกการแก้ไข'}</Button><Button type="button" variant="ghost" disabled={busy !== ''} onClick={() => setEditing(false)}><X className="size-3.5" /> ยกเลิก</Button></div>
            </form>
          ) : null}
          {actionError ? <div className="mt-3"><Notice tone="danger">{actionError}</Notice></div> : null}

          {v.method === 'parallel-comparison' ? (
            <ParallelComparisonPanel
              key={`${v.id}-${v.updatedAt}`}
              verification={v}
              data={data}
              editable={editable}
              onDirtyChange={setParallelDraftDirty}
              onSaved={onChanged}
            />
          ) : (
            <>
              <div className="mt-3 rounded-md border border-[#e3ebec] bg-[#f8fbfb] p-3">
                <h4 className="font-semibold text-[#173d50]">ขั้นตอน 2: บันทึกผลเปรียบเทียบ</h4>
                <p className="text-xs text-[#789097]">เพิ่มผลของแต่ละตัวอย่างตามวิธีตรวจที่เลือก แล้วตรวจค่าที่คำนวณในตาราง</p>
              </div>
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
                <div>
                  <h4 className="font-semibold text-[#173d50]">ขั้นตอน 3: สรุปผลและส่งอนุมัติ</h4>
                  <p className="text-xs text-[#789097]">บันทึกผลผ่านหรือไม่ผ่านก่อน; รายการที่ผ่านจะรอ Admin อนุมัติใช้</p>
                </div>
                <Field label="สรุปผล / Conclusion"><Textarea rows={2} value={conclusion} onChange={(e) => setConclusion(e.target.value)} /></Field>
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" disabled={busy !== '' || !canPass} onClick={() => setStatus('passed')}>ผ่าน</Button>
                  <Button variant="danger" disabled={busy !== '' || parallelDraftDirty} onClick={() => setStatus('failed')}>ไม่ผ่าน</Button>
                  {isAdmin && v.status === 'passed' ? <Button disabled={busy !== '' || parallelDraftDirty} onClick={() => setStatus('released')}>อนุมัติใช้ / Release</Button> : null}
                  {isAdmin && (v.status === 'failed' || v.status === 'passed') ? <Button variant="danger" disabled={busy !== '' || parallelDraftDirty} onClick={() => setStatus('rejected')}>ปฏิเสธ</Button> : null}
                </div>
                {parallelDraftDirty ? <Notice tone="warning">มีผลที่แก้ไขแล้วยังไม่บันทึก กรุณากด “บันทึกผล Parallel” ก่อนสรุปสถานะ</Notice> : null}
                {v.method === 'parallel-comparison' && !canPass && !parallelDraftDirty ? <p className="text-[11px] text-[#a86a2a]">ต้องมีข้อมูล Parallel ครบอย่างน้อย 2 levels และผลต้องอยู่ในเกณฑ์ก่อนกด “ผ่าน”</p> : null}
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

function parallelDraftSignature(rows: ParallelDraft[]) {
  const normalizedNumber = (value: string) => {
    const trimmed = value.trim()
    if (!trimmed) return ''
    const numeric = Number(trimmed)
    return Number.isFinite(numeric) ? String(numeric) : trimmed
  }
  return JSON.stringify(rows.map((row) => [
    row.level,
    row.controlLotId,
    normalizedNumber(row.controlMean),
    normalizedNumber(row.controlSd),
    normalizedNumber(row.oldRun1),
    normalizedNumber(row.oldRun2),
    normalizedNumber(row.newRun1),
    normalizedNumber(row.newRun2),
  ]))
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
  onDirtyChange,
  onSaved,
}: {
  verification: LotVerification
  data: LotVerifWorkspace
  editable: boolean
  onDirtyChange: (dirty: boolean) => void
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
  const savedRows = [1, 2, 3].map((level) => parallelDraftFromRow(v.parallelRows.find((row) => row.level === level), level))
  const hasUnsavedChanges = parallelDraftSignature(rows) !== parallelDraftSignature(savedRows)
  const draftSummary = calculateParallelComparison({
    scale,
    limit: v.parallelLimit ?? 1,
    rows: rows.map((row) => ({
      level: row.level,
      controlMean: asNullableNumber(row.controlMean),
      controlSd: asNullableNumber(row.controlSd),
      oldRun1: asNullableNumber(row.oldRun1),
      oldRun2: asNullableNumber(row.oldRun2),
      newRun1: asNullableNumber(row.newRun1),
      newRun2: asNullableNumber(row.newRun2),
    })),
  })

  useEffect(() => {
    onDirtyChange(hasUnsavedChanges)
  }, [hasUnsavedChanges, onDirtyChange])

  function updateRow(level: number, patch: Partial<ParallelDraft>) {
    const nextRows = rows.map((row) => row.level === level ? { ...row, ...patch } : row)
    setRows(nextRows)
    onDirtyChange(parallelDraftSignature(nextRows) !== parallelDraftSignature(savedRows))
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

  function controlLotField(row: ParallelDraft) {
    const stat = statsFor(row.controlLotId)
    const baselineRequired = vlQuantitative && Boolean(row.controlLotId) && (!stat || stat.mean == null || stat.sd == null)
    return (
      <div>
        <Select disabled={!editable || busy} value={row.controlLotId} onChange={(event) => selectControl(row.level, event.target.value)}>
          <option value="">{vlQuantitative ? 'เลือก Control lot ที่มี baseline' : 'เลือก Control lot หรือกรอก Mean/SD เอง'}</option>
          {parallelControlLots.map((lot) => <option key={lot.id} value={lot.id}>{lot.label}</option>)}
        </Select>
        {row.controlLotId && stat ? <span className="mt-1 block text-[10px] text-[#789097]">ใช้ค่า {stat.source === 'baseline' ? 'QC baseline' : stat.source === 'lab' ? 'Lab' : 'Assigned'} จาก IQC{stat.source === 'baseline' ? ' · approved' : ''}</span> : null}
        {!vlQuantitative && (!stat || stat.mean == null || stat.sd == null) ? <span className="mt-1 block text-[10px] text-[#789097]">กรอก Mean และ SD ตาม SOP หากไม่มีค่าครบจาก IQC</span> : null}
        {baselineRequired ? <span className="mt-1 block text-[10px] font-semibold text-[#b33b46]">ยังไม่มี approved QC baseline ของเครื่องมือนี้</span> : null}
      </div>
    )
  }

  function controlStatInput(row: ParallelDraft, field: 'controlMean' | 'controlSd', label: string, showLabel = true) {
    const stat = statsFor(row.controlLotId)
    const baselineRequired = vlQuantitative && Boolean(row.controlLotId) && (!stat || stat.mean == null || stat.sd == null)
    const input = (
      <Input
        readOnly={vlQuantitative || (stat?.mean != null && stat?.sd != null)}
        disabled={!editable || busy || baselineRequired}
        type="number"
        step="any"
        value={row[field]}
        onChange={(event) => updateRow(row.level, { [field]: event.target.value })}
      />
    )
    return showLabel ? <Field label={label}>{input}</Field> : input
  }

  function runInput(row: ParallelDraft, field: 'oldRun1' | 'oldRun2' | 'newRun1' | 'newRun2', label: string, showLabel = true) {
    const input = (
      <Input
        disabled={!editable || busy}
        type="number"
        min={scale === 'log10' ? '0.000001' : undefined}
        step="any"
        value={row[field]}
        onChange={(event) => updateRow(row.level, { [field]: event.target.value })}
      />
    )
    return showLabel ? <Field label={label}>{input}</Field> : input
  }

  function levelResult(row: ParallelDraft) {
    return draftSummary.levels.find((result) => result.level === row.level)
  }

  const draftStatusTone = hasUnsavedChanges
    ? 'warning'
    : draftSummary.passed === true
      ? 'accepted'
      : draftSummary.passed === false
        ? 'rejected'
        : 'warning'
  const draftStatusLabel = hasUnsavedChanges
    ? `ร่าง: ${draftSummary.passed === true ? 'ผลเบื้องต้นผ่าน' : draftSummary.passed === false ? 'ผลเบื้องต้นไม่ผ่าน' : parallelReasonLabel(draftSummary.reason)}`
    : draftSummary.passed === true
      ? 'ผ่าน'
      : draftSummary.passed === false
        ? 'ไม่ผ่าน'
        : parallelReasonLabel(draftSummary.reason)

  return (
    <div className="mt-3 space-y-3">
      <div className="rounded-md border border-[#d7e6e7] bg-[#f8fbfb] p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h4 className="font-semibold text-[#173d50]">ขั้นตอน 2: กรอกผล Parallel · {v.parallelAnalyteCode ?? 'ยังไม่เลือก analyte'}</h4>
            <p className="text-xs text-[#55727c]">แต่ละ Control level ให้กรอกผล Lot เดิมและ Lot ใหม่อย่างน้อยฝั่งละ 1 ค่า ทำอย่างน้อย 2 จาก 3 levels แล้วกดบันทึก</p>
            <p className="text-[11px] text-[#789097]">กรอกเป็น {unit ?? 'ค่าผลตรวจ'}; {scale === 'log10' ? 'ระบบจะแปลงเป็น log10 ก่อนคำนวณ' : 'ระบบคำนวณในสเกล linear'}</p>
          </div>
          <StatusBadge tone={draftStatusTone} label={draftStatusLabel} />
        </div>

        <div className="mt-3 grid gap-2 text-xs sm:grid-cols-3 lg:grid-cols-6">
          <div><span className="text-[#789097]">Mean Lot เดิม (Xc)</span><strong className="mono ml-2">{displayParallelNumber(draftSummary.currentMean)}</strong></div>
          <div><span className="text-[#789097]">Mean Lot ใหม่ (Xn)</span><strong className="mono ml-2">{displayParallelNumber(draftSummary.newMean)}</strong></div>
          <div><span className="text-[#789097]">Mean รวม (Xb)</span><strong className="mono ml-2">{displayParallelNumber(draftSummary.allSampleMean)}</strong></div>
          <div><span className="text-[#789097]">CV</span><strong className="mono ml-2">{draftSummary.selectedCvPercent == null ? '—' : `${draftSummary.selectedCvPercent.toFixed(2)}%`}</strong></div>
          <div><span className="text-[#789097]">Level ที่ใช้คำนวณ</span><strong className="mono ml-2">{draftSummary.selectedLevel ?? '—'}</strong></div>
          <div><span className="text-[#789097]">ABS(Index) / เกณฑ์</span><strong className="mono ml-2">{displayParallelNumber(draftSummary.index)} / {v.parallelLimit ?? 1}</strong></div>
        </div>
        <p className={`mt-2 text-xs ${hasUnsavedChanges ? 'font-semibold text-[#9a6b16]' : 'text-[#789097]'}`} aria-live="polite">
          {hasUnsavedChanges ? 'ผลคำนวณนี้ใช้ค่าที่กำลังกรอก แต่ยังไม่บันทึก ต้องบันทึกก่อนเลือกผ่าน/ไม่ผ่าน' : 'ผลคำนวณจากข้อมูลที่บันทึกแล้ว'}
        </p>

        <div className="mt-3 hidden overflow-x-auto rounded-md border border-[#e3ebec] bg-white md:block">
          <table className="w-full min-w-[980px] text-left text-xs">
            <thead className="bg-[#f6fafa] text-[#55727c]"><tr>
              <th className="px-2 py-1.5">Level</th><th className="px-2 py-1.5">Control lot / material</th><th className="px-2 py-1.5">Mean ({scale})</th><th className="px-2 py-1.5">SD ({scale})</th>
              <th className="px-2 py-1.5">Lot เดิม 1</th><th className="px-2 py-1.5">Lot เดิม 2</th><th className="px-2 py-1.5">Lot ใหม่ 1</th><th className="px-2 py-1.5">Lot ใหม่ 2</th>
              <th className="px-2 py-1.5">Mean เดิม</th><th className="px-2 py-1.5">Mean ใหม่</th><th className="px-2 py-1.5">CV</th>
            </tr></thead>
            <tbody className="divide-y divide-[#eef3f3]">
              {rows.map((row) => {
                const calculated = levelResult(row)
                return <tr key={row.level}>
                  <td className="px-2 py-1.5 font-semibold text-[#3f6470]">{row.level}</td>
                  <td className="px-2 py-1.5">{controlLotField(row)}</td>
                  <td className="px-2 py-1.5">{controlStatInput(row, 'controlMean', `Mean (${scale})`, false)}</td>
                  <td className="px-2 py-1.5">{controlStatInput(row, 'controlSd', `SD (${scale})`, false)}</td>
                  {(['oldRun1', 'oldRun2', 'newRun1', 'newRun2'] as const).map((field) => <td key={field} className="px-2 py-1.5">{runInput(row, field, field.endsWith('1') ? 'ผล 1' : 'ผล 2', false)}</td>)}
                  <td className="mono px-2 py-1.5 tabular-nums">{displayParallelNumber(calculated?.currentMean ?? null)}</td>
                  <td className="mono px-2 py-1.5 tabular-nums">{displayParallelNumber(calculated?.newMean ?? null)}</td>
                  <td className="mono px-2 py-1.5 tabular-nums">{calculated?.cvPercent == null ? '—' : `${calculated.cvPercent.toFixed(2)}%`}</td>
                </tr>
              })}
            </tbody>
          </table>
        </div>

        <div className="mt-3 space-y-3 md:hidden">
          {rows.map((row) => {
            const calculated = levelResult(row)
            return (
              <section key={row.level} className="rounded-md border border-[#e3ebec] bg-white p-3" aria-labelledby={`parallel-level-${v.id}-${row.level}`}>
                <h5 id={`parallel-level-${v.id}-${row.level}`} className="font-semibold text-[#173d50]">Control level {row.level}</h5>
                <div className="mt-3 space-y-3">
                  <Field label="Control lot / material">{controlLotField(row)}</Field>
                  <div className="grid grid-cols-2 gap-2">
                    {controlStatInput(row, 'controlMean', `Mean (${scale})`)}
                    {controlStatInput(row, 'controlSd', `SD (${scale})`)}
                  </div>
                  <div className="rounded-md bg-[#f8fbfb] p-2">
                    <p className="mb-2 text-xs font-semibold text-[#55727c]">ผลที่วัดจาก Lot เดิม</p>
                    <div className="grid grid-cols-2 gap-2">
                      {runInput(row, 'oldRun1', 'ครั้งที่ 1')}
                      {runInput(row, 'oldRun2', 'ครั้งที่ 2')}
                    </div>
                  </div>
                  <div className="rounded-md bg-[#f8fbfb] p-2">
                    <p className="mb-2 text-xs font-semibold text-[#55727c]">ผลที่วัดจาก Lot ใหม่</p>
                    <div className="grid grid-cols-2 gap-2">
                      {runInput(row, 'newRun1', 'ครั้งที่ 1')}
                      {runInput(row, 'newRun2', 'ครั้งที่ 2')}
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 border-t border-[#eef3f3] pt-2 text-xs">
                    <div><span className="block text-[#789097]">Mean เดิม</span><strong className="mono">{displayParallelNumber(calculated?.currentMean ?? null)}</strong></div>
                    <div><span className="block text-[#789097]">Mean ใหม่</span><strong className="mono">{displayParallelNumber(calculated?.newMean ?? null)}</strong></div>
                    <div><span className="block text-[#789097]">CV</span><strong className="mono">{calculated?.cvPercent == null ? '—' : `${calculated.cvPercent.toFixed(2)}%`}</strong></div>
                  </div>
                </div>
              </section>
            )
          })}
        </div>

        {editable ? <div className="mt-3 flex flex-wrap items-center gap-2"><Button type="button" disabled={busy} onClick={save}>{busy ? 'กำลังบันทึก…' : 'บันทึกผล Parallel'}</Button><span className="text-xs text-[#789097]">ระบบคำนวณผลจากค่าที่กรอก และใช้ผลที่บันทึกแล้วสำหรับสรุปสถานะ</span></div> : null}
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
