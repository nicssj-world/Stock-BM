'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, ClipboardPaste, FlaskConical, Plus, Printer, Trash2 } from 'lucide-react'
import type { BmActor } from '@/lib/bm/types'
import type { CompareScale } from '@/lib/instcomp/compare'
import { evaluateStudy, SECTION_LABEL, type StudyEvaluation } from '@/lib/methodverif/evaluate'
import { parseGrid, type Verdict } from '@/lib/methodverif/stats'
import {
  METHODVERIF_SECTIONS,
  type LinearityData,
  type LodData,
  type MethodVerifSection,
  type MethodVerifStatus,
  type MethodVerifStudy,
  type MethodVerifWorkspace,
  type PrecisionData,
} from '@/lib/methodverif/types'
import { formatDate } from '@/lib/bm/rules'
import { api, Button, Card, Field, Input, Notice, PageHeader, Select, StatCard, StatusBadge, type StatusTone, Textarea } from '@/components/ui'
import { AttachmentList } from '@/components/attachments'

const STATUS_TONE: Record<MethodVerifStatus, StatusTone> = {
  draft: 'neutral',
  'in-progress': 'warning',
  passed: 'accepted',
  failed: 'rejected',
  approved: 'accepted',
  rejected: 'rejected',
}
const STATUS_LABEL: Record<MethodVerifStatus, string> = {
  draft: 'ร่าง',
  'in-progress': 'กำลังเก็บข้อมูล',
  passed: 'ผ่านเกณฑ์',
  failed: 'ไม่ผ่านเกณฑ์',
  approved: 'อนุมัติแล้ว',
  rejected: 'ไม่อนุมัติ',
}
const VERDICT: Record<Verdict, { tone: StatusTone; label: string }> = {
  passed: { tone: 'accepted', label: 'ผ่าน' },
  failed: { tone: 'rejected', label: 'ไม่ผ่าน' },
  insufficient: { tone: 'not_evaluated', label: 'ข้อมูลยังไม่พอ' },
}

const SECTION_SHORT: Record<MethodVerifSection, string> = { precision: 'Precision', lod: 'LoD', linearity: 'Linearity', comparison: 'Comparison' }

function fmt(value: number | null | undefined, digits = 3) {
  return value == null || !Number.isFinite(value) ? '—' : value.toFixed(digits)
}

function numberOrNull(text: string) {
  const value = Number(text.replace(/,/g, '').trim())
  return text.trim() && Number.isFinite(value) ? value : null
}

export function MethodVerificationView({ actor, initialData }: { actor: BmActor; initialData: MethodVerifWorkspace }) {
  const router = useRouter()
  const data = initialData
  const isAdmin = actor.role === 'Admin'
  const [openId, setOpenId] = useState<string | null>(data.studies[0]?.id ?? null)
  const [showCreate, setShowCreate] = useState(data.studies.length === 0)
  const [message, setMessage] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null)

  const counts = useMemo(() => ({
    total: data.studies.length,
    open: data.studies.filter((study) => study.status === 'draft' || study.status === 'in-progress' || study.status === 'passed').length,
    approved: data.studies.filter((study) => study.status === 'approved').length,
    failed: data.studies.filter((study) => study.status === 'failed' || study.status === 'rejected').length,
  }), [data.studies])

  function done(text: string, id?: string) {
    setMessage({ tone: 'success', text })
    if (id) setOpenId(id)
    router.refresh()
  }
  function failed(error: unknown) {
    setMessage({ tone: 'danger', text: error instanceof Error ? error.message : 'บันทึกไม่สำเร็จ' })
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Quality · ISO 15189 7.3.2"
        title="Method verification"
        description="ทวนสอบวิธีตรวจก่อนใช้งานจริง ต่อการทดสอบ × เครื่อง: Precision (EP15), LoD (EP17), Linearity (EP06) และ Method comparison (EP09)"
        actions={<Button onClick={() => setShowCreate((value) => !value)}><Plus className="size-4" /> สร้างรายการใหม่</Button>}
      />

      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="ทั้งหมด" value={counts.total} />
        <StatCard label="กำลังดำเนินการ" value={counts.open} tone={counts.open ? 'warning' : 'neutral'} />
        <StatCard label="อนุมัติแล้ว" value={counts.approved} tone="accepted" />
        <StatCard label="ไม่ผ่าน / ไม่อนุมัติ" value={counts.failed} tone={counts.failed ? 'rejected' : 'neutral'} />
      </div>

      {showCreate ? <CreateForm data={data} onCreated={(id) => { setShowCreate(false); done('สร้างรายการแล้ว — กรอกผลแต่ละหัวข้อได้เลย', id) }} onError={failed} /> : null}

      {data.studies.length === 0 && !showCreate ? <Card className="p-8 text-center text-sm text-[#8198a0]">ยังไม่มีรายการ Method verification</Card> : null}

      <div className="space-y-3">
        {data.studies.map((study) => (
          <StudyCard
            key={`${study.id}:${study.updatedAt}`}
            study={study}
            data={data}
            open={openId === study.id}
            isAdmin={isAdmin}
            onToggle={() => setOpenId((current) => (current === study.id ? null : study.id))}
            onDone={done}
            onError={failed}
          />
        ))}
      </div>
    </div>
  )
}

function CreateForm({ data, onCreated, onError }: { data: MethodVerifWorkspace; onCreated: (id: string) => void; onError: (error: unknown) => void }) {
  const [busy, setBusy] = useState(false)
  const [analyteId, setAnalyteId] = useState('')
  const [testName, setTestName] = useState('')
  const [title, setTitle] = useState('')
  const [instrumentId, setInstrumentId] = useState('')
  const [scale, setScale] = useState<CompareScale>('log10')
  const [unit, setUnit] = useState('')
  const [startedOn, setStartedOn] = useState('')
  const [sections, setSections] = useState<MethodVerifSection[]>([...METHODVERIF_SECTIONS])

  function pickAnalyte(id: string) {
    setAnalyteId(id)
    const analyte = data.analytes.find((item) => item.id === id)
    if (!analyte) return
    setTestName(analyte.code.replace(/\s*\((HPC|LPC|Normal)\)\s*/i, '').trim())
    setScale(analyte.scale)
    setUnit(analyte.unit ?? '')
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    try {
      const instrument = data.instruments.find((item) => item.id === instrumentId)
      const result = await api<{ id: string }>('/api/method-verification/studies', {
        method: 'POST',
        body: JSON.stringify({
          title: title.trim() || `${testName} · ${instrument?.code ?? ''}`,
          testName,
          analyteId: analyteId || null,
          instrumentId,
          scale,
          unit: unit || null,
          requiredSections: sections,
          startedOn: startedOn || null,
        }),
      })
      onCreated(result.id)
    } catch (error) {
      onError(error)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="p-5">
      <form onSubmit={submit} className="space-y-4">
        <h2 className="text-base font-bold text-[#173d50]">สร้างรายการ Method verification</h2>
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="Analyte ในระบบ IQC (ไม่บังคับ)">
            <Select value={analyteId} onChange={(event) => pickAnalyte(event.target.value)}>
              <option value="">— ไม่ผูก —</option>
              {data.analytes.map((item) => <option key={item.id} value={item.id}>{item.code}</option>)}
            </Select>
          </Field>
          <Field label="ชื่อการทดสอบ"><Input required value={testName} onChange={(event) => setTestName(event.target.value)} placeholder="เช่น HIV-1 VL" /></Field>
          <Field label="เครื่อง">
            <Select required value={instrumentId} onChange={(event) => setInstrumentId(event.target.value)}>
              <option value="">— เลือกเครื่อง —</option>
              {data.instruments.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}{item.isActive ? '' : ' (ปิดใช้)'}</option>)}
            </Select>
          </Field>
          <Field label="สเกลที่ใช้คำนวณ">
            <Select value={scale} onChange={(event) => setScale(event.target.value as CompareScale)}>
              <option value="log10">log10 (viral load) — claim เป็น SD log</option>
              <option value="linear">linear — claim เป็น CV%</option>
            </Select>
          </Field>
          <Field label="หน่วย"><Input value={unit} onChange={(event) => setUnit(event.target.value)} placeholder="cp/mL, IU/mL" /></Field>
          <Field label="วันที่เริ่มทวนสอบ"><Input type="date" value={startedOn} onChange={(event) => setStartedOn(event.target.value)} /></Field>
          <Field label="ชื่อรายการ (ไม่บังคับ)"><Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="สร้างให้อัตโนมัติถ้าเว้นว่าง" /></Field>
        </div>
        <fieldset>
          <legend className="mb-1 text-xs font-semibold text-[#58747d]">หัวข้อที่ต้องทวนสอบ</legend>
          <div className="flex flex-wrap gap-3">
            {METHODVERIF_SECTIONS.map((section) => (
              <label key={section} className="flex items-center gap-2 text-sm text-[#315763]">
                <input
                  type="checkbox"
                  className="size-4 accent-[#0b7f76]"
                  checked={sections.includes(section)}
                  onChange={(event) => setSections((current) => event.target.checked ? [...current, section] : current.filter((item) => item !== section))}
                />
                {SECTION_LABEL[section]}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="flex justify-end"><Button type="submit" disabled={busy || !sections.length || !instrumentId}>{busy ? 'กำลังบันทึก…' : 'สร้างรายการ'}</Button></div>
      </form>
    </Card>
  )
}

function StudyCard({ study, data, open, isAdmin, onToggle, onDone, onError }: { study: MethodVerifStudy; data: MethodVerifWorkspace; open: boolean; isAdmin: boolean; onToggle: () => void; onDone: (text: string) => void; onError: (error: unknown) => void }) {
  const evaluation = useMemo(() => evaluateStudy(study), [study])
  const verdict = VERDICT[evaluation.overall]
  return (
    <Card className="overflow-hidden">
      <button type="button" onClick={onToggle} className="flex w-full flex-wrap items-center gap-3 px-5 py-4 text-left hover:bg-[#f7fbfb]" aria-expanded={open}>
        <FlaskConical className="size-5 shrink-0 text-[#0b7f76]" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="font-bold text-[#173d50]">{study.title}</p>
          <p className="text-xs text-[#789097]">
            {study.instrumentLabel} · {study.requiredSections.map((section) => `${SECTION_SHORT[section]} ${evaluation.sections[section].verdict === 'passed' ? '✓' : evaluation.sections[section].verdict === 'failed' ? '✗' : '…'}`).join(' · ')}
            {study.startedOn ? ` · เริ่ม ${formatDate(study.startedOn)}` : ''}
          </p>
        </div>
        <StatusBadge tone={verdict.tone} label={verdict.label} />
        <StatusBadge tone={STATUS_TONE[study.status]} label={STATUS_LABEL[study.status]} />
        <ChevronDown className={`size-4 text-[#789097] transition ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {open ? <StudyDetail study={study} data={data} isAdmin={isAdmin} onDone={onDone} onError={onError} /> : null}
    </Card>
  )
}

function StudyDetail({ study, data, isAdmin, onDone, onError }: { study: MethodVerifStudy; data: MethodVerifWorkspace; isAdmin: boolean; onDone: (text: string) => void; onError: (error: unknown) => void }) {
  const locked = study.status === 'approved'
  const [precision, setPrecision] = useState<PrecisionData>(study.precision)
  const [lod, setLod] = useState<LodData>(study.lod)
  const [linearity, setLinearity] = useState<LinearityData>(study.linearity)
  const [comparisonId, setComparisonId] = useState(study.comparison?.id ?? '')
  const [conclusion, setConclusion] = useState(study.conclusion ?? '')
  const [busy, setBusy] = useState(false)
  const comparison = data.comparisons.find((item) => item.id === comparisonId) ?? null
  const evaluation = useMemo(() => evaluateStudy({ ...study, precision, lod, linearity, comparison }), [study, precision, lod, linearity, comparison])
  const dirty = JSON.stringify({ precision, lod, linearity, comparisonId, conclusion })
    !== JSON.stringify({ precision: study.precision, lod: study.lod, linearity: study.linearity, comparisonId: study.comparison?.id ?? '', conclusion: study.conclusion ?? '' })

  async function patch(body: Record<string, unknown>, text: string) {
    setBusy(true)
    try {
      await api(`/api/method-verification/studies/${study.id}`, { method: 'PATCH', body: JSON.stringify(body) })
      onDone(text)
    } catch (error) {
      onError(error)
    } finally {
      setBusy(false)
    }
  }

  function saveBody() {
    return { precision, lod, linearity, instcompStudyId: comparisonId || null, conclusion }
  }

  async function remove() {
    if (!window.confirm(`ลบรายการ "${study.title}" ใช่หรือไม่`)) return
    setBusy(true)
    try {
      await api(`/api/method-verification/studies/${study.id}`, { method: 'DELETE' })
      onDone('ลบรายการแล้ว')
    } catch (error) {
      onError(error)
    } finally {
      setBusy(false)
    }
  }

  const required = new Set(study.requiredSections)

  return (
    <div className="space-y-5 border-t border-[#e1ebec] px-5 py-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1 text-xs text-[#58747d]">
          <p><span className="font-semibold text-[#315763]">การทดสอบ:</span> {study.testName}{study.unit ? ` (${study.unit})` : ''} · สเกล {study.scale === 'log10' ? 'log10 (claim = SD log)' : 'linear (claim = CV%)'}</p>
          <p><span className="font-semibold text-[#315763]">ผู้สร้าง:</span> {study.createdByName ?? '—'}{study.approvedByName ? ` · อนุมัติโดย ${study.approvedByName}` : ''}</p>
        </div>
        <Link href={`/method-verification/report/${study.id}`} className="inline-flex min-h-11 items-center gap-2 rounded-md border border-[#c9dadd] bg-white px-3.5 py-2 text-sm font-semibold text-[#244854] hover:bg-[#f7fbfb]">
          <Printer className="size-4" aria-hidden="true" /> รายงานพิมพ์
        </Link>
      </div>

      <SummaryStrip evaluation={evaluation} required={study.requiredSections} />

      {required.has('precision') ? <PrecisionEditor value={precision} onChange={setPrecision} scale={study.scale} locked={locked} evaluation={evaluation} /> : null}
      {required.has('lod') ? <LodEditor value={lod} onChange={setLod} unit={study.unit} locked={locked} evaluation={evaluation} /> : null}
      {required.has('linearity') ? <LinearityEditor value={linearity} onChange={setLinearity} scale={study.scale} unit={study.unit} locked={locked} evaluation={evaluation} /> : null}
      {required.has('comparison') ? (
        <Section title={SECTION_LABEL.comparison} verdict={evaluation.sections.comparison.verdict} reasons={evaluation.sections.comparison.reasons}>
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-72 flex-1">
              <Field label="รายการ Method comparison ที่ใช้เป็นหลักฐาน">
                <Select disabled={locked} value={comparisonId} onChange={(event) => setComparisonId(event.target.value)}>
                  <option value="">— เลือกรายการ —</option>
                  {data.comparisons.map((item) => <option key={item.id} value={item.id}>{item.title} · {STATUS_LABEL[item.status as MethodVerifStatus] ?? item.status}</option>)}
                </Select>
              </Field>
            </div>
            <Link href="/instrument-comparison" className="text-sm font-semibold text-[#0b7f76] hover:underline">เปิด Method comparison</Link>
          </div>
          {!data.comparisons.length ? <p className="text-xs text-[#789097]">ยังไม่มีรายการ Method comparison — สร้างที่เมนู Method comparison ก่อน แล้วกลับมาเลือก</p> : null}
        </Section>
      ) : null}

      <div className="space-y-2">
        <Field label="สรุปผล / ความเห็น">
          <Textarea rows={3} disabled={locked} value={conclusion} onChange={(event) => setConclusion(event.target.value)} placeholder="เช่น ผลทวนสอบทุกหัวข้ออยู่ในเกณฑ์ที่ผู้ผลิตอ้าง ใช้รายงานผลผู้ป่วยได้" />
        </Field>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {!locked ? <Button type="button" disabled={busy || !dirty} onClick={() => patch(saveBody(), 'บันทึกแล้ว')}>{dirty ? 'บันทึก' : 'บันทึกแล้ว'}</Button> : null}
          {!locked && dirty ? <span className="text-xs text-[#a9700f]">บันทึกก่อนเปลี่ยนสถานะ</span> : null}
          {!locked && !dirty ? (
            <>
              <Button type="button" variant="danger" disabled={busy} onClick={() => patch({ status: 'failed' }, 'บันทึกว่าไม่ผ่านเกณฑ์แล้ว')}>ไม่ผ่านเกณฑ์</Button>
              <Button type="button" disabled={busy || evaluation.overall !== 'passed'} onClick={() => patch({ status: 'passed' }, 'บันทึกว่าผ่านเกณฑ์แล้ว')}>ผ่านเกณฑ์</Button>
            </>
          ) : null}
          {isAdmin && study.status === 'passed' && !dirty ? <Button type="button" disabled={busy} onClick={() => patch({ status: 'approved' }, 'อนุมัติแล้ว')}>อนุมัติ</Button> : null}
          {isAdmin && (study.status === 'passed' || study.status === 'failed') && !dirty ? <Button type="button" variant="danger" disabled={busy} onClick={() => patch({ status: 'rejected' }, 'บันทึกไม่อนุมัติแล้ว')}>ไม่อนุมัติ</Button> : null}
          {isAdmin && (locked || study.status === 'rejected') ? <Button type="button" variant="secondary" disabled={busy} onClick={() => patch({ status: 'in-progress' }, 'เปิดแก้ไขอีกครั้งแล้ว')}>เปิดแก้ไขอีกครั้ง</Button> : null}
        </div>
      </div>

      <AttachmentList module="methodverif" entityType="methodverif-study" entityId={study.id} kind="methodverif-evidence" canDelete={isAdmin && !locked} label="ไฟล์แนบ (ผลจากเครื่อง, package insert / claim ผู้ผลิต, SOP)" />

      {isAdmin && !locked ? (
        <div className="flex justify-end border-t border-[#edf2f2] pt-3">
          <Button type="button" variant="ghost" disabled={busy} onClick={remove}><Trash2 className="size-4" /> ลบรายการ</Button>
        </div>
      ) : null}
    </div>
  )
}

function SummaryStrip({ evaluation, required }: { evaluation: StudyEvaluation; required: MethodVerifSection[] }) {
  return (
    <div className="grid gap-px overflow-hidden rounded-md border border-[#dbe8e9] bg-[#dbe8e9] sm:grid-cols-2 xl:grid-cols-4">
      {required.map((section) => {
        const outcome = VERDICT[evaluation.sections[section].verdict]
        return (
          <div key={section} className="flex items-center justify-between gap-2 bg-white px-3 py-2.5">
            <p className="text-xs font-semibold text-[#315763]">{SECTION_LABEL[section]}</p>
            <StatusBadge tone={outcome.tone} label={outcome.label} />
          </div>
        )
      })}
    </div>
  )
}

function Section({ title, verdict, reasons, children }: { title: string; verdict: Verdict; reasons: string[]; children: React.ReactNode }) {
  const outcome = VERDICT[verdict]
  return (
    <section className="space-y-3 rounded-md border border-[#dfe9ea] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-[#173d50]">{title}</h3>
        <StatusBadge tone={outcome.tone} label={outcome.label} />
      </div>
      {children}
      {reasons.length && verdict !== 'passed' ? <p className={`text-xs ${verdict === 'failed' ? 'text-[#a83541]' : 'text-[#99601b]'}`}>{reasons.join(' · ')}</p> : null}
    </section>
  )
}

function PasteBox({ hint, placeholder, onApply }: { hint: string; placeholder: string; onApply: (rows: string[][]) => void }) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  if (!open) return <Button type="button" variant="secondary" onClick={() => setOpen(true)}><ClipboardPaste className="size-4" /> วางจาก Excel</Button>
  return (
    <div className="w-full space-y-2 rounded-md border border-[#dfe9ea] bg-[#f7fbfb] p-3">
      <p className="text-xs text-[#58747d]">{hint}</p>
      <Textarea rows={5} value={text} onChange={(event) => setText(event.target.value)} placeholder={placeholder} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>ยกเลิก</Button>
        <Button type="button" disabled={!text.trim()} onClick={() => { onApply(parseGrid(text)); setText(''); setOpen(false) }}>ใส่ลงตาราง</Button>
      </div>
    </div>
  )
}

function PrecisionEditor({ value, onChange, scale, locked, evaluation }: { value: PrecisionData; onChange: (next: PrecisionData) => void; scale: CompareScale; locked: boolean; evaluation: StudyEvaluation }) {
  const claimUnit = scale === 'log10' ? 'SD log' : 'CV%'
  const setLevel = (index: number, patch: Partial<PrecisionData['levels'][number]>) => onChange({ ...value, levels: value.levels.map((level, i) => (i === index ? { ...level, ...patch } : level)) })
  const setCell = (index: number, day: number, rep: number, text: string) => {
    const level = value.levels[index]
    const grid = Array.from({ length: value.days }, (_, d) => Array.from({ length: value.replicates }, (_, r) => level.values[d]?.[r] ?? ''))
    grid[day][rep] = text
    setLevel(index, { values: grid })
  }
  return (
    <Section title={SECTION_LABEL.precision} verdict={evaluation.sections.precision.verdict} reasons={evaluation.sections.precision.reasons}>
      <p className="text-xs text-[#789097]">ตรวจ control/ตัวอย่างแต่ละ level วันละ {value.replicates} ซ้ำ ติดต่อกัน {value.days} วัน (EP15-A3 แนะนำ 5 × 5) แล้วเทียบ SD ที่ได้กับ claim ของผู้ผลิตผ่าน upper verification limit</p>
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-28"><Field label="จำนวนวัน"><Input type="number" min={2} max={40} disabled={locked} value={value.days} onChange={(event) => onChange({ ...value, days: Math.max(2, Number(event.target.value) || 2) })} /></Field></div>
        <div className="w-28"><Field label="ซ้ำต่อวัน"><Input type="number" min={2} max={10} disabled={locked} value={value.replicates} onChange={(event) => onChange({ ...value, replicates: Math.max(2, Number(event.target.value) || 2) })} /></Field></div>
        {!locked && value.levels.length < 6 ? <Button type="button" variant="secondary" onClick={() => onChange({ ...value, levels: [...value.levels, { label: `Level ${value.levels.length + 1}`, claimRepeatability: null, claimWithinLab: null, values: [] }] })}><Plus className="size-4" /> เพิ่ม level</Button> : null}
      </div>
      {value.levels.map((level, index) => {
        const result = evaluation.precision[index]
        return (
          <div key={index} className="space-y-2 rounded-md border border-[#edf2f2] p-3">
            <div className="flex flex-wrap items-end gap-3">
              <div className="w-40"><Field label="Level"><Input disabled={locked} value={level.label} onChange={(event) => setLevel(index, { label: event.target.value })} /></Field></div>
              <div className="w-44"><Field label={`Claim repeatability (${claimUnit})`}><Input disabled={locked} inputMode="decimal" value={level.claimRepeatability ?? ''} onChange={(event) => setLevel(index, { claimRepeatability: numberOrNull(event.target.value) })} /></Field></div>
              <div className="w-44"><Field label={`Claim within-lab (${claimUnit})`}><Input disabled={locked} inputMode="decimal" value={level.claimWithinLab ?? ''} onChange={(event) => setLevel(index, { claimWithinLab: numberOrNull(event.target.value) })} /></Field></div>
              {!locked ? <PasteBox hint={`วาง ${value.days} แถว (วัน) × ${value.replicates} คอลัมน์ (ซ้ำ) จาก Excel`} placeholder={'1.20E+03\t1.15E+03\t1.32E+03'} onApply={(rows) => setLevel(index, { values: rows.slice(0, 40).map((row) => row.slice(0, 10)) })} /> : null}
              {!locked ? <Button type="button" variant="ghost" aria-label={`ลบ ${level.label}`} onClick={() => onChange({ ...value, levels: value.levels.filter((_, i) => i !== index) })}><Trash2 className="size-4" /></Button> : null}
            </div>
            <div className="overflow-x-auto">
              <table className="text-xs">
                <thead className="text-[#789097]"><tr><th className="px-1 py-1 text-left">วัน</th>{Array.from({ length: value.replicates }, (_, r) => <th key={r} className="px-1 py-1 text-left">ซ้ำ {r + 1}</th>)}</tr></thead>
                <tbody>
                  {Array.from({ length: value.days }, (_, d) => (
                    <tr key={d}>
                      <td className="px-1 py-0.5 text-[#9aafb4]">{d + 1}</td>
                      {Array.from({ length: value.replicates }, (_, r) => (
                        <td key={r} className="px-1 py-0.5"><Input aria-label={`${level.label} วัน ${d + 1} ซ้ำ ${r + 1}`} disabled={locked} className="mono min-h-8 w-28 py-1" value={level.values[d]?.[r] ?? ''} onChange={(event) => setCell(index, d, r, event.target.value)} /></td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {result ? (
              <p className="mono text-xs text-[#315763]">
                n {result.n} ({result.days}×{result.replicates}) · mean {fmt(result.mean)} · Sr {fmt(result.repeatability, 4)}{result.repeatabilityCv != null ? ` (CV ${result.repeatabilityCv}%)` : ''} ≤ UVL {fmt(result.repeatabilityLimit, 4)} · S<sub>WL</sub> {fmt(result.withinLab, 4)}{result.withinLabCv != null ? ` (CV ${result.withinLabCv}%)` : ''} ≤ UVL {fmt(result.withinLabLimit, 4)} · <StatusBadge tone={VERDICT[result.verdict].tone} label={VERDICT[result.verdict].label} />
              </p>
            ) : null}
          </div>
        )
      })}
    </Section>
  )
}

function LodEditor({ value, onChange, unit, locked, evaluation }: { value: LodData; onChange: (next: LodData) => void; unit: string | null; locked: boolean; evaluation: StudyEvaluation }) {
  const result = evaluation.lod
  return (
    <Section title={SECTION_LABEL.lod} verdict={evaluation.sections.lod.verdict} reasons={evaluation.sections.lod.reasons}>
      <p className="text-xs text-[#789097]">ตรวจตัวอย่างที่เจือจางให้อยู่ที่ระดับ LoD ที่ผู้ผลิตอ้าง ซ้ำอย่างน้อย {value.minReplicates} ครั้ง ต้องตรวจพบ ≥ {value.minDetectPercent}% (ผล &lt;LoQ หรือ Target detected นับว่าตรวจพบ)</p>
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-44"><Field label={`LoD ที่ผู้ผลิตอ้าง${unit ? ` (${unit})` : ''}`}><Input disabled={locked} inputMode="decimal" value={value.claimedLod ?? ''} onChange={(event) => onChange({ ...value, claimedLod: numberOrNull(event.target.value) })} /></Field></div>
        <div className="w-32"><Field label="ซ้ำขั้นต่ำ"><Input type="number" min={1} disabled={locked} value={value.minReplicates} onChange={(event) => onChange({ ...value, minReplicates: Math.max(1, Number(event.target.value) || 1) })} /></Field></div>
        <div className="w-36"><Field label="ตรวจพบขั้นต่ำ (%)"><Input type="number" min={1} max={100} disabled={locked} value={value.minDetectPercent} onChange={(event) => onChange({ ...value, minDetectPercent: Math.min(100, Math.max(1, Number(event.target.value) || 95)) })} /></Field></div>
      </div>
      <Field label="ผลแต่ละซ้ำ (บรรทัดละ 1 ผล — วางคอลัมน์จาก Excel ได้)">
        <Textarea rows={6} disabled={locked} className="mono" value={value.values.join('\n')} onChange={(event) => onChange({ ...value, values: event.target.value.split(/\r?\n/).map((line) => line.split('\t')[0]).slice(0, 200) })} placeholder={'<20\nTarget Not Detected\n23'} />
      </Field>
      <p className="mono text-xs text-[#315763]">ตรวจพบ {result.detected}/{result.n}{result.detectPercent != null ? ` (${result.detectPercent}%)` : ''}{result.invalid ? ` · อ่านค่าไม่ได้ ${result.invalid}` : ''}</p>
    </Section>
  )
}

function LinearityEditor({ value, onChange, scale, unit, locked, evaluation }: { value: LinearityData; onChange: (next: LinearityData) => void; scale: CompareScale; unit: string | null; locked: boolean; evaluation: StudyEvaluation }) {
  const reps = Math.max(2, ...value.points.map((point) => point.values.length))
  const setPoint = (index: number, patch: Partial<LinearityData['points'][number]>) => onChange({ ...value, points: value.points.map((point, i) => (i === index ? { ...point, ...patch } : point)) })
  const result = evaluation.linearity
  const devUnit = scale === 'log10' ? 'log' : '%'
  return (
    <Section title={SECTION_LABEL.linearity} verdict={evaluation.sections.linearity.verdict} reasons={evaluation.sections.linearity.reasons}>
      <p className="text-xs text-[#789097]">เจือจางตัวอย่างความเข้มข้นสูงเป็นอย่างน้อย 5 ระดับครอบคลุมช่วงที่รายงาน ตรวจระดับละ 2–3 ซ้ำ ค่าเฉลี่ยแต่ละระดับต้องเบี่ยงจากค่าคาดหวังไม่เกินเกณฑ์</p>
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-44"><Field label={`เกณฑ์ค่าเบี่ยงเบน (± ${devUnit})`}><Input type="number" step="any" min={0} disabled={locked} value={value.limit} onChange={(event) => onChange({ ...value, limit: Number(event.target.value) > 0 ? Number(event.target.value) : value.limit })} /></Field></div>
        {!locked ? <Button type="button" variant="secondary" onClick={() => onChange({ ...value, points: [...value.points, { expected: null, values: [] }] })}><Plus className="size-4" /> เพิ่มระดับ</Button> : null}
        {!locked ? <PasteBox hint={`วางแถวละ 1 ระดับ: ค่าคาดหวัง แล้วตามด้วยผลแต่ละซ้ำ${unit ? ` (${unit})` : ''}`} placeholder={'1.0E+07\t9.6E+06\t1.1E+07\n1.0E+06\t1.02E+06\t9.4E+05'} onApply={(rows) => onChange({ ...value, points: rows.slice(0, 20).map((row) => ({ expected: numberOrNull(row[0] ?? ''), values: row.slice(1, 11) })) })} /> : null}
      </div>
      {value.points.length ? (
        <div className="overflow-x-auto rounded-md border border-[#e1ebec]">
          <table className="w-full min-w-[640px] text-left text-xs">
            <thead className="bg-[#f7fbfb] text-[#789097]">
              <tr>
                <th className="px-2 py-2">#</th>
                <th className="px-2 py-2">ค่าคาดหวัง</th>
                {Array.from({ length: reps }, (_, r) => <th key={r} className="px-2 py-2">ซ้ำ {r + 1}</th>)}
                <th className="px-2 py-2 text-right">เบี่ยงเบน ({devUnit})</th>
                <th className="px-2 py-2">ผล</th>
                {!locked ? <th className="px-2 py-2" /> : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#edf2f2]">
              {value.points.map((point, index) => {
                const pointResult = result.points[index]
                return (
                  <tr key={index}>
                    <td className="px-2 py-1 text-[#9aafb4]">{index + 1}</td>
                    <td className="px-2 py-1"><Input aria-label={`ค่าคาดหวังระดับ ${index + 1}`} disabled={locked} className="mono min-h-8 w-28 py-1" value={point.expected ?? ''} onChange={(event) => setPoint(index, { expected: numberOrNull(event.target.value) })} /></td>
                    {Array.from({ length: reps }, (_, r) => (
                      <td key={r} className="px-2 py-1"><Input aria-label={`ระดับ ${index + 1} ซ้ำ ${r + 1}`} disabled={locked} className="mono min-h-8 w-28 py-1" value={point.values[r] ?? ''} onChange={(event) => { const values = Array.from({ length: reps }, (_, i) => point.values[i] ?? ''); values[r] = event.target.value; setPoint(index, { values }) }} /></td>
                    ))}
                    <td className="mono px-2 py-1 text-right">{pointResult?.deviation == null ? '—' : `${pointResult.deviation >= 0 ? '+' : ''}${fmt(pointResult.deviation, scale === 'log10' ? 3 : 1)}`}</td>
                    <td className="px-2 py-1">{pointResult?.withinLimit == null ? null : pointResult.withinLimit ? <span className="text-[#2f7d44]">ในเกณฑ์</span> : <StatusBadge tone="rejected" label={`เกิน ±${value.limit}`} />}</td>
                    {!locked ? <td className="px-2 py-1"><button type="button" aria-label={`ลบระดับ ${index + 1}`} onClick={() => onChange({ ...value, points: value.points.filter((_, i) => i !== index) })} className="rounded p-1 text-[#af3541] hover:bg-[#fff1f2]"><Trash2 className="size-4" /></button></td> : null}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : null}
      {result.slope != null ? <p className="mono text-xs text-[#315763]">Regression (ผลวัด vs คาดหวัง{scale === 'log10' ? ', log10' : ''}): slope {fmt(result.slope)} · intercept {fmt(result.intercept)} · r {fmt(result.r, 4)}</p> : null}
    </Section>
  )
}
