'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, ClipboardPaste, Plus, Scale, Trash2 } from 'lucide-react'
import type { BmActor } from '@/lib/bm/types'
import { compareInstruments, parsePastedPairs, PAIR_LIMIT_MIN_PERCENT, type ComparePair, type CompareScale, type CompareSummary } from '@/lib/instcomp/compare'
import type { InstCompStatus, InstCompStudy, InstCompWorkspace } from '@/lib/instcomp/types'
import { formatDate } from '@/lib/bm/rules'
import { api, Button, Card, Field, Input, Notice, PageHeader, Select, StatCard, StatusBadge, type StatusTone, Textarea } from '@/components/ui'
import { AttachmentList } from '@/components/attachments'

const STATUS_TONE: Record<InstCompStatus, StatusTone> = {
  draft: 'neutral',
  'in-progress': 'warning',
  passed: 'accepted',
  failed: 'rejected',
  approved: 'accepted',
  rejected: 'rejected',
}
const STATUS_LABEL: Record<InstCompStatus, string> = {
  draft: 'ร่าง',
  'in-progress': 'กำลังเก็บข้อมูล',
  passed: 'ผ่านเกณฑ์',
  failed: 'ไม่ผ่านเกณฑ์',
  approved: 'อนุมัติแล้ว',
  rejected: 'ไม่อนุมัติ',
}
const VERDICT: Record<CompareSummary['verdict'], { tone: StatusTone; label: string }> = {
  passed: { tone: 'accepted', label: 'ผ่านเกณฑ์' },
  failed: { tone: 'rejected', label: 'ไม่ผ่านเกณฑ์' },
  insufficient: { tone: 'not_evaluated', label: 'ข้อมูลยังไม่พอ' },
}
const CATEGORY_LABEL: Record<ComparePair['category'], string> = {
  quantitative: '',
  'both-not-detected': 'ND ทั้งคู่',
  'detected-outside-range': 'นอกช่วงวัด',
  discordant: 'ไม่ตรงกัน',
  incomplete: 'ไม่ครบ',
  invalid: 'อ่านค่าไม่ได้',
}

function fmt(value: number | null | undefined, digits = 3) {
  return value == null || !Number.isFinite(value) ? '—' : value.toFixed(digits)
}

function diffUnit(scale: CompareScale) {
  return scale === 'log10' ? 'log' : '%'
}

type DraftRow = { sampleLabel: string; referenceRaw: string; candidateRaw: string; note: string }

function toDraft(study: InstCompStudy): DraftRow[] {
  return study.samples.map((sample) => ({
    sampleLabel: sample.sampleLabel ?? '',
    referenceRaw: sample.referenceRaw ?? '',
    candidateRaw: sample.candidateRaw ?? '',
    note: sample.note ?? '',
  }))
}

function analyze(study: Pick<InstCompStudy, 'scale' | 'biasLimit' | 'pairLimit' | 'minPairs'>, rows: DraftRow[]) {
  return compareInstruments(
    rows.map((row, index) => ({ rowNo: index + 1, sampleLabel: row.sampleLabel || null, referenceRaw: row.referenceRaw, candidateRaw: row.candidateRaw })),
    { scale: study.scale, biasLimit: study.biasLimit, pairLimit: study.pairLimit, minPairs: study.minPairs },
  )
}

export function InstrumentComparisonView({ actor, initialData }: { actor: BmActor; initialData: InstCompWorkspace }) {
  const router = useRouter()
  const data = initialData
  const isAdmin = actor.role === 'Admin'
  const [openId, setOpenId] = useState<string | null>(data.studies[0]?.id ?? null)
  const [showCreate, setShowCreate] = useState(data.studies.length === 0)
  const [message, setMessage] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null)

  const counts = useMemo(() => ({
    total: data.studies.length,
    approved: data.studies.filter((study) => study.status === 'approved').length,
    open: data.studies.filter((study) => study.status === 'draft' || study.status === 'in-progress' || study.status === 'passed').length,
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
        eyebrow="Method comparison · ISO 15189 7.3.7.4"
        title="เปรียบเทียบเครื่อง"
        description="ตรวจตัวอย่างคนไข้ชุดเดียวกันบนเครื่องเดิมและเครื่องใหม่ แล้วประเมิน bias ตามเกณฑ์ของห้องปฏิบัติการ (CLSI EP09)"
        actions={<Button onClick={() => setShowCreate((value) => !value)}><Plus className="size-4" /> สร้างรายการใหม่</Button>}
      />

      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="ทั้งหมด" value={counts.total} />
        <StatCard label="กำลังดำเนินการ" value={counts.open} tone={counts.open ? 'warning' : 'neutral'} />
        <StatCard label="อนุมัติแล้ว" value={counts.approved} tone="accepted" />
        <StatCard label="ไม่ผ่าน / ไม่อนุมัติ" value={counts.failed} tone={counts.failed ? 'rejected' : 'neutral'} />
      </div>

      {showCreate ? <CreateStudyForm data={data} onCreated={(id) => { setShowCreate(false); done('สร้างรายการแล้ว — กรอกหรือวางผลตัวอย่างได้เลย', id) }} onError={failed} /> : null}

      {data.studies.length === 0 && !showCreate ? (
        <Card className="p-8 text-center text-sm text-[#8198a0]">ยังไม่มีรายการเปรียบเทียบเครื่อง</Card>
      ) : null}

      <div className="space-y-3">
        {data.studies.map((study) => (
          <StudyCard
            key={`${study.id}:${study.updatedAt}`}
            study={study}
            open={openId === study.id}
            isAdmin={isAdmin}
            onToggle={() => setOpenId((current) => (current === study.id ? null : study.id))}
            onDone={(text) => done(text)}
            onError={failed}
          />
        ))}
      </div>
    </div>
  )
}

function CreateStudyForm({ data, onCreated, onError }: { data: InstCompWorkspace; onCreated: (id: string) => void; onError: (error: unknown) => void }) {
  const [busy, setBusy] = useState(false)
  const [analyteId, setAnalyteId] = useState('')
  const [testName, setTestName] = useState('')
  const [title, setTitle] = useState('')
  const [scale, setScale] = useState<CompareScale>('log10')
  const [unit, setUnit] = useState('')
  const [referenceId, setReferenceId] = useState('')
  const [referenceLabel, setReferenceLabel] = useState('')
  const [candidateId, setCandidateId] = useState('')
  const [candidateLabel, setCandidateLabel] = useState('')
  const [biasLimit, setBiasLimit] = useState('0.3')
  const [pairLimit, setPairLimit] = useState('0.5')
  const [minPairs, setMinPairs] = useState('20')
  const [performedOn, setPerformedOn] = useState('')

  function pickAnalyte(id: string) {
    setAnalyteId(id)
    const analyte = data.analytes.find((item) => item.id === id)
    if (!analyte) return
    const name = analyte.code.replace(/\s*\((HPC|LPC|Normal)\)\s*/i, '').trim()
    setTestName(name)
    setScale(analyte.scale)
    setUnit(analyte.unit ?? '')
    if (analyte.scale === 'linear') {
      setBiasLimit('10')
      setPairLimit('20')
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    try {
      const referenceName = referenceId ? data.instruments.find((item) => item.id === referenceId)?.code : referenceLabel
      const candidateName = candidateId ? data.instruments.find((item) => item.id === candidateId)?.code : candidateLabel
      const result = await api<{ id: string }>('/api/instrument-comparison/studies', {
        method: 'POST',
        body: JSON.stringify({
          title: title.trim() || `${testName} · ${referenceName ?? ''} vs ${candidateName ?? ''}`,
          testName,
          analyteId: analyteId || null,
          scale,
          unit: unit || null,
          referenceInstrumentId: referenceId || null,
          referenceLabel: referenceId ? null : referenceLabel || null,
          candidateInstrumentId: candidateId || null,
          candidateLabel: candidateId ? null : candidateLabel || null,
          biasLimit: Number(biasLimit),
          pairLimit: Number(pairLimit),
          minPairs: Number(minPairs),
          performedOn: performedOn || null,
        }),
      })
      onCreated(result.id)
    } catch (error) {
      onError(error)
    } finally {
      setBusy(false)
    }
  }

  const instrumentOptions = data.instruments.map((item) => (
    <option key={item.id} value={item.id}>{item.code} · {item.name}{item.isActive ? '' : ' (ปิดใช้)'}</option>
  ))

  return (
    <Card className="p-5">
      <form onSubmit={submit} className="space-y-4">
        <h2 className="text-base font-bold text-[#173d50]">สร้างรายการเปรียบเทียบเครื่อง</h2>
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="Analyte ในระบบ IQC (ไม่บังคับ)">
            <Select value={analyteId} onChange={(event) => pickAnalyte(event.target.value)}>
              <option value="">— ไม่ผูก —</option>
              {data.analytes.map((item) => <option key={item.id} value={item.id}>{item.code}</option>)}
            </Select>
          </Field>
          <Field label="ชื่อการทดสอบ"><Input required value={testName} onChange={(event) => setTestName(event.target.value)} placeholder="เช่น HIV-1 VL" /></Field>
          <Field label="ชื่อรายการ (ไม่บังคับ)"><Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="สร้างให้อัตโนมัติถ้าเว้นว่าง" /></Field>
          <Field label="เครื่องอ้างอิง (เครื่องเดิม)">
            <Select value={referenceId} onChange={(event) => setReferenceId(event.target.value)}>
              <option value="">— ระบุเอง —</option>
              {instrumentOptions}
            </Select>
          </Field>
          {!referenceId ? <Field label="ชื่อเครื่องอ้างอิง"><Input required value={referenceLabel} onChange={(event) => setReferenceLabel(event.target.value)} placeholder="เช่น cobas 8800 Sn5046" /></Field> : <div className="hidden md:block" />}
          <Field label="วันที่ทำการทดสอบ"><Input type="date" value={performedOn} onChange={(event) => setPerformedOn(event.target.value)} /></Field>
          <Field label="เครื่องที่ประเมิน (เครื่องใหม่)">
            <Select value={candidateId} onChange={(event) => setCandidateId(event.target.value)}>
              <option value="">— ระบุเอง —</option>
              {instrumentOptions}
            </Select>
          </Field>
          {!candidateId ? <Field label="ชื่อเครื่องที่ประเมิน"><Input required value={candidateLabel} onChange={(event) => setCandidateLabel(event.target.value)} placeholder="เช่น cobas 6800 Sn20088" /></Field> : <div className="hidden md:block" />}
          <div className="hidden md:block" />
          <Field label="สเกลที่ใช้คำนวณ">
            <Select value={scale} onChange={(event) => setScale(event.target.value as CompareScale)}>
              <option value="log10">log10 (viral load)</option>
              <option value="linear">linear (% difference)</option>
            </Select>
          </Field>
          <Field label="หน่วย"><Input value={unit} onChange={(event) => setUnit(event.target.value)} placeholder="cp/mL, IU/mL" /></Field>
          <div className="hidden md:block" />
          <Field label={`เกณฑ์ bias เฉลี่ย (± ${diffUnit(scale)})`}><Input required type="number" step="any" min="0" value={biasLimit} onChange={(event) => setBiasLimit(event.target.value)} /></Field>
          <Field label={`เกณฑ์ผลต่างรายคู่ (± ${diffUnit(scale)})`} hint={`ต้องอยู่ในเกณฑ์ ≥ ${PAIR_LIMIT_MIN_PERCENT}% ของคู่`}><Input required type="number" step="any" min="0" value={pairLimit} onChange={(event) => setPairLimit(event.target.value)} /></Field>
          <Field label="จำนวนคู่ขั้นต่ำ"><Input required type="number" min="2" step="1" value={minPairs} onChange={(event) => setMinPairs(event.target.value)} /></Field>
        </div>
        <p className="text-xs text-[#789097]">ค่าเริ่มต้นสำหรับ viral load: bias เฉลี่ย ≤ ±0.3 log และผลต่างรายคู่ ≤ ±0.5 log, อย่างน้อย 20 คู่ — ปรับให้ตรงกับ SOP ของห้องปฏิบัติการ</p>
        <div className="flex justify-end"><Button type="submit" disabled={busy}>{busy ? 'กำลังบันทึก…' : 'สร้างรายการ'}</Button></div>
      </form>
    </Card>
  )
}

function StudyCard({ study, open, isAdmin, onToggle, onDone, onError }: { study: InstCompStudy; open: boolean; isAdmin: boolean; onToggle: () => void; onDone: (text: string) => void; onError: (error: unknown) => void }) {
  const savedAnalysis = useMemo(() => analyze(study, toDraft(study)), [study])
  const verdict = VERDICT[savedAnalysis.summary.verdict]
  return (
    <Card className="overflow-hidden">
      <button type="button" onClick={onToggle} className="flex w-full flex-wrap items-center gap-3 px-5 py-4 text-left hover:bg-[#f7fbfb]">
        <Scale className="size-5 shrink-0 text-[#0b7f76]" />
        <div className="min-w-0 flex-1">
          <p className="font-bold text-[#173d50]">{study.title}</p>
          <p className="text-xs text-[#789097]">{study.referenceLabel} → {study.candidateLabel} · {savedAnalysis.summary.quantitativeN} คู่เชิงปริมาณ{study.performedOn ? ` · ${formatDate(study.performedOn)}` : ''}</p>
        </div>
        <StatusBadge tone={verdict.tone} label={verdict.label} />
        <StatusBadge tone={STATUS_TONE[study.status]} label={STATUS_LABEL[study.status]} />
        <ChevronDown className={`size-4 text-[#789097] transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open ? <StudyDetail study={study} isAdmin={isAdmin} onDone={onDone} onError={onError} /> : null}
    </Card>
  )
}

function StudyDetail({ study, isAdmin, onDone, onError }: { study: InstCompStudy; isAdmin: boolean; onDone: (text: string) => void; onError: (error: unknown) => void }) {
  const locked = study.status === 'approved'
  const [rows, setRows] = useState<DraftRow[]>(() => (study.samples.length ? toDraft(study) : [{ sampleLabel: '', referenceRaw: '', candidateRaw: '', note: '' }]))
  const [paste, setPaste] = useState('')
  const [showPaste, setShowPaste] = useState(false)
  const [conclusion, setConclusion] = useState(study.conclusion ?? '')
  const [busy, setBusy] = useState(false)
  const { pairs, summary } = useMemo(() => analyze(study, rows), [study, rows])
  const dirty = JSON.stringify(rows.filter((row) => row.sampleLabel || row.referenceRaw || row.candidateRaw)) !== JSON.stringify(toDraft(study))
  const unit = diffUnit(study.scale)

  async function patch(body: Record<string, unknown>, text: string) {
    setBusy(true)
    try {
      await api(`/api/instrument-comparison/studies/${study.id}`, { method: 'PATCH', body: JSON.stringify(body) })
      onDone(text)
    } catch (error) {
      onError(error)
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!window.confirm(`ลบรายการ "${study.title}" ใช่หรือไม่`)) return
    setBusy(true)
    try {
      await api(`/api/instrument-comparison/studies/${study.id}`, { method: 'DELETE' })
      onDone('ลบรายการแล้ว')
    } catch (error) {
      onError(error)
    } finally {
      setBusy(false)
    }
  }

  function applyPaste() {
    const parsed = parsePastedPairs(paste)
    if (!parsed.length) return
    const kept = rows.filter((row) => row.sampleLabel || row.referenceRaw || row.candidateRaw)
    setRows([...kept, ...parsed.map((row) => ({ sampleLabel: row.sampleLabel ?? '', referenceRaw: row.referenceRaw ?? '', candidateRaw: row.candidateRaw ?? '', note: '' }))])
    setPaste('')
    setShowPaste(false)
  }

  function setCell(index: number, key: keyof DraftRow, value: string) {
    setRows((current) => current.map((row, i) => (i === index ? { ...row, [key]: value } : row)))
  }

  return (
    <div className="space-y-5 border-t border-[#e1ebec] px-5 py-5">
      <div className="grid gap-2 text-xs text-[#58747d] sm:grid-cols-2 lg:grid-cols-4">
        <p><span className="font-semibold text-[#315763]">การทดสอบ:</span> {study.testName}{study.unit ? ` (${study.unit})` : ''}</p>
        <p><span className="font-semibold text-[#315763]">สเกล:</span> {study.scale === 'log10' ? 'log10' : 'linear (%)'}</p>
        <p><span className="font-semibold text-[#315763]">เกณฑ์:</span> bias ≤ ±{study.biasLimit} {unit} · รายคู่ ≤ ±{study.pairLimit} {unit} (≥{PAIR_LIMIT_MIN_PERCENT}%) · n ≥ {study.minPairs}</p>
        <p><span className="font-semibold text-[#315763]">ผู้สร้าง:</span> {study.createdByName ?? '—'}{study.approvedByName ? ` · อนุมัติโดย ${study.approvedByName}` : ''}</p>
      </div>

      <SummaryGrid summary={summary} unit={unit} />

      {summary.reasons.length ? (
        <Notice tone={summary.verdict === 'failed' ? 'danger' : 'warning'}>{summary.reasons.join(' · ')}</Notice>
      ) : summary.verdict === 'passed' ? <Notice tone="success">ผ่านเกณฑ์ทุกข้อ</Notice> : null}

      {summary.quantitativeN >= 2 ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <BlandAltmanChart pairs={pairs} summary={summary} study={study} />
          <ScatterChart pairs={pairs} study={study} />
        </div>
      ) : null}

      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-[#173d50]">ผลตัวอย่าง ({rows.filter((row) => row.referenceRaw || row.candidateRaw).length} ราย)</h3>
          {!locked ? (
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" onClick={() => setShowPaste((value) => !value)}><ClipboardPaste className="size-4" /> วางจาก Excel</Button>
              <Button type="button" variant="secondary" onClick={() => setRows((current) => [...current, { sampleLabel: '', referenceRaw: '', candidateRaw: '', note: '' }])}><Plus className="size-4" /> เพิ่มแถว</Button>
            </div>
          ) : null}
        </div>
        {showPaste ? (
          <div className="space-y-2 rounded-md border border-[#dfe9ea] bg-[#f7fbfb] p-3">
            <p className="text-xs text-[#58747d]">คัดลอกจาก Excel 3 คอลัมน์: <strong>ตัวอย่าง · เครื่องอ้างอิง · เครื่องที่ประเมิน</strong> (หรือ 2 คอลัมน์ไม่มีชื่อตัวอย่าง) — รองรับ 1.2E+05, 1,200, &lt;20, Target Not Detected</p>
            <Textarea rows={6} value={paste} onChange={(event) => setPaste(event.target.value)} placeholder={'S001\t1.25E+05\t1.31E+05\nS002\t<20\tTarget Not Detected'} />
            <div className="flex justify-end"><Button type="button" onClick={applyPaste} disabled={!paste.trim()}>เพิ่มเข้าตาราง</Button></div>
          </div>
        ) : null}
        <div className="overflow-x-auto rounded-md border border-[#e1ebec]">
          <table className="w-full min-w-[760px] text-left text-xs">
            <thead className="bg-[#f7fbfb] text-[#789097]">
              <tr>
                <th className="px-2 py-2 w-10">#</th>
                <th className="px-2 py-2">ตัวอย่าง</th>
                <th className="px-2 py-2">{study.referenceLabel}</th>
                <th className="px-2 py-2">{study.candidateLabel}</th>
                <th className="px-2 py-2 text-right">ผลต่าง ({unit})</th>
                <th className="px-2 py-2">สถานะ</th>
                {!locked ? <th className="px-2 py-2 w-10" /> : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#edf2f2] text-[#3f5c64]">
              {rows.map((row, index) => {
                const pair = pairs[index]
                const flag = pair?.category === 'quantitative'
                  ? (pair.withinPairLimit ? null : { tone: 'rejected' as StatusTone, label: `เกิน ±${study.pairLimit}` })
                  : pair && CATEGORY_LABEL[pair.category] ? { tone: (pair.category === 'discordant' || pair.category === 'invalid' ? 'rejected' : 'neutral') as StatusTone, label: CATEGORY_LABEL[pair.category] } : null
                return (
                  <tr key={index}>
                    <td className="px-2 py-1.5 text-[#9aafb4]">{index + 1}</td>
                    <td className="px-2 py-1.5"><Input aria-label={`ตัวอย่างแถว ${index + 1}`} disabled={locked} value={row.sampleLabel} onChange={(event) => setCell(index, 'sampleLabel', event.target.value)} className="min-h-9 py-1" /></td>
                    <td className="px-2 py-1.5"><Input aria-label={`ผลเครื่องอ้างอิงแถว ${index + 1}`} disabled={locked} value={row.referenceRaw} onChange={(event) => setCell(index, 'referenceRaw', event.target.value)} className="mono min-h-9 py-1" /></td>
                    <td className="px-2 py-1.5"><Input aria-label={`ผลเครื่องที่ประเมินแถว ${index + 1}`} disabled={locked} value={row.candidateRaw} onChange={(event) => setCell(index, 'candidateRaw', event.target.value)} className="mono min-h-9 py-1" /></td>
                    <td className="mono px-2 py-1.5 text-right">{pair?.difference != null ? `${pair.difference >= 0 ? '+' : ''}${fmt(pair.difference, study.scale === 'log10' ? 2 : 1)}` : '—'}</td>
                    <td className="px-2 py-1.5">{flag ? <StatusBadge tone={flag.tone} label={flag.label} /> : pair?.category === 'quantitative' ? <span className="text-[#2f7d44]">ในเกณฑ์</span> : null}</td>
                    {!locked ? <td className="px-2 py-1.5"><button type="button" aria-label={`ลบแถว ${index + 1}`} onClick={() => setRows((current) => current.filter((_, i) => i !== index))} className="rounded p-1 text-[#af3541] hover:bg-[#fff1f2]"><Trash2 className="size-4" /></button></td> : null}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {!locked ? (
          <div className="flex justify-end">
            <Button type="button" disabled={busy || !dirty} onClick={() => patch({ samples: rows }, 'บันทึกผลตัวอย่างแล้ว')}>{dirty ? 'บันทึกผลตัวอย่าง' : 'บันทึกแล้ว'}</Button>
          </div>
        ) : null}
      </div>

      <div className="space-y-2">
        <Field label="สรุปผล / ความเห็น">
          <Textarea rows={3} disabled={locked} value={conclusion} onChange={(event) => setConclusion(event.target.value)} placeholder="เช่น bias เฉลี่ยอยู่ในเกณฑ์ ผลเทียบเคียงกันได้ ใช้เครื่องใหม่รายงานผลแทนเครื่องเดิมได้" />
        </Field>
        <div className="flex flex-wrap justify-end gap-2">
          {!locked ? <Button type="button" variant="secondary" disabled={busy || conclusion === (study.conclusion ?? '')} onClick={() => patch({ conclusion }, 'บันทึกสรุปผลแล้ว')}>บันทึกสรุป</Button> : null}
          {!locked && dirty ? <span className="self-center text-xs text-[#a9700f]">บันทึกผลตัวอย่างก่อนเปลี่ยนสถานะ</span> : null}
          {!locked && !dirty ? (
            <>
              <Button type="button" variant="danger" disabled={busy} onClick={() => patch({ status: 'failed', conclusion }, 'บันทึกว่าไม่ผ่านเกณฑ์แล้ว')}>ไม่ผ่านเกณฑ์</Button>
              <Button type="button" disabled={busy || summary.verdict !== 'passed'} onClick={() => patch({ status: 'passed', conclusion }, 'บันทึกว่าผ่านเกณฑ์แล้ว')}>ผ่านเกณฑ์</Button>
            </>
          ) : null}
          {isAdmin && study.status === 'passed' && !dirty ? <Button type="button" disabled={busy} onClick={() => patch({ status: 'approved', conclusion }, 'อนุมัติแล้ว')}>อนุมัติ</Button> : null}
          {isAdmin && (study.status === 'passed' || study.status === 'failed') && !dirty ? <Button type="button" variant="danger" disabled={busy} onClick={() => patch({ status: 'rejected', conclusion }, 'บันทึกไม่อนุมัติแล้ว')}>ไม่อนุมัติ</Button> : null}
          {isAdmin && (locked || study.status === 'rejected') ? <Button type="button" variant="secondary" disabled={busy} onClick={() => patch({ status: 'in-progress' }, 'เปิดแก้ไขอีกครั้งแล้ว')}>เปิดแก้ไขอีกครั้ง</Button> : null}
        </div>
      </div>

      <AttachmentList module="instcomp" entityType="instcomp-study" entityId={study.id} kind="instcomp-evidence" canDelete={isAdmin && !locked} label="ไฟล์แนบ (ผลจากเครื่อง, รายงาน, SOP)" />

      {isAdmin && !locked ? (
        <div className="flex justify-end border-t border-[#edf2f2] pt-3">
          <Button type="button" variant="ghost" disabled={busy} onClick={remove}><Trash2 className="size-4" /> ลบรายการ</Button>
        </div>
      ) : null}
    </div>
  )
}

function SummaryGrid({ summary, unit }: { summary: CompareSummary; unit: string }) {
  const items: [string, string][] = [
    ['คู่เชิงปริมาณ', String(summary.quantitativeN)],
    [`Bias เฉลี่ย (${unit})`, summary.meanBias == null ? '—' : `${summary.meanBias >= 0 ? '+' : ''}${fmt(summary.meanBias)}`],
    [`SD ผลต่าง (${unit})`, fmt(summary.sdDifference)],
    ['95% Limits of agreement', summary.loaLower == null ? '—' : `${fmt(summary.loaLower)} ถึง ${fmt(summary.loaUpper)}`],
    [`ผลต่างสูงสุด (${unit})`, fmt(summary.maxAbsDifference)],
    ['คู่ในเกณฑ์รายคู่', summary.withinPairLimitPercent == null ? '—' : `${summary.withinPairLimitN}/${summary.quantitativeN} (${summary.withinPairLimitPercent}%)`],
    ['Regression (y = a + bx)', summary.slope == null ? '—' : `b ${fmt(summary.slope)} · a ${fmt(summary.intercept)} · r ${fmt(summary.r)}`],
    ['Detected / ND concordance', summary.concordancePercent == null ? '—' : `${summary.concordancePercent}% (ไม่ตรง ${summary.discordantN})`],
  ]
  return (
    <div className="grid gap-px overflow-hidden rounded-md border border-[#dbe8e9] bg-[#dbe8e9] sm:grid-cols-2 xl:grid-cols-4">
      {items.map(([label, value]) => (
        <div key={label} className="bg-white px-3 py-2.5">
          <p className="text-[11px] font-semibold text-[#789097]">{label}</p>
          <p className="mono mt-0.5 text-sm font-bold text-[#173d50]">{value}</p>
        </div>
      ))}
    </div>
  )
}

const W = 420
const H = 260
const PAD = { left: 48, right: 14, top: 14, bottom: 36 }

function scaleLinear(domain: [number, number], range: [number, number]) {
  const [d0, d1] = domain
  const [r0, r1] = range
  const span = d1 - d0 || 1
  return (value: number) => r0 + ((value - d0) / span) * (r1 - r0)
}

function padDomain(values: number[], extra = 0.1): [number, number] {
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || Math.abs(max) || 1
  return [min - span * extra, max + span * extra]
}

function ticks([min, max]: [number, number], count = 5) {
  const step = (max - min) / (count - 1)
  return Array.from({ length: count }, (_, index) => min + step * index)
}

function ChartFrame({ title, xLabel, yLabel, children, x, y }: { title: string; xLabel: string; yLabel: string; children: React.ReactNode; x: [number, number]; y: [number, number] }) {
  const sx = scaleLinear(x, [PAD.left, W - PAD.right])
  const sy = scaleLinear(y, [H - PAD.bottom, PAD.top])
  return (
    <figure className="rounded-md border border-[#e1ebec] bg-white p-3">
      <figcaption className="mb-1 text-xs font-bold text-[#315763]">{title}</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={title}>
        {ticks(y).map((value) => (
          <g key={`y${value}`}>
            <line x1={PAD.left} x2={W - PAD.right} y1={sy(value)} y2={sy(value)} stroke="#edf2f2" />
            <text x={PAD.left - 6} y={sy(value) + 3} textAnchor="end" fontSize="9" fill="#789097">{value.toFixed(2)}</text>
          </g>
        ))}
        {ticks(x).map((value) => (
          <text key={`x${value}`} x={sx(value)} y={H - PAD.bottom + 14} textAnchor="middle" fontSize="9" fill="#789097">{value.toFixed(2)}</text>
        ))}
        <text x={(PAD.left + W - PAD.right) / 2} y={H - 4} textAnchor="middle" fontSize="10" fill="#58747d">{xLabel}</text>
        <text x={12} y={(PAD.top + H - PAD.bottom) / 2} textAnchor="middle" fontSize="10" fill="#58747d" transform={`rotate(-90 12 ${(PAD.top + H - PAD.bottom) / 2})`}>{yLabel}</text>
        {children}
      </svg>
    </figure>
  )
}

function BlandAltmanChart({ pairs, summary, study }: { pairs: ComparePair[]; summary: CompareSummary; study: InstCompStudy }) {
  const points = pairs.filter((pair) => pair.category === 'quantitative')
  const unit = diffUnit(study.scale)
  const xValues = points.map((pair) => pair.mean as number)
  const yValues = [...points.map((pair) => pair.difference as number), study.pairLimit, -study.pairLimit, summary.loaLower ?? 0, summary.loaUpper ?? 0]
  const x = padDomain(xValues)
  const y = padDomain(yValues, 0.08)
  const sx = scaleLinear(x, [PAD.left, W - PAD.right])
  const sy = scaleLinear(y, [H - PAD.bottom, PAD.top])
  const line = (value: number, color: string, dash: string, label: string, side: 'start' | 'end' = 'end') => (
    <g>
      <line x1={PAD.left} x2={W - PAD.right} y1={sy(value)} y2={sy(value)} stroke={color} strokeDasharray={dash} strokeWidth="1.2" />
      <text x={side === 'end' ? W - PAD.right - 2 : PAD.left + 4} y={sy(value) - 3} textAnchor={side} fontSize="9" fill={color} paintOrder="stroke" stroke="#ffffff" strokeWidth="3">{label}</text>
    </g>
  )
  return (
    <ChartFrame title="Bland-Altman" xLabel={study.scale === 'log10' ? 'ค่าเฉลี่ยของสองเครื่อง (log10)' : 'ค่าเฉลี่ยของสองเครื่อง'} yLabel={`ผลต่าง ใหม่ − เดิม (${unit})`} x={x} y={y}>
      {line(0, '#9aafb4', '0', '0')}
      {line(study.pairLimit, '#c02a37', '2 3', `+${study.pairLimit} เกณฑ์`)}
      {line(-study.pairLimit, '#c02a37', '2 3', `−${study.pairLimit} เกณฑ์`)}
      {summary.meanBias != null ? line(summary.meanBias, '#0b7f76', '0', `bias ${fmt(summary.meanBias)}`, 'start') : null}
      {summary.loaUpper != null ? line(summary.loaUpper, '#a9700f', '5 3', `+1.96SD ${fmt(summary.loaUpper)}`) : null}
      {summary.loaLower != null ? line(summary.loaLower, '#a9700f', '5 3', `−1.96SD ${fmt(summary.loaLower)}`) : null}
      {points.map((pair) => (
        <circle key={pair.rowNo} cx={sx(pair.mean as number)} cy={sy(pair.difference as number)} r="3.5" fill={pair.withinPairLimit ? '#0b7f76' : '#c02a37'} fillOpacity="0.8">
          <title>{`${pair.sampleLabel ?? `#${pair.rowNo}`}: ${fmt(pair.difference)} ${unit}`}</title>
        </circle>
      ))}
    </ChartFrame>
  )
}

function ScatterChart({ pairs, study }: { pairs: ComparePair[]; study: InstCompStudy }) {
  const points = pairs.filter((pair) => pair.category === 'quantitative')
  const all = points.flatMap((pair) => [pair.referenceStat as number, pair.candidateStat as number])
  const domain = padDomain(all, 0.05)
  const sx = scaleLinear(domain, [PAD.left, W - PAD.right])
  const sy = scaleLinear(domain, [H - PAD.bottom, PAD.top])
  const axis = study.scale === 'log10' ? ' (log10)' : ''
  return (
    <ChartFrame title="Scatter · เส้นทแยง = ผลตรงกัน" xLabel={`${study.referenceLabel}${axis}`} yLabel={`${study.candidateLabel}${axis}`} x={domain} y={domain}>
      <line x1={sx(domain[0])} y1={sy(domain[0])} x2={sx(domain[1])} y2={sy(domain[1])} stroke="#9aafb4" strokeDasharray="4 3" />
      {points.map((pair) => (
        <circle key={pair.rowNo} cx={sx(pair.referenceStat as number)} cy={sy(pair.candidateStat as number)} r="3.5" fill={pair.withinPairLimit ? '#0b7f76' : '#c02a37'} fillOpacity="0.8">
          <title>{`${pair.sampleLabel ?? `#${pair.rowNo}`}: ${fmt(pair.referenceStat)} → ${fmt(pair.candidateStat)}`}</title>
        </circle>
      ))}
    </ChartFrame>
  )
}
