'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  CircleOff,
  ClipboardCheck,
  Database,
  FlaskConical,
  Layers3,
  LockKeyhole,
  ShieldCheck,
  SlidersHorizontal,
  Wrench,
} from 'lucide-react'
import type { BmActor } from '@/lib/bm/types'
import type { IqcBaselineReview, IqcBaselineReviewInput, IqcWorkspace, QcStatus } from '@/lib/iqc/types'
import { getIqcBaselineAnalytesForLot, getIqcBaselineScope } from '@/lib/iqc/baseline-scope'
import { getIqcControlPlanScope } from '@/lib/iqc/control-plan-scope'
import { parseTestSets } from '@/lib/iqc/test-sets'
import { api, Button, Card, Field, Input, Notice, Select, StatusBadge, type StatusTone, Textarea } from '@/components/ui'
import { ManagedList } from '@/components/managed-list'

type SetupKey = 'equipment' | 'analyte' | 'lot' | 'baseline' | 'plan' | 'advanced'
type ReviewFilter = 'all' | 'included' | 'excluded' | 'void'

const RULE_HELP: Record<string, { group: string; label: string; description: string }> = {
  '1-2s': { group: 'แจ้งเตือน', label: '1-2s', description: 'ผลเกิน ±2 SD — ให้ตรวจสอบก่อนตัดสิน' },
  '1-3s': { group: 'ต้องหยุด/Rejected', label: '1-3s', description: 'ผลเดียวเกิน ±3 SD — reject และทำ corrective action' },
  '2-2s': { group: 'ต้องหยุด/Rejected', label: '2-2s', description: 'ผลติดกัน 2 ครั้งเกิน 2 SD ด้านเดียวกัน — reject' },
  'R-4s': { group: 'ต้องเปิด investigation', label: 'R4s', description: 'ความต่างระหว่างคนละระดับใน run เดียวเกิน 4 SD' },
  '4-1s': { group: 'ต้องเปิด investigation', label: '4-1s', description: 'ผล 4 ครั้งติดอยู่เกิน 1 SD ด้านเดียวกัน' },
  '10x': { group: 'ต้องเปิด investigation', label: '10x', description: 'ผล 10 ครั้งติดอยู่ด้านเดียวกันของค่าเฉลี่ย' },
}

const ALL_RULES = Object.keys(RULE_HELP)

function fmt(value: number | null) {
  return value == null ? '—' : new Intl.NumberFormat('en-US', { maximumFractionDigits: 4 }).format(value)
}

function statusLabel(status: QcStatus) {
  return {
    accepted: 'ผ่าน',
    warning: 'แจ้งเตือน',
    investigate: 'ต้องตรวจสอบ',
    rejected: 'Rejected',
    not_evaluated: 'ยังไม่ประเมิน',
  }[status]
}

function statusTone(status: QcStatus): StatusTone {
  return status
}

function taskTone(state: 'complete' | 'attention' | 'blocked'): { label: string; tone: StatusTone; Icon: typeof CheckCircle2 } {
  if (state === 'complete') return { label: 'พร้อมใช้', tone: 'accepted', Icon: CheckCircle2 }
  if (state === 'attention') return { label: 'ต้องตรวจสอบ', tone: 'investigate', Icon: CircleAlert }
  return { label: 'ยังตั้งค่าไม่ครบ', tone: 'rejected', Icon: CircleOff }
}

function TaskIcon({ taskKey }: { taskKey: SetupKey }) {
  if (taskKey === 'equipment') return <Wrench className="size-5" aria-hidden="true" />
  if (taskKey === 'analyte') return <FlaskConical className="size-5" aria-hidden="true" />
  if (taskKey === 'lot') return <Layers3 className="size-5" aria-hidden="true" />
  if (taskKey === 'baseline') return <ClipboardCheck className="size-5" aria-hidden="true" />
  if (taskKey === 'plan') return <SlidersHorizontal className="size-5" aria-hidden="true" />
  return <Database className="size-5" aria-hidden="true" />
}

function TaskCard({ task, selected, onSelect, panelId }: { task: NonNullable<IqcWorkspace['setupHealth']>['tasks'][number]; selected: boolean; onSelect: () => void; panelId: string }) {
  const state = taskTone(task.state)
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      aria-expanded={selected}
      aria-controls={panelId}
      className={`min-h-32 rounded-lg border p-4 text-left transition duration-200 focus-visible:ring-2 focus-visible:ring-[#0b7f76] focus-visible:outline-none ${selected ? 'border-[#0b7f76] bg-[#f1faf9] shadow-sm' : 'border-[#d9e5e6] bg-white hover:border-[#9ec4c4]'}`}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="flex size-9 items-center justify-center rounded-md bg-[#e6f4f2] text-[#0b7f76]"><TaskIcon taskKey={task.key} /></span>
        <StatusBadge tone={state.tone} label={state.label} />
      </div>
      <p className="mt-3 font-bold text-[#173d50]">{task.label}</p>
      <p className="mt-1 text-xs leading-5 text-[#6e878e]">{task.description}</p>
      {task.dependencies.length ? <div className="mt-3 space-y-1 text-[11px] text-[#6e878e]" aria-label="dependency checklist">
        {task.dependencies.map((dependency) => <div key={dependency.label} className="flex items-center gap-1.5"><span aria-hidden="true" className={dependency.done ? 'text-[#2f7d44]' : 'text-[#c02a37]'}>{dependency.done ? '✓' : '!'}</span><span>{dependency.label}</span></div>)}
      </div> : null}
      <div className="mt-3 flex items-center justify-between gap-2 text-xs text-[#58747d]">
        <span>{task.count ? `${task.count} รายการ` : 'ยังไม่มีรายการ'}</span>
        <span className="inline-flex items-center gap-1 font-semibold text-[#0b7f76]">ทำต่อ <ChevronRight className="size-4" aria-hidden="true" /></span>
      </div>
    </button>
  )
}

function isSetupKey(value: string | null | undefined): value is SetupKey {
  return value === 'equipment' || value === 'analyte' || value === 'lot' || value === 'baseline' || value === 'plan' || value === 'advanced'
}

function defaultSetupHealth(data: IqcWorkspace) {
  const tasks = [
      { key: 'equipment' as const, label: 'เชื่อมเครื่องมือ', description: 'ใช้ Equipment เป็นแหล่งข้อมูลหลักของเครื่องมือ IQC', state: data.instruments.length ? 'complete' as const : 'blocked' as const, count: data.instruments.length, nextAction: 'ตรวจสอบเครื่องมือ', dependencies: [] },
      { key: 'analyte' as const, label: 'เพิ่ม analyte / ชุดทดสอบ', description: 'เพิ่ม assay และจัดกลุ่ม test set ก่อนกำหนดการรัน', state: data.analytes.some((analyte) => analyte.isActive) ? 'complete' as const : 'attention' as const, count: data.analytes.filter((analyte) => analyte.isActive).length, nextAction: data.analytes.some((analyte) => analyte.isActive) ? 'ตรวจสอบ analyte ที่ใช้งานอยู่' : 'เพิ่ม analyte', dependencies: [] },
      { key: 'lot' as const, label: 'เพิ่ม Control lot', description: 'ผูก Material, lot และ stock ในงานเดียว', state: data.instruments.length > 0 && data.controlLots.length > 0 ? 'complete' as const : 'blocked' as const, count: data.controlLots.length, nextAction: 'เพิ่ม lot', dependencies: [{ label: 'มีเครื่องมือที่เชื่อมจาก Equipment', done: data.instruments.length > 0 }] },
      { key: 'baseline' as const, label: 'ตั้งค่าค่าอ้างอิงและ QC baseline', description: 'ทบทวนผลจริงก่อนใช้เป็นเกณฑ์ตัดสิน VL', state: 'attention' as const, count: data.charts.length, nextAction: 'ทบทวน baseline', dependencies: [{ label: 'มีเครื่องมือที่เชื่อมจาก Equipment', done: data.instruments.length > 0 }, { label: 'มี Control lot', done: data.controlLots.length > 0 }] },
      { key: 'plan' as const, label: 'กำหนดการรัน', description: 'กำหนดว่าเครื่องนี้ต้องรัน control อะไรและใช้ policy ใด', state: data.controlPlans.length ? 'complete' as const : 'attention' as const, count: data.controlPlans.length, nextAction: 'กำหนดการรัน', dependencies: [{ label: 'มีเครื่องมือที่เชื่อมจาก Equipment', done: data.instruments.length > 0 }] },
      { key: 'advanced' as const, label: 'เกณฑ์เพิ่มเติม', description: 'TEa, Six Sigma และ Uncertainty สำหรับการทบทวนเชิงลึก', state: 'attention' as const, count: data.teaSpecs.length + data.uncertaintyBudgets.length, nextAction: 'เปิด advanced', dependencies: [{ label: 'มี VL analyte ในระบบ', done: data.analytes.some((analyte) => /-VL\b/i.test(analyte.code)) }] },
  ]
  return {
    tasks,
    readyCount: tasks.filter((task) => task.state === 'complete').length,
    attentionCount: tasks.filter((task) => task.state === 'attention').length,
    blockedCount: tasks.filter((task) => task.state === 'blocked').length,
  }
}

type IqcSettingsCenterProps = {
  data: IqcWorkspace
  actor: BmActor
  initialSetup?: string | null
  initialInstrumentId?: string | null
  initialLotId?: string | null
  initialAnalyteId?: string | null
  onOk: (text: string, data: IqcWorkspace) => void
  onErr: (text: string) => void
}

export function IqcSettingsCenter({ data, actor, initialSetup, initialInstrumentId, initialLotId, initialAnalyteId, onOk, onErr }: IqcSettingsCenterProps) {
  const health = data.setupHealth ?? defaultSetupHealth(data)
  const firstIncomplete = health.tasks.find((task) => task.state !== 'complete')?.key ?? 'baseline'
  const vlAnalytes = useMemo(() => data.analytes.filter((analyte) => /-VL\b/i.test(analyte.code) && analyte.dataType === 'quantitative'), [data.analytes])
  const [taskKey, setTaskKey] = useState<SetupKey>(() => isSetupKey(initialSetup) ? initialSetup : firstIncomplete)
  const baselineEligibleInstrumentIds = useMemo(() => new Set(data.instruments
    .filter((instrument) => instrument.isActive)
    .filter((instrument) => {
      const scope = getIqcBaselineScope(data, vlAnalytes, instrument.id)
      return scope.analytes.length > 0 || scope.controlLots.length > 0
    })
    .map((instrument) => instrument.id)), [data, vlAnalytes])
  const defaultInstrumentId = initialInstrumentId || data.instruments.find((instrument) => baselineEligibleInstrumentIds.has(instrument.id))?.id || ''
  const defaultScope = getIqcBaselineScope(data, vlAnalytes, defaultInstrumentId)
  const defaultLotId = initialLotId && defaultScope.controlLots.some((lot) => lot.id === initialLotId) ? initialLotId : defaultScope.controlLots[0]?.id || ''
  const defaultAnalyteId = initialAnalyteId && defaultScope.analytes.some((analyte) => analyte.id === initialAnalyteId) ? initialAnalyteId : defaultScope.analytes[0]?.id || ''
  const [instrumentId, setInstrumentId] = useState(defaultInstrumentId)
  const [lotId, setLotId] = useState(defaultLotId)
  const [analyteId, setAnalyteId] = useState(defaultAnalyteId)

  function selectTask(next: SetupKey) {
    setTaskKey(next)
    const url = new URL(window.location.href)
    url.searchParams.set('setup', next)
    window.history.replaceState(null, '', url.toString())
  }

  function selectBaseline(nextLotId: string, nextAnalyteId: string, nextInstrumentId = instrumentId) {
    setLotId(nextLotId)
    setAnalyteId(nextAnalyteId)
    setInstrumentId(nextInstrumentId)
    selectTask('baseline')
    const url = new URL(window.location.href)
    url.searchParams.set('setup', 'baseline')
    url.searchParams.set('lot', nextLotId)
    url.searchParams.set('analyte', nextAnalyteId)
    url.searchParams.set('instrument', nextInstrumentId)
    window.history.replaceState(null, '', url.toString())
  }

  return (
    <div className="space-y-4">
      <Card className="border-[#c8e2df] bg-[#f5fbfa] p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[11px] font-bold tracking-[0.16em] text-[#0b7f76] uppercase">IQC setup center</p>
            <h2 className="mt-1 text-xl font-bold text-[#173d50]">ตั้งค่าและทบทวน</h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-[#5f7b83]">ทำงานตามรายการที่ต้องจัดการ เลือกเครื่องมือและผลกระทบให้เห็นก่อนบันทึกทุกครั้ง</p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div className="rounded-md border border-[#c6e2ca] bg-white px-3 py-2"><p className="mono text-lg font-bold text-[#2f7d44]">{health.readyCount}</p><p className="text-[#6e878e]">พร้อมใช้</p></div>
            <div className="rounded-md border border-[#eed4a6] bg-white px-3 py-2"><p className="mono text-lg font-bold text-[#8f5f1d]">{health.attentionCount}</p><p className="text-[#6e878e]">ต้องตรวจสอบ</p></div>
            <div className="rounded-md border border-[#efc7cc] bg-white px-3 py-2"><p className="mono text-lg font-bold text-[#c02a37]">{health.blockedCount}</p><p className="text-[#6e878e]">ยังไม่ครบ</p></div>
          </div>
        </div>
      </Card>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
        {health.tasks.map((task) => <TaskCard key={task.key} task={task} selected={task.key === taskKey} panelId="iqc-setup-panel" onSelect={() => selectTask(task.key)} />)}
      </div>

      <div id="iqc-setup-panel" role="region" aria-live="polite">
        {taskKey === 'equipment' ? <EquipmentTask data={data} /> : null}
        {taskKey === 'analyte' ? <AnalyteTask data={data} onOk={onOk} onErr={onErr} /> : null}
        {taskKey === 'lot' ? <ControlLotTask data={data} onOk={onOk} onErr={onErr} /> : null}
        {taskKey === 'baseline' ? (
          <BaselineTask data={data} actor={actor} instrumentId={instrumentId} lotId={lotId} analyteId={analyteId} vlAnalytes={vlAnalytes} baselineEligibleInstrumentIds={baselineEligibleInstrumentIds} onSelect={selectBaseline} onOk={onOk} onErr={onErr} />
        ) : null}
        {taskKey === 'plan' ? <ControlPlanTask data={data} onOk={onOk} onErr={onErr} /> : null}
        {taskKey === 'advanced' ? <AdvancedTask data={data} /> : null}
      </div>
    </div>
  )
}

type AnalyteFormState = {
  code: string
  name: string
  dataType: 'quantitative' | 'qualitative'
  scale: 'linear' | 'log10'
  isAbsolute: boolean
  unit: string
  groupLabel: string
}

const EMPTY_ANALYTE_FORM: AnalyteFormState = {
  code: '',
  name: '',
  dataType: 'quantitative',
  scale: 'linear',
  isAbsolute: false,
  unit: '',
  groupLabel: '',
}

function AnalyteTask({ data, onOk, onErr }: { data: IqcWorkspace; onOk: (text: string, data: IqcWorkspace) => void; onErr: (text: string) => void }) {
  const [form, setForm] = useState<AnalyteFormState>({ ...EMPTY_ANALYTE_FORM })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const activeAnalytes = data.analytes.filter((analyte) => analyte.isActive)
  const existingTestSets = useMemo(
    () => [...new Set(data.analytes.flatMap((analyte) => parseTestSets(analyte.groupLabel)))].sort((a, b) => a.localeCompare(b)),
    [data.analytes],
  )

  function reset() {
    setEditingId(null)
    setForm({ ...EMPTY_ANALYTE_FORM })
  }

  async function persist(url: string, options: RequestInit, successText: string) {
    setBusy(true)
    try {
      const result = await api<{ iqc: IqcWorkspace }>(url, options)
      onOk(successText, result.iqc)
      return true
    } catch (error) {
      onErr(error instanceof Error ? error.message : 'จัดการ analyte ไม่สำเร็จ')
      return false
    } finally {
      setBusy(false)
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!form.code.trim() || !form.name.trim()) return onErr('กรอก Code และชื่อ analyte ก่อนบันทึก')
    const payload = {
      ...form,
      code: form.code.trim(),
      name: form.name.trim(),
      scale: form.dataType === 'qualitative' ? 'linear' : form.scale,
      unit: form.unit.trim() || null,
      groupLabel: form.groupLabel.trim() || null,
    }
    const success = await persist(
      editingId ? `/api/iqc/analytes/${editingId}` : '/api/iqc/analytes',
      { method: editingId ? 'PATCH' : 'POST', body: JSON.stringify(payload) },
      editingId ? 'แก้ไข analyte แล้ว' : 'เพิ่ม analyte แล้ว',
    )
    if (success) reset()
  }

  function edit(id: string) {
    const item = data.analytes.find((analyte) => analyte.id === id)
    if (!item) return
    setEditingId(id)
    setForm({
      code: item.code,
      name: item.name,
      dataType: item.dataType,
      scale: item.scale,
      isAbsolute: item.isAbsolute,
      unit: item.unit ?? '',
      groupLabel: item.groupLabel ?? '',
    })
  }

  async function toggle(id: string, isActive: boolean) {
    return persist(
      `/api/iqc/analytes/${id}`,
      { method: 'PATCH', body: JSON.stringify({ isActive }) },
      isActive ? 'เปิดใช้ analyte แล้ว' : 'ปิดใช้ analyte แล้ว',
    )
  }

  async function remove(id: string, label: string) {
    return persist(`/api/iqc/analytes/${id}`, { method: 'DELETE' }, `ลบ analyte ${label} แล้ว`)
  }

  return (
    <Card className="space-y-5 p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h3 className="font-bold text-[#173d50]">เพิ่ม analyte / ชุดทดสอบ</h3>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-[#6e878e]">สร้างรายการตรวจและจัดกลุ่ม test set ที่จะนำไปผูกกับเครื่องมือในขั้น “กำหนดการรัน”</p>
        </div>
        <StatusBadge tone={activeAnalytes.length ? 'accepted' : 'warning'} label={`${activeAnalytes.length} analyte ใช้งาน`} />
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-md border border-[#c8e2df] bg-[#f5fbfa] p-3">
          <p className="text-xs font-bold tracking-[0.12em] text-[#0b7f76] uppercase">1 · Master data</p>
          <p className="mt-1 text-xs leading-5 text-[#58747d]">กำหนด code, ชนิดผล, unit และ test set ของ analyte</p>
        </div>
        <div className="rounded-md border border-[#d9e5e6] bg-white p-3">
          <p className="text-xs font-bold tracking-[0.12em] text-[#315763] uppercase">2 · Run setup</p>
          <p className="mt-1 text-xs leading-5 text-[#58747d]">เลือกเครื่องมือและ test set ในการ์ด “กำหนดการรัน”</p>
        </div>
        <div className="rounded-md border border-[#d9e5e6] bg-white p-3">
          <p className="text-xs font-bold tracking-[0.12em] text-[#315763] uppercase">3 · Result</p>
          <p className="mt-1 text-xs leading-5 text-[#58747d]">จากนั้นจึงบันทึกผลใน “บันทึกผล IQC”</p>
        </div>
      </div>

      <form className="space-y-4 rounded-md border border-[#e1ebec] bg-[#fbfefe] p-4" onSubmit={submit}>
        <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
          <div>
            <p className="font-semibold text-[#173d50]">{editingId ? 'แก้ไข analyte' : 'สร้าง analyte ใหม่'}</p>
            <p className="mt-1 text-xs text-[#789097]">ใช้ | คั่นเมื่อต้องการให้ analyte อยู่ในหลาย test set</p>
          </div>
          {editingId ? <StatusBadge tone="investigate" label="กำลังแก้ไข" /> : null}
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <Field label="Code" hint="เช่น %CD4, AbsCD4 หรือ HIV-VL (HPC)">
            <Input value={form.code} onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))} required />
          </Field>
          <Field label="ชื่อ / Name">
            <Input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} required />
          </Field>
          <Field label="Data type" hint="VL Normal ใช้ Qualitative">
            <Select value={form.dataType} onChange={(event) => setForm((current) => ({ ...current, dataType: event.target.value as AnalyteFormState['dataType'], scale: event.target.value === 'qualitative' ? 'linear' : current.scale }))}>
              <option value="quantitative">Quantitative</option>
              <option value="qualitative">Qualitative</option>
            </Select>
          </Field>
          {form.dataType === 'qualitative' ? (
            <Field label="Scale" hint="Qualitative ไม่ใช้ scale">
              <div className="flex min-h-11 items-center rounded-md border border-[#d9e5e6] bg-[#f3f6f6] px-3 text-sm text-[#8ba0a5]" aria-label="Scale ไม่ใช้กับ Qualitative">ไม่ใช้กับ Qualitative</div>
            </Field>
          ) : (
            <Field label="Scale" hint="Log10 ใช้กับ viral load ที่เป็นตัวเลข">
              <Select value={form.scale} onChange={(event) => setForm((current) => ({ ...current, scale: event.target.value as AnalyteFormState['scale'] }))}>
                <option value="linear">Linear</option>
                <option value="log10">Log10 (VL)</option>
              </Select>
            </Field>
          )}
          <Field label="Unit" hint="เช่น %, cells/uL, IU/mL">
            <Input value={form.unit} onChange={(event) => setForm((current) => ({ ...current, unit: event.target.value }))} />
          </Field>
          <Field label="ชุดทดสอบ / Test set" hint="เลือกจากรายการเดิมหรือพิมพ์ชื่อใหม่">
            <Input list="iqc-setup-existing-test-sets" value={form.groupLabel} onChange={(event) => setForm((current) => ({ ...current, groupLabel: event.target.value }))} placeholder="เช่น CD4 Low Panel" />
            <datalist id="iqc-setup-existing-test-sets">
              {existingTestSets.map((testSet) => <option key={testSet} value={testSet} />)}
            </datalist>
          </Field>
        </div>
        <label className="flex items-start gap-2 text-sm text-[#3f5c64]">
          <input type="checkbox" checked={form.isAbsolute} onChange={(event) => setForm((current) => ({ ...current, isAbsolute: event.target.checked }))} className="mt-0.5 size-4 accent-[#0b7f76]" />
          <span><span className="font-semibold">เป็นค่า absolute count</span><span className="mt-0.5 block text-xs text-[#789097]">เช่น AbsCD4 ที่ต้องใช้ผลจาก Trucount</span></span>
        </label>
        <div className="flex flex-wrap items-center gap-2 border-t border-[#e1ebec] pt-3">
          <Button disabled={busy}>{busy ? 'กำลังบันทึก…' : editingId ? 'บันทึกการแก้ไข' : 'เพิ่ม analyte'}</Button>
          {editingId ? <Button type="button" variant="ghost" disabled={busy} onClick={reset}>ยกเลิก</Button> : null}
          <Link href="?setup=plan" className="ml-auto inline-flex min-h-11 items-center rounded-md px-3 py-2 text-sm font-semibold text-[#0b7f76] hover:bg-[#eef6f5]">ไปกำหนดการรัน <ArrowRight className="ml-1 size-4" aria-hidden="true" /></Link>
        </div>
      </form>

      <ManagedList
        noun="Analyte"
        onToggle={toggle}
        onEdit={edit}
        onDelete={remove}
        items={data.analytes.map((analyte) => ({
          id: analyte.id,
          label: analyte.code,
          sublabel: `${analyte.name}${analyte.groupLabel ? ` · ${analyte.groupLabel}` : ''}`,
          isActive: analyte.isActive,
        }))}
      />
    </Card>
  )
}

function EquipmentTask({ data }: { data: IqcWorkspace }) {
  return (
    <Card className="space-y-4 p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div><h3 className="font-bold text-[#173d50]">เชื่อมเครื่องมือ</h3><p className="mt-1 text-sm text-[#6e878e]">IQC ใช้เครื่องมือจาก Equipment โดยตรง จึงไม่สร้าง instrument ซ้ำจากหน้านี้</p></div>
        <Link href="/equipment" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-[#c9dadd] bg-white px-3.5 py-2 text-sm font-semibold text-[#244854] hover:bg-[#f7fbfb]">เปิด Equipment <ArrowRight className="size-4" aria-hidden="true" /></Link>
      </div>
      {data.instruments.length ? (
        <div className="overflow-x-auto rounded-md border border-[#e1ebec]">
          <table className="w-full min-w-[640px] text-left text-sm"><thead className="bg-[#f7fbfb] text-xs text-[#789097]"><tr><th className="px-3 py-2">เครื่องมือ</th><th className="px-3 py-2">Equipment</th><th className="px-3 py-2">สถานะ</th></tr></thead><tbody className="divide-y divide-[#edf2f2]">{data.instruments.map((instrument) => <tr key={instrument.id}><td className="px-3 py-3"><span className="mono font-semibold text-[#173d50]">{instrument.code}</span><span className="ml-2 text-[#58747d]">{instrument.name}</span></td><td className="px-3 py-3 text-[#58747d]">{instrument.equipmentName ?? 'ยังไม่เชื่อม'}</td><td className="px-3 py-3"><StatusBadge tone={instrument.equipmentStatus === 'active' ? 'accepted' : 'warning'} label={instrument.equipmentStatus ?? 'ไม่ทราบสถานะ'} /></td></tr>)}</tbody></table>
        </div>
      ) : <Notice tone="warning">ยังไม่มีเครื่องมือ IQC ที่เชื่อมกับ Equipment ให้เปิด Equipment แล้วเชื่อม Cobas 8800 ก่อน</Notice>}
    </Card>
  )
}

function ControlLotTask({ data, onOk, onErr }: { data: IqcWorkspace; onOk: (text: string, data: IqcWorkspace) => void; onErr: (text: string) => void }) {
  const [existingMaterialId, setExistingMaterialId] = useState(data.controlMaterials.find((material) => material.isActive)?.id ?? '')
  const [createMaterial, setCreateMaterial] = useState(!data.controlMaterials.length)
  const [materialName, setMaterialName] = useState('')
  const [level, setLevel] = useState('HPC/LPC')
  const [manufacturer, setManufacturer] = useState('Roche')
  const [lotNumber, setLotNumber] = useState('')
  const [expiryDate, setExpiryDate] = useState('')
  const [stockLotId, setStockLotId] = useState('')
  const [equipmentId, setEquipmentId] = useState('')
  const [busy, setBusy] = useState(false)

  const stockLots = equipmentId ? data.stockLots.filter((lot) => lot.equipmentIds.includes(equipmentId)) : data.stockLots
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!createMaterial && !existingMaterialId) return onErr('เลือก Material หรือเลือกเพิ่ม Material ใหม่ก่อน')
    if (createMaterial && !materialName.trim()) return onErr('กรอกชื่อ Material ก่อนบันทึก')
    if (!lotNumber.trim() && !stockLotId) return onErr('กรอกเลข Control lot หรือเลือก lot จาก Stock')
    setBusy(true)
    try {
      let nextData = data
      let controlMaterialId = existingMaterialId
      if (createMaterial) {
        const materialResult = await api<{ iqc: IqcWorkspace }>('/api/iqc/materials', { method: 'POST', body: JSON.stringify({ name: materialName, level, manufacturer, stockItemId: null }) })
        nextData = materialResult.iqc
        controlMaterialId = nextData.controlMaterials.find((material) => material.name === materialName.trim())?.id ?? ''
      }
      if (!controlMaterialId) throw new Error('สร้าง Material แล้วแต่ไม่พบรายการใหม่')
      const stockLot = data.stockLots.find((lot) => lot.id === stockLotId)
      const lotResult = await api<{ iqc: IqcWorkspace }>('/api/iqc/lots', { method: 'POST', body: JSON.stringify({ controlMaterialId, lotNumber: lotNumber.trim() || stockLot?.lotNumber, expiryDate: expiryDate || stockLot?.expiryDate || null, stockLotId: stockLotId || null }) })
      onOk('เพิ่ม Control lot และบันทึกความเชื่อมโยงกับ Stock แล้ว', lotResult.iqc)
      setLotNumber('')
      setExpiryDate('')
      setStockLotId('')
    } catch (error) {
      onErr(error instanceof Error ? error.message : 'เพิ่ม Control lot ไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="space-y-4 p-5">
      <div><h3 className="font-bold text-[#173d50]">เพิ่ม Control lot</h3><p className="mt-1 text-sm text-[#6e878e]">รวม Material, เลข lot, expiry และ link ไป Stock ใน flow เดียว</p></div>
      <form className="space-y-4" onSubmit={submit}>
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="Material" hint="ใช้จัดกลุ่ม Control และระดับที่ต้องรัน">
            <Select value={createMaterial ? '__new__' : existingMaterialId} onChange={(event) => { const value = event.target.value; setCreateMaterial(value === '__new__'); if (value !== '__new__') setExistingMaterialId(value) }}>
              <option value="">เลือก Material ที่มีอยู่</option>
              {data.controlMaterials.filter((material) => material.isActive).map((material) => <option key={material.id} value={material.id}>{material.name}{material.level ? ` · ${material.level}` : ''}</option>)}
              <option value="__new__">+ เพิ่ม Material ใหม่</option>
            </Select>
          </Field>
          {createMaterial ? <Field label="ชื่อ Material ใหม่" hint="เช่น HIV-VL Control"><Input value={materialName} onChange={(event) => setMaterialName(event.target.value)} aria-describedby="iqc-material-help" required /></Field> : <div className="hidden md:block" />}
          {createMaterial ? <Field label="ระดับ" hint="HPC/LPC/Normal"><Select value={level} onChange={(event) => setLevel(event.target.value)}><option>HPC/LPC</option><option>HPC</option><option>LPC</option><option>Normal</option></Select></Field> : null}
        </div>
        {createMaterial ? <div className="grid gap-3 md:grid-cols-3"><Field label="ผู้ผลิต" hint="แสดงเพื่อช่วยค้นหาและทวนสอบ"><Input value={manufacturer} onChange={(event) => setManufacturer(event.target.value)} /></Field><div /><div /></div> : null}
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="เลข Control lot" hint="ถ้าเลือก Stock lot ระบบจะเติมให้อัตโนมัติ"><Input value={lotNumber} onChange={(event) => setLotNumber(event.target.value)} readOnly={Boolean(stockLotId)} /></Field>
          <Field label="Expiry"><Input type="date" value={expiryDate} onChange={(event) => setExpiryDate(event.target.value)} readOnly={Boolean(stockLotId)} /></Field>
          <Field label="เครื่องมือสำหรับกรอง Stock" hint="เหตุผลของ stock linkage: แสดงเฉพาะ lot ที่ใช้กับเครื่องมือนี้"><Select value={equipmentId} onChange={(event) => setEquipmentId(event.target.value)}><option value="">ทุกเครื่องมือ</option>{data.instruments.filter((instrument) => instrument.isActive && instrument.equipmentId).map((instrument) => <option key={instrument.id} value={instrument.equipmentId!}>{instrument.code} · {instrument.name}</option>)}</Select></Field>
        </div>
        <Field label="เชื่อมกับ Stock lot (ถ้ามี)" hint="link นี้ช่วยให้เลข lot และ expiry สอดคล้องกับคลัง และป้องกันการลบ lot ที่ถูกใช้"><Select value={stockLotId} onChange={(event) => { const value = event.target.value; const stockLot = data.stockLots.find((lot) => lot.id === value); setStockLotId(value); if (stockLot) { setLotNumber(stockLot.lotNumber); setExpiryDate(stockLot.expiryDate ?? '') } }}><option value="">ไม่เชื่อม / กรอกเอง</option>{stockLots.map((lot) => <option key={lot.id} value={lot.id}>{lot.itemCode} · {lot.itemName} · LOT {lot.lotNumber}{lot.expiryDate ? ` · exp ${lot.expiryDate}` : ''}</option>)}</Select></Field>
        <div className="flex flex-wrap items-center gap-3"><Button disabled={busy}>{busy ? 'กำลังบันทึก…' : 'บันทึกและไปขั้นถัดไป'}</Button><span role="status" className="text-xs text-[#789097]">ระบบจะตรวจ dependency และ link stock ก่อนบันทึก</span></div>
      </form>
    </Card>
  )
}

function BaselineTask({ data, actor, instrumentId, lotId, analyteId, vlAnalytes, baselineEligibleInstrumentIds, onSelect, onOk, onErr }: { data: IqcWorkspace; actor: BmActor; instrumentId: string; lotId: string; analyteId: string; vlAnalytes: IqcWorkspace['analytes']; baselineEligibleInstrumentIds: ReadonlySet<string>; onSelect: (lotId: string, analyteId: string, instrumentId?: string) => void; onOk: (text: string, data: IqcWorkspace) => void; onErr: (text: string) => void }) {
  const baselineScope = getIqcBaselineScope(data, vlAnalytes, instrumentId)
  const activeLots = baselineScope.controlLots
  const scopedAnalytes = baselineScope.analytes
  const effectiveLotId = activeLots.some((lot) => lot.id === lotId) ? lotId : activeLots[0]?.id || ''
  const selectedLot = activeLots.find((lot) => lot.id === effectiveLotId)
  const lotScopedAnalytes = getIqcBaselineAnalytesForLot(data, scopedAnalytes, instrumentId, selectedLot)
  const effectiveAnalyteId = lotScopedAnalytes.some((analyte) => analyte.id === analyteId) ? analyteId : lotScopedAnalytes[0]?.id || ''
  const hasBaselineScope = scopedAnalytes.length > 0 || activeLots.length > 0
  const candidateCount = (controlLotId: string, analyteId: string) => data.runs
    .filter((run) => run.instrumentId === instrumentId)
    .reduce((count, run) => count + run.results.filter((result) => result.controlLotId === controlLotId && result.analyteId === analyteId && !result.isVoided).length, 0)
  const visibleLots = effectiveLotId ? activeLots.filter((lot) => lot.id === effectiveLotId) : activeLots
  const visibleAnalytes = effectiveAnalyteId ? lotScopedAnalytes.filter((analyte) => analyte.id === effectiveAnalyteId) : lotScopedAnalytes
  const matrixRows = visibleLots.flatMap((lot) => visibleAnalytes.map((analyte) => {
    const chart = data.charts.find((item) => item.controlLotId === lot.id && item.analyteId === analyte.id && item.instrumentId === instrumentId)
    const spec = data.specs.find((item) => item.controlLotId === lot.id && item.analyteId === analyte.id)
    const baseline = data.baselines?.find((item) => item.controlLotId === lot.id && item.analyteId === analyte.id && item.instrumentId === instrumentId && item.state === 'approved')
    return { lot, analyte, chart, spec, baseline, candidateN: candidateCount(lot.id, analyte.id) }
  }))
  const selected = Boolean(instrumentId && activeLots.some((lot) => lot.id === effectiveLotId) && lotScopedAnalytes.some((analyte) => analyte.id === effectiveAnalyteId))

  function changeInstrument(nextInstrumentId: string) {
    const nextScope = getIqcBaselineScope(data, vlAnalytes, nextInstrumentId)
    const nextLotId = nextScope.controlLots.some((lot) => lot.id === lotId) ? lotId : nextScope.controlLots[0]?.id || ''
    const nextLot = nextScope.controlLots.find((lot) => lot.id === nextLotId)
    const nextAnalytes = getIqcBaselineAnalytesForLot(data, nextScope.analytes, nextInstrumentId, nextLot)
    const nextAnalyteId = nextAnalytes.some((analyte) => analyte.id === analyteId) ? analyteId : nextAnalytes[0]?.id || ''
    onSelect(nextLotId, nextAnalyteId, nextInstrumentId)
  }

  function changeLot(nextLotId: string) {
    const nextLot = activeLots.find((lot) => lot.id === nextLotId)
    const nextAnalytes = getIqcBaselineAnalytesForLot(data, scopedAnalytes, instrumentId, nextLot)
    const nextAnalyteId = nextAnalytes.some((analyte) => analyte.id === effectiveAnalyteId) ? effectiveAnalyteId : nextAnalytes[0]?.id || ''
    onSelect(nextLotId, nextAnalyteId)
  }
  return (
    <div className="space-y-4">
      <Card className="space-y-4 p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between"><div><h3 className="font-bold text-[#173d50]">ตั้งค่าค่าอ้างอิงและ QC baseline</h3><p className="mt-1 text-sm text-[#6e878e]">ค่า CoA เป็นข้อมูลอ้างอิงจากผู้ผลิต ส่วนเกณฑ์ตัดสิน VL ต้องมาจากผล QC ของห้องปฏิบัติการที่ทบทวนแล้ว</p></div><div className="flex items-center gap-2 text-xs text-[#5b7681]"><ShieldCheck className="size-4 text-[#0b7f76]" aria-hidden="true" /> Admin เท่านั้นที่กดใช้ baseline ได้</div></div>
        <div className="grid gap-3 md:grid-cols-3"><Field label="เครื่องมือ" hint="baseline แยกตามเครื่องมือ"><Select value={instrumentId} onChange={(event) => changeInstrument(event.target.value)}><option value="">เลือกเครื่องมือ</option>{data.instruments.filter((instrument) => instrument.isActive).map((instrument) => <option key={instrument.id} value={instrument.id}>{instrument.code} · {instrument.name}{!baselineEligibleInstrumentIds.has(instrument.id) ? ' · ไม่ใช่ VL baseline' : ''}</option>)}</Select></Field><Field label="Control lot" hint="เลือก lot ก่อน ระบบจะกรอง analyte ตาม assay ของ lot"><Select disabled={!instrumentId || !hasBaselineScope} value={effectiveLotId} onChange={(event) => changeLot(event.target.value)}><option value="">เลือก Control lot</option>{activeLots.map((lot) => <option key={lot.id} value={lot.id}>{lot.controlMaterialName}{lot.level ? ` · ${lot.level}` : ''} · {lot.lotNumber}</option>)}</Select></Field><Field label="Analyte / ระดับ" hint="แสดงเฉพาะ analyte ของ Control lot และเครื่องมือที่เลือก"><Select disabled={!instrumentId || !hasBaselineScope} value={effectiveAnalyteId} onChange={(event) => onSelect(effectiveLotId, event.target.value)}><option value="">เลือก analyte</option>{lotScopedAnalytes.map((analyte) => <option key={analyte.id} value={analyte.id}>{analyte.code} · {analyte.dataType === 'qualitative' ? 'Normal' : 'quantitative'}</option>)}</Select></Field></div>
        {selectedLot && lotScopedAnalytes.length < scopedAnalytes.length ? <p className="rounded-md border border-[#c8e2df] bg-[#f5fbfa] px-3 py-2 text-xs text-[#176b68]">กรองตาม Control lot: แสดง {lotScopedAnalytes.length} analyte ที่อยู่ใน assay family ของ {selectedLot.controlMaterialName}</p> : null}
        {!hasBaselineScope && instrumentId ? <Notice tone="info">เครื่องมือนี้ไม่มี VL control plan หรือผล VL ที่ใช้ทำ baseline ได้ · สำหรับ FACSLyric/CD4 ให้ใช้เมนู “กำหนดการรัน” และกรอกผล IQC แทน</Notice> : null}
        <p className="rounded-md border border-[#d8e7e7] bg-[#f8fbfb] px-3 py-2 text-xs text-[#58747d]">{!hasBaselineScope && instrumentId ? 'ไม่ applicable: QC baseline รองรับเฉพาะ VL แบบ quantitative · VL Normal แบบ qualitative ใช้ expected result' : `Preview: จะทบทวน ${matrixRows.length} assay/ระดับที่มีผลในเครื่องมือที่เลือก · ค่าที่ไม่ถึง 20 ผลจะยังไม่สามารถ activate quantitative baseline`}</p>
        <div className="rounded-md border border-[#c8e2df] bg-[#f5fbfa] p-4">
          <div className="flex items-start gap-2">
            <ClipboardCheck className="mt-0.5 size-4 shrink-0 text-[#0b7f76]" aria-hidden="true" />
            <div>
              <p className="text-xs font-bold tracking-[0.12em] text-[#0b7f76] uppercase">วิธีใช้ Baseline Review</p>
              <p className="mt-1 text-xs leading-5 text-[#58747d]">ใช้เฉพาะ VL แบบ quantitative เพื่อสร้าง mean/SD จากผล QC จริง · VL Normal แบบ qualitative ไม่ต้องทำ baseline</p>
            </div>
          </div>
          <ol className="mt-3 grid gap-2 text-xs text-[#3f5c64] sm:grid-cols-2 lg:grid-cols-4">
            <li className="rounded-md border border-[#dcebea] bg-white px-3 py-2"><span className="font-bold text-[#0b7f76]">1</span> เลือกเครื่องมือที่มี VL quantitative</li>
            <li className="rounded-md border border-[#dcebea] bg-white px-3 py-2"><span className="font-bold text-[#0b7f76]">2</span> เลือก Control lot ที่ไม่ใช่ Normal</li>
            <li className="rounded-md border border-[#dcebea] bg-white px-3 py-2"><span className="font-bold text-[#0b7f76]">3</span> กด “เปิด Baseline Review” ในตาราง</li>
            <li className="rounded-md border border-[#dcebea] bg-white px-3 py-2"><span className="font-bold text-[#0b7f76]">4</span> ตรวจผล → ระบุเหตุผล → Admin กดใช้ baseline</li>
          </ol>
        </div>
      </Card>
      <Card className="overflow-hidden p-0"><div className="flex items-center justify-between border-b border-[#e1ebec] px-5 py-4"><div><h4 className="font-bold text-[#173d50]">VL baseline matrix</h4><p className="mt-1 text-xs text-[#789097]">เลือก “เปิด Baseline Review” เพื่อดูผลรายครั้งและผลกระทบก่อนบันทึก</p></div><span className="mono text-xs text-[#789097]">{matrixRows.length} rows</span></div><div className="overflow-x-auto"><table className="w-full min-w-[980px] text-left text-xs"><thead className="bg-[#f7fbfb] text-[#789097]"><tr><th className="px-4 py-3">Assay / ระดับ</th><th className="px-4 py-3">Control lot</th><th className="px-4 py-3">CoA</th><th className="px-4 py-3">Candidate</th><th className="px-4 py-3">สถานะ baseline</th><th className="px-4 py-3" /></tr></thead><tbody className="divide-y divide-[#edf2f2] text-[#3f5c64]">{matrixRows.map(({ lot, analyte, spec, baseline, candidateN }) => <tr key={`${lot.id}:${analyte.id}`} className={lot.id === effectiveLotId && analyte.id === effectiveAnalyteId ? 'bg-[#f1faf9]' : ''}><td className="px-4 py-3"><span className="mono font-semibold text-[#173d50]">{analyte.code}</span><span className="ml-2 text-[#789097]">{analyte.dataType === 'qualitative' ? 'Normal' : lot.level ?? '—'}</span></td><td className="px-4 py-3">{lot.lotNumber}</td><td className="px-4 py-3">{spec?.manufacturerLower != null && spec.manufacturerUpper != null ? <span className="mono">{fmt(spec.manufacturerLower)}–{fmt(spec.manufacturerUpper)}</span> : <span className="text-[#a0b0b4]">ไม่มี CoA</span>}</td><td className="px-4 py-3 mono">{candidateN}</td><td className="px-4 py-3">{baseline ? <StatusBadge tone={baseline.baselineType === 'observed_seed' ? 'investigate' : 'accepted'} label={baseline.baselineType === 'observed_seed' ? `Observed seed v${baseline.version}` : `Approved v${baseline.version}`} /> : candidateN >= (analyte.dataType === 'qualitative' ? 1 : 20) ? <StatusBadge tone="investigate" label="พร้อมทบทวน" /> : <StatusBadge tone="not_evaluated" label="ข้อมูลยังไม่ครบ" />}</td><td className="px-4 py-3 text-right"><Button type="button" variant="secondary" className="min-h-11" onClick={() => onSelect(lot.id, analyte.id)}>{lot.id === effectiveLotId && analyte.id === effectiveAnalyteId ? 'เปิดอยู่' : 'เปิด Baseline Review'}</Button></td></tr>)}</tbody></table></div></Card>
      {selected ? <BaselineReviewPanel key={`${effectiveLotId}:${effectiveAnalyteId}:${instrumentId}:${data.baselines?.find((baseline) => baseline.controlLotId === effectiveLotId && baseline.analyteId === effectiveAnalyteId && baseline.instrumentId === instrumentId && baseline.state === 'approved')?.id ?? 'none'}`} actor={actor} controlLotId={effectiveLotId} analyteId={effectiveAnalyteId} instrumentId={instrumentId} onOk={onOk} onErr={onErr} /> : <Notice tone="warning">เลือกเครื่องมือ, Control lot และ analyte เพื่อเปิด Baseline Review</Notice>}
    </div>
  )
}

function BaselineReviewPanel({ actor, controlLotId, analyteId, instrumentId, onOk, onErr }: { actor: BmActor; controlLotId: string; analyteId: string; instrumentId: string; onOk: (text: string, data: IqcWorkspace) => void; onErr: (text: string) => void }) {
  const [review, setReview] = useState<IqcBaselineReview | null>(null)
  const [includedIds, setIncludedIds] = useState<Set<string>>(new Set())
  const [exclusionReasons, setExclusionReasons] = useState<Record<string, string>>({})
  const [reason, setReason] = useState('')
  const [sourceRef, setSourceRef] = useState('')
  const [filter, setFilter] = useState<ReviewFilter>('all')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [errorText, setErrorText] = useState('')

  const loadReview = useCallback(async (override?: Set<string>) => {
    setLoading(true)
    setErrorText('')
    const body: IqcBaselineReviewInput = { controlLotId, analyteId, instrumentId, includedResultIds: override ? [...override] : undefined }
    try {
      const result = await api<{ review: IqcBaselineReview }>('/api/iqc/baselines/review', { method: 'POST', body: JSON.stringify(body) })
      setReview(result.review)
      const next = override ?? new Set(result.review.candidates.filter((candidate) => candidate.included).map((candidate) => candidate.resultId))
      setIncludedIds(next)
      setSourceRef((current) => current || result.review.manufacturerSourceRef || '')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'โหลด Baseline Review ไม่สำเร็จ'
      setErrorText(message)
      onErr(message)
    } finally {
      setLoading(false)
    }
  }, [analyteId, controlLotId, instrumentId, onErr])

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadReview() }, 0)
    return () => window.clearTimeout(timer)
  }, [loadReview])

  function toggle(resultId: string) {
    const next = new Set(includedIds)
    if (next.has(resultId)) {
      next.delete(resultId)
      setExclusionReasons((current) => ({ ...current, [resultId]: current[resultId] ?? '' }))
    } else next.add(resultId)
    setIncludedIds(next)
    void loadReview(next)
  }

  async function apply() {
    if (!review) return
    if (!reason.trim()) return setErrorText('กรุณาระบุเหตุผลที่ baseline ใหม่จะถูกใช้แทนค่าเดิม')
    const excludedWithoutReason = review.candidates.filter((candidate) => candidate.eligibleForBaseline && !includedIds.has(candidate.resultId) && !exclusionReasons[candidate.resultId]?.trim())
    if (excludedWithoutReason.length) return setErrorText(`กรุณาระบุเหตุผลที่ไม่รวม ${excludedWithoutReason.length} ผลก่อนบันทึก`)
    setSaving(true)
    setErrorText('')
    try {
      const result = await api<{ iqc: IqcWorkspace }>('/api/iqc/baselines/apply', { method: 'POST', body: JSON.stringify({ controlLotId, analyteId, instrumentId, includedResultIds: [...includedIds], exclusionReasons, reason: reason.trim(), sourceRef: sourceRef.trim() || null }) })
      onOk('อนุมัติ baseline และ recalculated ประวัติ VL แล้ว', result.iqc)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'บันทึก baseline ไม่สำเร็จ'
      setErrorText(message)
      onErr(message)
    } finally {
      setSaving(false)
    }
  }

  if (loading && !review) return <Card className="p-6 text-sm text-[#6e878e]"><div role="status">กำลังคำนวณ preview จากผล QC…</div></Card>
  if (!review) return <Card className="p-6 text-sm text-[#6e878e]">ยังไม่มีข้อมูล Baseline Review</Card>
  const visibleCandidates = review.candidates.filter((candidate) => filter === 'all' || filter === 'included' && candidate.included || filter === 'excluded' && candidate.eligibleForBaseline && !candidate.included || filter === 'void' && candidate.isVoided)
  const observedNormalValues = review.candidates
    .filter((candidate) => candidate.eligibleForBaseline && candidate.qualitativeValue?.trim())
    .map((candidate) => candidate.qualitativeValue!.trim())
  const normalPrompt = review.dataType === 'qualitative'
    && observedNormalValues.length > 0
    && observedNormalValues.every((value) => /^(not\s*detected|negative|<\s*lod)$/i.test(value))
  return (
    <Card className="space-y-5 p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between"><div><p className="mono text-xs text-[#0b7f76]">{review.analyteCode} · {review.lotNumber} · {review.instrumentName}</p><h3 className="mt-1 text-lg font-bold text-[#173d50]">Baseline Review</h3><p className="mt-1 text-sm text-[#6e878e]">ผลที่เลือกจะใช้เป็น operational QC baseline; ค่า CoA ยังคงแสดงเป็น reference เท่านั้น</p></div><div className="flex flex-wrap items-center gap-2"><StatusBadge tone={review.baselineType === 'observed_seed' ? 'investigate' : review.baselineState === 'approved' ? 'accepted' : 'warning'} label={review.baselineType === 'observed_seed' ? 'Observed seed' : review.baselineState === 'approved' ? 'Approved' : 'Provisional'} /><span className="rounded-full border border-[#d2dee0] bg-[#f6f9f9] px-2 py-0.5 text-[11px] font-bold text-[#5b7681]">{review.policyProfile}</span></div></div>
      {normalPrompt ? <Notice tone="info">พบผลเดิมเป็น Not detected ทั้งหมด ต้องการตั้งเป็น expected result หรือไม่ — ข้อเสนอนี้จะไม่คำนวณ z-score หรือ numeric Westgard</Notice> : null}
      <div className="grid gap-3 lg:grid-cols-2"><Card className="border-[#dce8e8] bg-[#fbfdfd] p-4"><p className="text-xs font-bold tracking-[0.12em] text-[#789097] uppercase">ค่าอ้างอิงจากผู้ผลิต (CoA)</p><div className="mt-3 grid grid-cols-2 gap-3 text-sm"><div><span className="block text-xs text-[#789097]">ช่วง Lower–Upper</span><span className="mono font-bold text-[#173d50]">{review.manufacturerLower != null && review.manufacturerUpper != null ? `${fmt(review.manufacturerLower)} – ${fmt(review.manufacturerUpper)}` : 'ไม่ระบุ'}</span></div><div><span className="block text-xs text-[#789097]">Precision SD</span><span className="mono font-bold text-[#173d50]">{fmt(review.manufacturerPrecisionSd)}</span></div><div><span className="block text-xs text-[#789097]">Target mean</span><span className="mono font-bold text-[#173d50]">{fmt(review.manufacturerTargetMean)} <span className="font-sans text-xs font-normal text-[#789097]">(ไม่ใช้ตัดสิน)</span></span></div><div><span className="block text-xs text-[#789097]">Source</span><span className="break-all text-xs text-[#58747d]">{review.manufacturerSourceRef ?? 'ไม่ระบุ'}</span></div></div></Card><Card className="border-[#c8e2df] bg-[#f5fbfa] p-4"><p className="text-xs font-bold tracking-[0.12em] text-[#0b7f76] uppercase">ค่าที่ใช้ตัดสินผลตอนนี้ → ข้อเสนอใหม่</p><div className="mt-3 grid grid-cols-2 gap-3 text-sm"><div><span className="block text-xs text-[#789097]">Current baseline</span><span className="mono font-bold text-[#173d50]">{fmt(review.currentMean)} / {fmt(review.currentSd)}</span><span className="block text-xs text-[#789097]">n={review.currentN}</span></div><div><span className="block text-xs text-[#789097]">Proposed baseline</span><span className="mono font-bold text-[#0b7f76]">{review.dataType === 'qualitative' ? review.expectedQualitative ?? '—' : `${fmt(review.proposedMean)} / ${fmt(review.proposedSd)}`}</span><span className="block text-xs text-[#789097]">n={review.proposedN}</span></div></div></Card></div>
      <Notice tone={review.canApply ? 'info' : 'warning'}>{review.canApply ? 'พร้อมใช้: ตรวจสอบ checkbox และเหตุผลให้เรียบร้อย แล้วให้ Admin กด “คำนวณและใช้ค่า baseline”' : `ยังใช้ baseline ไม่ได้: ${review.blockedReason ?? 'ตรวจสอบเงื่อนไขของผล QC'}`}</Notice>
      <p className="rounded-md border border-dashed border-[#cfdee0] bg-[#fbfdfd] px-3 py-2 text-xs text-[#58747d]">ในตาราง: ติ๊ก = รวมผลในการคำนวณ mean/SD · เอาติ๊กออก = ไม่รวม และต้องระบุเหตุผลรายผล · ค่า CoA เป็น reference ไม่ได้ถูกนำมาตัดสินแทน QC baseline</p>
      <div className="grid gap-2 sm:grid-cols-5">{(['accepted', 'warning', 'investigate', 'rejected', 'not_evaluated'] as QcStatus[]).map((status) => <div key={status} className="rounded-md border border-[#e1ebec] bg-white px-3 py-2"><StatusBadge tone={statusTone(status)} label={statusLabel(status)} /><p className="mono mt-2 text-xl font-bold text-[#173d50]">{review.impact[status]}</p></div>)}</div>
      <div className="flex flex-wrap items-end justify-between gap-3"><div className="flex flex-wrap gap-1" role="tablist" aria-label="กรองผล Baseline Review">{([['all', 'ทั้งหมด'], ['included', 'รวม'], ['excluded', 'ไม่รวม'], ['void', 'void']] as [ReviewFilter, string][]).map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={filter === key} onClick={() => setFilter(key)} className={`min-h-11 rounded-md px-3 py-2 text-xs font-bold ${filter === key ? 'bg-[#0b7f76] text-white' : 'border border-[#d9e5e6] bg-white text-[#58747d]'}`}>{label}</button>)}</div><Button type="button" variant="secondary" disabled={loading} onClick={() => void loadReview(includedIds)}>{loading ? 'กำลังคำนวณ…' : 'คำนวณ preview ใหม่'}</Button></div>
      {errorText ? <div id="baseline-error-summary" tabIndex={-1} role="alert" className="rounded-md border border-[#efc7cc] bg-[#fff5f6] px-3 py-2 text-sm text-[#a83541]">{errorText}<a className="ml-2 font-semibold underline" href="#baseline-reason">ไปยังเหตุผลการอนุมัติ</a></div> : null}
      <div className="overflow-x-auto rounded-md border border-[#e1ebec]"><table className="w-full min-w-[1080px] text-left text-xs"><thead className="bg-[#f7fbfb] text-[#789097]"><tr><th className="px-3 py-3">รวม</th><th className="px-3 py-3">วันที่</th><th className="px-3 py-3">ค่า</th><th className="px-3 py-3">z</th><th className="px-3 py-3">สถานะเดิม → ใหม่</th><th className="px-3 py-3">เหตุผลที่ไม่รวม</th></tr></thead><tbody className="divide-y divide-[#edf2f2] text-[#3f5c64]">{visibleCandidates.map((candidate) => <tr key={candidate.resultId} className={candidate.included ? '' : 'bg-[#fcfdfd]'}><td className="px-3 py-3">{candidate.isVoided ? <StatusBadge tone="not_evaluated" label="void" /> : candidate.eligibleForBaseline ? <input type="checkbox" aria-label={`รวมผล ${candidate.resultId}`} checked={includedIds.has(candidate.resultId)} onChange={() => toggle(candidate.resultId)} className="size-4 accent-[#0b7f76]" /> : <span className="text-[#a0b0b4]">—</span>}</td><td className="px-3 py-3 whitespace-nowrap">{candidate.runDatetime || '—'}</td><td className="px-3 py-3 mono">{candidate.numericValue != null ? fmt(candidate.numericValue) : candidate.qualitativeValue ?? '—'}</td><td className="px-3 py-3 mono">{candidate.proposedZ == null ? '—' : fmt(candidate.proposedZ)}</td><td className="px-3 py-3"><div className="flex flex-wrap items-center gap-1"><StatusBadge tone={statusTone(candidate.currentStatus)} label={statusLabel(candidate.currentStatus)} /><span className="text-[#789097]">→</span><StatusBadge tone={statusTone(candidate.proposedStatus)} label={statusLabel(candidate.proposedStatus)} /></div>{candidate.proposedRules.length ? <p className="mt-1 text-[11px] text-[#8f5f1d]">{candidate.proposedRules.join(', ')}</p> : null}</td><td className="px-3 py-3">{!candidate.included && candidate.eligibleForBaseline ? <Input aria-label={`เหตุผลที่ไม่รวมผล ${candidate.resultId}`} aria-describedby="baseline-reason" className="min-w-64" value={exclusionReasons[candidate.resultId] ?? ''} onChange={(event) => setExclusionReasons((current) => ({ ...current, [candidate.resultId]: event.target.value }))} placeholder="ระบุเหตุผล" /> : <span className="text-[#a0b0b4]">{candidate.exclusionReason ?? '—'}</span>}</td></tr>)}</tbody></table></div>
      <div className="grid gap-3 md:grid-cols-2"><Field label="เหตุผลที่ baseline ใหม่จะถูกใช้แทนค่าเดิม" hint="บันทึกลง audit log พร้อมค่าเก่า/ค่าใหม่" ><Textarea id="baseline-reason" aria-describedby="baseline-reason-help" value={reason} onChange={(event) => setReason(event.target.value)} rows={3} placeholder="เช่น ใช้ผล VL non-void ทั้งหมดจาก Cobas 8800 หลังทบทวนข้อมูลจริงของห้องปฏิบัติการ" required /><span id="baseline-reason-help" className="sr-only">ต้องระบุเหตุผลก่อน Admin อนุมัติ</span></Field><Field label="Source reference (ถ้ามี)" hint="เช่น ชื่อไฟล์ CoA หรือช่วงวันที่ของผล QC"><Input value={sourceRef} onChange={(event) => setSourceRef(event.target.value)} aria-describedby="baseline-source-help" /><span id="baseline-source-help" className="sr-only">ใช้เพื่อให้ตรวจสอบแหล่งข้อมูล baseline ย้อนหลังได้</span></Field></div>
      <div className="flex flex-col gap-3 border-t border-[#e1ebec] pt-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-start gap-2 text-xs text-[#6e878e]"><LockKeyhole className="mt-0.5 size-4 shrink-0 text-[#0b7f76]" aria-hidden="true" /><span>baseline และผลของระดับนี้จะถูกบันทึกพร้อม audit old/new ใน transaction เดียว แล้วระบบจะ refresh ทุกระดับของ VL ใน lot เพื่อเช็ก R-4s ข้ามระดับทันที</span></div><Button disabled={saving || !review.canApply || actor.role !== 'Admin'} onClick={() => void apply()}>{saving ? 'กำลังคำนวณและบันทึก…' : 'คำนวณและใช้ค่า baseline'}</Button></div>
      {!review.canApply ? <Notice tone="warning">{review.blockedReason ?? 'Baseline ยังไม่พร้อมใช้'}</Notice> : null}
    </Card>
  )
}

function ControlPlanTask({ data, onOk, onErr }: { data: IqcWorkspace; onOk: (text: string, data: IqcWorkspace) => void; onErr: (text: string) => void }) {
  const initialInstrumentId = data.instruments.find((instrument) => instrument.isActive)?.id ?? ''
  const initialScope = getIqcControlPlanScope(data.analytes, data.controlPlans, initialInstrumentId)
  const [instrumentId, setInstrumentId] = useState(initialInstrumentId)
  const [testSet, setTestSet] = useState(initialScope.testSets[0] ?? '')
  const [frequency, setFrequency] = useState<'daily' | 'per-run'>('daily')
  const [rules, setRules] = useState<string[]>(ALL_RULES)
  const [busy, setBusy] = useState(false)
  const scope = useMemo(() => getIqcControlPlanScope(data.analytes, data.controlPlans, instrumentId), [data.analytes, data.controlPlans, instrumentId])
  const activeTestSet = testSet && scope.testSets.includes(testSet) ? testSet : ''
  const selectedAnalytes = scope.analytes.filter((analyte) => !activeTestSet || parseTestSets(analyte.groupLabel).includes(activeTestSet))
  const requiredLevels = [...new Set(selectedAnalytes.map((analyte) => analyte.code.match(/\((HPC|LPC|Normal)\)/i)?.[1]).filter((level): level is string => Boolean(level)))]

  function changeInstrument(nextInstrumentId: string) {
    const nextScope = getIqcControlPlanScope(data.analytes, data.controlPlans, nextInstrumentId)
    setInstrumentId(nextInstrumentId)
    setTestSet(nextInstrumentId ? nextScope.testSets[0] ?? '' : '')
  }

  function toggleRule(rule: string) { setRules((current) => current.includes(rule) ? current.filter((item) => item !== rule) : [...current, rule]) }
  async function save() {
    if (!instrumentId) return onErr('เลือกเครื่องมือก่อนกำหนดการรัน')
    if (!selectedAnalytes.length) return onErr('เลือก test set ที่มี analyte อย่างน้อย 1 รายการ')
    if (!rules.length) return onErr('เลือก rule อย่างน้อย 1 ข้อ')
    if (!window.confirm(`ยืนยันตั้งค่า control plan ให้ ${selectedAnalytes.length} analytes และ ${requiredLevels.length} levels หรือไม่`)) return
    setBusy(true)
    try {
      const result = await api<{ iqc: IqcWorkspace }>('/api/iqc/control-plans', { method: 'POST', body: JSON.stringify({ analyteIds: selectedAnalytes.map((analyte) => analyte.id), instrumentId, requiredLevels, frequency, westgardRules: rules, isActive: true }) })
      onOk('บันทึกกำหนดการรันและ policy ตามชนิด analyte แล้ว', result.iqc)
    } catch (error) { onErr(error instanceof Error ? error.message : 'บันทึกกำหนดการรันไม่สำเร็จ') } finally { setBusy(false) }
  }

  return (
    <Card className="space-y-5 p-5">
      <div>
        <h3 className="font-bold text-[#173d50]">กำหนดการรัน</h3>
        <p className="mt-1 text-sm text-[#6e878e]">เริ่มจากเครื่องมือและ test set ระบบจะแสดง analyte/ระดับที่ได้รับผลกระทบแบบ read-only</p>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <Field label="เครื่องมือ"><Select value={instrumentId} onChange={(event) => changeInstrument(event.target.value)}><option value="">เลือกเครื่องมือ</option>{data.instruments.filter((instrument) => instrument.isActive).map((instrument) => <option key={instrument.id} value={instrument.id}>{instrument.code} · {instrument.name}</option>)}</Select></Field>
        <Field label="Test set"><Select value={activeTestSet} onChange={(event) => setTestSet(event.target.value)}><option value="">ทุก test set</option>{scope.testSets.map((set) => <option key={set} value={set}>{set}</option>)}</Select></Field>
        <Field label="ความถี่"><Select value={frequency} onChange={(event) => setFrequency(event.target.value as 'daily' | 'per-run')}><option value="daily">ทุกวัน</option><option value="per-run">ทุก run</option></Select></Field>
      </div>
      <div className={`rounded-md border px-4 py-3 text-xs ${scope.hasPlans ? 'border-[#c8e2df] bg-[#f5fbfa] text-[#176b68]' : 'border-[#eed4a6] bg-[#fff9ed] text-[#8f5f1d]'}`}>
        {scope.hasPlans ? 'แสดงเฉพาะ analyte/test set ที่กำหนดไว้กับเครื่องมือนี้' : 'เครื่องมือนี้ยังไม่มี control plan — แสดง analyte/test set ที่ active ทั้งหมดเพื่อเริ่มกำหนดการรัน'}
      </div>
      <div className="rounded-md border border-[#c8e2df] bg-[#f5fbfa] px-4 py-3 text-sm text-[#176b68]"><strong>Preview:</strong> จะกำหนด {selectedAnalytes.length} analytes และ {requiredLevels.length} levels · policy จะเลือกตามชนิด analyte อัตโนมัติ</div>
      <div className="rounded-md border border-[#e1ebec] p-4">
        <p className="text-xs font-bold tracking-[0.12em] text-[#789097] uppercase">Analytes / levels ที่ชุดนี้จะได้รับผล</p>
        <div className="mt-3 flex flex-wrap gap-2">{selectedAnalytes.map((analyte) => <span key={analyte.id} className="rounded-full border border-[#d9e5e6] bg-white px-2.5 py-1 text-xs text-[#3f5c64]"><span className="mono font-semibold">{analyte.code}</span></span>)}</div>
      </div>
      <div className="space-y-3">
        <div>
          <p className="font-semibold text-[#173d50]">กติกาเริ่มต้นสำหรับ IQC</p>
          <p className="mt-1 text-xs text-[#789097]">ระบบจะแยก policy ตามชนิด analyte อัตโนมัติ: VL ใช้ vl-standard-v1 ส่วน CD4/assay อื่นใช้ cd4-legacy โดยใช้ชุด rule ที่เลือกนี้</p>
        </div>
        <div className="grid gap-2 md:grid-cols-3">
          {ALL_RULES.map((rule) => {
            const help = RULE_HELP[rule]
            return <div key={rule} className="rounded-md border border-[#e1ebec] bg-[#fbfefe] p-3"><span className="mono block text-xs font-bold text-[#173d50]">{help.label}</span><span className="mt-1 block text-[11px] leading-4 text-[#6e878e]">{help.group} · {help.description}</span></div>
          })}
        </div>
        <details className="rounded-md border border-dashed border-[#cfdee0] bg-[#fbfdfd] p-3">
          <summary className="flex min-h-11 cursor-pointer items-center font-semibold text-[#315763] focus-visible:ring-2 focus-visible:ring-[#0b7f76] focus-visible:outline-none">ตัวเลือกขั้นสูง: ปรับ rule ที่จะบันทึก</summary>
          <p className="mt-2 text-xs text-[#789097]">ใช้เมื่อ SOP ของห้องปฏิบัติการกำหนด rule ต่างจาก preset; ระบบจะใช้ policy ที่ตรงกับชนิด analyte และบันทึก rule ที่เลือกกับ control plan</p>
          <div className="mt-3 grid gap-2 md:grid-cols-3">
            {ALL_RULES.map((rule) => {
              const help = RULE_HELP[rule]
              return <label key={rule} className="flex min-h-16 cursor-pointer items-start gap-2 rounded-md border border-[#e1ebec] bg-white p-3 hover:border-[#9ec4c4]"><input type="checkbox" checked={rules.includes(rule)} onChange={() => toggleRule(rule)} className="mt-0.5 size-4 accent-[#0b7f76]" /><span><span className="mono block text-xs font-bold text-[#173d50]">{help.label}</span><span className="mt-1 block text-[11px] leading-4 text-[#6e878e]">{help.group} · {help.description}</span></span></label>
            })}
          </div>
        </details>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#e1ebec] pt-4"><span className="text-xs text-[#789097]">Bulk apply จะมีผลกับ {selectedAnalytes.length} analytes · ระบบเลือก policy ตามชนิด analyte อัตโนมัติ</span><Button disabled={busy} onClick={() => void save()}>{busy ? 'กำลังบันทึก…' : 'บันทึกและไปขั้นถัดไป'}</Button></div>
    </Card>
  )
}

function AdvancedTask({ data }: { data: IqcWorkspace }) {
  const vlCount = data.analytes.filter((analyte) => /-VL\b/i.test(analyte.code)).length
  const vlCodes = new Set(data.analytes.filter((analyte) => /-VL\b/i.test(analyte.code)).map((analyte) => analyte.code))
  const vlTeaCount = data.teaSpecs.filter((tea) => data.analytes.some((analyte) => analyte.id === tea.analyteId && /-VL\b/i.test(analyte.code))).length
  const vlSigmaCount = data.sixSigma.filter((row) => vlCodes.has(row.analyteCode)).length
  return <Card className="space-y-4 p-5"><div><h3 className="font-bold text-[#173d50]">เกณฑ์เพิ่มเติม</h3><p className="mt-1 text-sm text-[#6e878e]">TEa, Six Sigma และ Uncertainty เป็นงานทบทวนขั้นสูง ไม่ทำให้ baseline เปลี่ยนอัตโนมัติ</p></div><div className="grid gap-3 md:grid-cols-3"><div className="rounded-md border border-[#e1ebec] p-4"><p className="text-xs text-[#789097]">TEa</p><p className="mono mt-2 text-2xl font-bold text-[#173d50]">{vlTeaCount}</p><p className="mt-1 text-xs text-[#6e878e]">เกณฑ์ความคลาดเคลื่อนรวม ใช้คำนวณ Six Sigma</p></div><div className="rounded-md border border-[#e1ebec] p-4"><p className="text-xs text-[#789097]">Six Sigma</p><p className="mono mt-2 text-2xl font-bold text-[#173d50]">{vlSigmaCount}</p><p className="mt-1 text-xs text-[#6e878e]">คำนวณใหม่จาก active VL baseline เมื่อมี baseline approved</p></div><div className="rounded-md border border-[#e1ebec] p-4"><p className="text-xs text-[#789097]">Uncertainty</p><p className="mono mt-2 text-2xl font-bold text-[#173d50]">{data.uncertaintyBudgets.length}</p><p className="mt-1 text-xs text-[#6e878e]">baseline เปลี่ยนแล้วต้อง review budget เอง ({vlCount} VL analytes)</p></div></div><Notice tone="info">ระบบไม่ recalibrate Uncertainty อัตโนมัติหลังอนุมัติ baseline เพื่อให้ผู้รับผิดชอบทบทวนผลกระทบก่อน</Notice></Card>
}
