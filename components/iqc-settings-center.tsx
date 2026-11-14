'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowRight,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  CircleOff,
  ClipboardCheck,
  Database,
  FlaskConical,
  Layers3,
  LockKeyhole,
  Pencil,
  Plus,
  ShieldCheck,
  SlidersHorizontal,
  Wrench,
} from 'lucide-react'
import type { BmActor } from '@/lib/bm/types'
import type { IqcBaselineReview, IqcBaselineReviewInput, IqcWorkspace, QcStatus } from '@/lib/iqc/types'
import { getIqcBaselineAnalytesForLot, getIqcBaselineScope } from '@/lib/iqc/baseline-scope'
import { getIqcControlPlanScope } from '@/lib/iqc/control-plan-scope'
import { parseTestSets } from '@/lib/iqc/test-sets'
import { nextIncompleteSetupTask, summarizeSetupHealth } from '@/lib/iqc/setup-health'
import { isAssignedSpecAnalyte, isVlControlLot } from '@/lib/iqc/spec-batch'
import { formatDate } from '@/lib/bm/rules'
import { api, Button, Card, Field, Input, Notice, Select, StatusBadge, type StatusTone, Textarea } from '@/components/ui'
import { ManagedList } from '@/components/managed-list'
import { PortalEquipmentLinker } from '@/components/portal-equipment-linker'

type SetupKey = 'equipment' | 'analyte' | 'lot' | 'spec' | 'baseline' | 'plan' | 'advanced'
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
const CONTROL_LOTS_PER_PAGE = 15

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
  if (taskKey === 'spec') return <SlidersHorizontal className="size-5" aria-hidden="true" />
  if (taskKey === 'baseline') return <ClipboardCheck className="size-5" aria-hidden="true" />
  if (taskKey === 'plan') return <SlidersHorizontal className="size-5" aria-hidden="true" />
  return <Database className="size-5" aria-hidden="true" />
}

function TaskCard({ task, step, selected, notNeeded, onSelect, panelId }: { task: NonNullable<IqcWorkspace['setupHealth']>['tasks'][number]; step: number; selected: boolean; notNeeded?: boolean; onSelect: () => void; panelId: string }) {
  const state = notNeeded ? { label: 'ไม่ต้องใช้', tone: 'not_evaluated' as StatusTone } : taskTone(task.state)
  const blocking = task.dependencies.filter((dependency) => !dependency.done)
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      aria-controls={panelId}
      className={`flex min-h-28 flex-col rounded-lg border p-4 text-left transition duration-200 focus-visible:ring-2 focus-visible:ring-[#0b7f76] focus-visible:outline-none ${selected ? 'border-[#0b7f76] bg-[#f1faf9] shadow-sm' : 'border-[#d9e5e6] bg-white hover:border-[#9ec4c4]'}`}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="flex items-center gap-2">
          <span className={`mono flex size-7 items-center justify-center rounded-full text-xs font-bold ${task.state === 'complete' || notNeeded ? 'bg-[#e6f4f2] text-[#0b7f76]' : 'bg-[#0b7f76] text-white'}`} aria-hidden="true">{step}</span>
          <span className="text-[#0b7f76]"><TaskIcon taskKey={task.key} /></span>
        </span>
        <StatusBadge tone={state.tone} label={state.label} />
      </div>
      <p className="mt-3 font-bold text-[#173d50]">{task.label}</p>
      <p className="mt-1 text-xs leading-5 text-[#58747d]">{notNeeded ? 'ยังไม่มี analyte ที่ต้องใช้ขั้นนี้' : task.nextAction}</p>
      {blocking.length && !notNeeded ? (
        <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-4 text-[#a83541]">
          <CircleAlert className="mt-px size-3.5 shrink-0" aria-hidden="true" />
          <span>ต้องมีก่อน: {blocking.map((dependency) => dependency.label).join(', ')}</span>
        </p>
      ) : null}
    </button>
  )
}

function isSetupKey(value: string | null | undefined): value is SetupKey {
  return value === 'equipment' || value === 'analyte' || value === 'lot' || value === 'spec' || value === 'baseline' || value === 'plan' || value === 'advanced'
}

function defaultSetupHealth(data: IqcWorkspace) {
  const activeLots = data.controlLots.filter((lot) => lot.isActive)
  const cd4QuantitativeAnalytes = data.analytes.filter((analyte) => analyte.isActive && analyte.dataType === 'quantitative' && !/-VL\b/i.test(analyte.code))
  const requiredAssignedSpecKeys = new Set(activeLots.filter((lot) => !isVlControlLot(lot)).flatMap((lot) => cd4QuantitativeAnalytes.map((analyte) => `${lot.id}:${analyte.id}`)))
  const configuredAssignedSpecKeys = new Set(data.specs
    .filter((spec) => requiredAssignedSpecKeys.has(`${spec.controlLotId}:${spec.analyteId}`) && spec.assignedMean != null && spec.assignedSd != null && spec.assignedSd > 0)
    .map((spec) => `${spec.controlLotId}:${spec.analyteId}`))
  const missingAssignedSpecCount = [...requiredAssignedSpecKeys].filter((key) => !configuredAssignedSpecKeys.has(key)).length
  const tasks = [
      { key: 'equipment' as const, label: 'เชื่อมเครื่องมือ', description: 'ใช้ Equipment เป็นแหล่งข้อมูลหลักของเครื่องมือ IQC', state: data.instruments.length ? 'complete' as const : 'blocked' as const, count: data.instruments.length, nextAction: 'ตรวจสอบเครื่องมือ', dependencies: [] },
      { key: 'analyte' as const, label: 'เพิ่ม analyte / ชุดทดสอบ', description: 'เพิ่ม assay และจัดกลุ่ม test set ก่อนกำหนดการรัน', state: data.analytes.some((analyte) => analyte.isActive) ? 'complete' as const : 'attention' as const, count: data.analytes.filter((analyte) => analyte.isActive).length, nextAction: data.analytes.some((analyte) => analyte.isActive) ? 'ตรวจสอบ analyte ที่ใช้งานอยู่' : 'เพิ่ม analyte', dependencies: [] },
      { key: 'lot' as const, label: 'เพิ่ม Control lot', description: 'ผูก Material, lot และ stock ในงานเดียว', state: data.instruments.length > 0 && data.controlLots.length > 0 ? 'complete' as const : 'blocked' as const, count: data.controlLots.length, nextAction: 'เพิ่ม lot', dependencies: [{ label: 'มีเครื่องมือที่เชื่อมจาก Equipment', done: data.instruments.length > 0 }] },
      { key: 'spec' as const, label: 'กำหนด Mean/SD จากผู้ผลิต', description: 'กรอก Assigned mean และ SD ของ Control สำหรับ CD4 ก่อนบันทึกผล', state: !cd4QuantitativeAnalytes.length ? 'complete' as const : !activeLots.length ? 'blocked' as const : missingAssignedSpecCount ? 'attention' as const : 'complete' as const, count: missingAssignedSpecCount || configuredAssignedSpecKeys.size, nextAction: missingAssignedSpecCount ? `กรอก Mean/SD อีก ${missingAssignedSpecCount} รายการ` : 'ตรวจสอบ Mean/SD ที่บันทึกแล้ว', dependencies: [{ label: 'มี CD4 quantitative analyte', done: cd4QuantitativeAnalytes.length > 0 }, { label: 'มี Control lot', done: activeLots.length > 0 }] },
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
  const health = summarizeSetupHealth((data.setupHealth ?? defaultSetupHealth(data)).tasks)
  const vlAnalytes = useMemo(() => data.analytes.filter((analyte) => /-VL\b/i.test(analyte.code) && analyte.dataType === 'quantitative'), [data.analytes])
  const hasAssignedSpecAnalytes = data.analytes.some((analyte) => isAssignedSpecAnalyte(analyte))
  const stepTasks = health.tasks.filter((task) => task.key !== 'equipment' && !task.optional)
  const equipmentTask = health.tasks.find((task) => task.key === 'equipment')
  const advancedTask = health.tasks.find((task) => task.key === 'advanced')
  const [taskKey, setTaskKey] = useState<SetupKey>(() => isSetupKey(initialSetup) ? initialSetup : nextIncompleteSetupTask(health) ?? 'lot')
  const [specLotId, setSpecLotId] = useState<string | null>(initialSetup === 'spec' ? initialLotId ?? null : null)
  const [notice, setNotice] = useState<string | null>(null)
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

  function selectTask(next: SetupKey, extraParams: Record<string, string> = {}) {
    setTaskKey(next)
    setNotice(null)
    const url = new URL(window.location.href)
    url.searchParams.set('setup', next)
    for (const key of ['lot', 'analyte', 'instrument']) if (!(key in extraParams)) url.searchParams.delete(key)
    for (const [key, value] of Object.entries(extraParams)) url.searchParams.set(key, value)
    window.history.replaceState(null, '', url.toString())
    document.getElementById('iqc-setup-panel')?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }

  function selectBaseline(nextLotId: string, nextAnalyteId: string, nextInstrumentId = instrumentId) {
    setLotId(nextLotId)
    setAnalyteId(nextAnalyteId)
    setInstrumentId(nextInstrumentId)
    setTaskKey('baseline')
    const url = new URL(window.location.href)
    url.searchParams.set('setup', 'baseline')
    url.searchParams.set('lot', nextLotId)
    url.searchParams.set('analyte', nextAnalyteId)
    url.searchParams.set('instrument', nextInstrumentId)
    window.history.replaceState(null, '', url.toString())
  }

  // Called after a control lot is created. A CD4 lot cannot be evaluated (or
  // chosen in Lot verification) until its manufacturer Mean/SD exist, so go
  // straight there. A new VL lot needs real QC results before a baseline.
  function afterLotCreated(lot: IqcWorkspace['controlLots'][number]) {
    if (!isVlControlLot(lot) && hasAssignedSpecAnalytes) {
      setSpecLotId(lot.id)
      selectTask('spec', { lot: lot.id })
      return
    }
    setNotice(isVlControlLot(lot)
      ? `เพิ่ม lot ${lot.lotNumber} แล้ว · lot VL ใหม่เริ่มบันทึกผล IQC ได้เลย แล้วกลับมาทบทวน QC baseline เมื่อมีผลครบ 20 ครั้ง`
      : `เพิ่ม lot ${lot.lotNumber} แล้ว · พร้อมบันทึกผล IQC`)
  }

  function afterPlanSaved(next: IqcWorkspace) {
    const nextTask = nextIncompleteSetupTask(summarizeSetupHealth((next.setupHealth ?? defaultSetupHealth(next)).tasks), 'plan')
    if (nextTask) selectTask(nextTask)
    else setNotice('ตั้งค่าครบแล้ว · ไปที่แท็บ “1. บันทึกผล IQC” เพื่อบันทึกผลประจำวัน')
  }

  return (
    <div className="space-y-4">
      <Card className="border-[#c8e2df] bg-[#f5fbfa] p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-xl font-bold text-[#173d50]">ตั้งค่าและทบทวน</h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-[#5f7b83]">ทำตามลำดับ 1 → {stepTasks.length} · ขั้นที่ยังไม่พร้อมจะมีเลขสีเข้ม</p>
          </div>
          <dl className="grid grid-cols-3 gap-2 text-center text-xs">
            <div className="flex flex-col-reverse rounded-md border border-[#c6e2ca] bg-white px-3 py-2"><dt className="text-[#6e878e]">พร้อมใช้</dt><dd className="mono text-lg font-bold text-[#2f7d44]">{health.readyCount}</dd></div>
            <div className="flex flex-col-reverse rounded-md border border-[#eed4a6] bg-white px-3 py-2"><dt className="text-[#6e878e]">ต้องตรวจสอบ</dt><dd className="mono text-lg font-bold text-[#8f5f1d]">{health.attentionCount}</dd></div>
            <div className="flex flex-col-reverse rounded-md border border-[#efc7cc] bg-white px-3 py-2"><dt className="text-[#6e878e]">ยังไม่ครบ</dt><dd className="mono text-lg font-bold text-[#c02a37]">{health.blockedCount}</dd></div>
          </dl>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-[#d6e8e5] pt-3 text-sm">
          <span className="inline-flex items-center gap-1.5 text-[#3f5c64]">
            <Wrench className="size-4 text-[#0b7f76]" aria-hidden="true" />
            {data.instruments.length ? <>เครื่องมือ IQC: <strong className="mono">{data.instruments.length}</strong> เครื่อง</> : <span className="font-semibold text-[#a83541]">ยังไม่มีเครื่องมือ IQC</span>}
          </span>
          <button type="button" onClick={() => selectTask('equipment')} aria-pressed={taskKey === 'equipment'} className="inline-flex min-h-11 items-center gap-1 rounded-md px-2 font-semibold text-[#0b7f76] hover:bg-white focus-visible:ring-2 focus-visible:ring-[#0b7f76] focus-visible:outline-none">จัดการ / เชื่อมกับ Portal <ArrowRight className="size-4" aria-hidden="true" /></button>
          {equipmentTask?.state === 'blocked' ? <span className="text-xs text-[#a83541]">ต้องเชื่อมเครื่องมือก่อนจึงเพิ่ม Control lot ได้</span> : null}
        </div>
      </Card>

      <ol className="grid gap-3 md:grid-cols-2 xl:grid-cols-5" aria-label="ขั้นตอนตั้งค่า IQC">
        {stepTasks.map((task, index) => (
          <li key={task.key} className="flex">
            <TaskCard
              task={task}
              step={index + 1}
              selected={task.key === taskKey}
              notNeeded={(task.key === 'spec' && !hasAssignedSpecAnalytes) || (task.key === 'baseline' && !vlAnalytes.length)}
              panelId="iqc-setup-panel"
              onSelect={() => selectTask(task.key)}
            />
          </li>
        ))}
      </ol>
      {advancedTask ? (
        <div className="flex justify-end">
          <button type="button" onClick={() => selectTask('advanced')} aria-pressed={taskKey === 'advanced'} className="inline-flex min-h-11 items-center gap-1.5 rounded-md px-3 text-sm font-semibold text-[#315763] hover:bg-[#eef6f5] focus-visible:ring-2 focus-visible:ring-[#0b7f76] focus-visible:outline-none">
            <Database className="size-4 text-[#0b7f76]" aria-hidden="true" /> เกณฑ์เพิ่มเติม: TEa, Six Sigma, Uncertainty <span className="font-normal text-[#789097]">(ไม่บังคับ)</span>
          </button>
        </div>
      ) : null}

      {notice ? <Notice tone="success">{notice}</Notice> : null}

      <div id="iqc-setup-panel" role="region" aria-label="รายละเอียดขั้นตอนที่เลือก" aria-live="polite" className="scroll-mt-4">
        {taskKey === 'equipment' ? <EquipmentTask data={data} actor={actor} /> : null}
        {taskKey === 'analyte' ? <AnalyteTask data={data} onOk={onOk} onErr={onErr} onGoToPlan={() => selectTask('plan')} /> : null}
        {taskKey === 'lot' ? <ControlLotTask data={data} onOk={onOk} onErr={onErr} onCreated={afterLotCreated} /> : null}
        {taskKey === 'spec' ? <AssignedSpecTask key={specLotId ?? 'default'} data={data} initialLotId={specLotId} onOk={onOk} onErr={onErr} /> : null}
        {taskKey === 'baseline' ? (
          <BaselineTask data={data} actor={actor} instrumentId={instrumentId} lotId={lotId} analyteId={analyteId} vlAnalytes={vlAnalytes} baselineEligibleInstrumentIds={baselineEligibleInstrumentIds} onSelect={selectBaseline} onOk={onOk} onErr={onErr} />
        ) : null}
        {taskKey === 'plan' ? <ControlPlanTask data={data} onOk={onOk} onErr={onErr} onSaved={afterPlanSaved} /> : null}
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

function AnalyteTask({ data, onOk, onErr, onGoToPlan }: { data: IqcWorkspace; onOk: (text: string, data: IqcWorkspace) => void; onErr: (text: string) => void; onGoToPlan: () => void }) {
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
          <button type="button" onClick={onGoToPlan} className="ml-auto inline-flex min-h-11 items-center rounded-md px-3 py-2 text-sm font-semibold text-[#0b7f76] hover:bg-[#eef6f5] focus-visible:ring-2 focus-visible:ring-[#0b7f76] focus-visible:outline-none">ไปกำหนดการรัน <ArrowRight className="ml-1 size-4" aria-hidden="true" /></button>
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

function EquipmentTask({ data, actor }: { data: IqcWorkspace; actor: BmActor }) {
  const [form, setForm] = useState({ code: '', name: '', model: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function createInstrument(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true); setError('')
    try {
      await api('/api/iqc/instruments', { method: 'POST', body: JSON.stringify(form) })
      window.location.reload()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'เพิ่ม Instrument ไม่สำเร็จ') }
    finally { setBusy(false) }
  }
  async function setInstrumentActive(instrumentId: string, isActive: boolean) {
    setBusy(true); setError('')
    try {
      await api(`/api/iqc/instruments/${instrumentId}`, {
        method: 'PATCH', body: JSON.stringify({ isActive }),
      })
      window.location.reload()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'เปลี่ยนสถานะ Instrument ไม่สำเร็จ') }
    finally { setBusy(false) }
  }
  const candidates = data.instrumentCandidates ?? data.instruments
  return <Card className="space-y-4 p-5">
    <div><h3 className="font-bold text-[#173d50]">เชื่อมเครื่องมือจาก Lab Management Portal</h3>
      <p className="mt-1 text-sm text-[#6e878e]">ทะเบียนเครื่องมืออยู่ใน Portal · IQC จัดเก็บเฉพาะ Instrument ที่ใช้กับการตรวจและความสัมพันธ์กับเครื่องมือจริง</p></div>
    {candidates.map((instrument) => <div key={instrument.id} className="space-y-2 rounded-md border border-[#dbe8e9] bg-white p-3">
      <div className="flex flex-wrap justify-between gap-2"><div><p className="font-semibold text-[#173d50]">{instrument.code} · {instrument.name}</p>
        <p className="text-xs text-[#6e878e]">{instrument.equipmentCode ? `Portal: ${instrument.equipmentCode}` : 'ยังไม่เชื่อมกับ Portal'}</p></div>
        <StatusBadge tone={instrument.equipmentStatus === 'active' ? 'accepted' : 'warning'} label={instrument.equipmentStatus ?? 'ยังไม่เชื่อม'} />
      </div>
      {actor.role === 'Admin' ? <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-[#58747d]">สถานะใน IQC: {instrument.isActive ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}</span>
          <Button type="button" variant="secondary" className="text-xs" disabled={busy}
            onClick={() => setInstrumentActive(instrument.id, !instrument.isActive)}>
            {instrument.isActive ? 'ปิดใช้ IQC Instrument' : 'เปิดใช้ IQC Instrument'}
          </Button>
        </div>
        <PortalEquipmentLinker module="iqc" entityId={instrument.id}
          initialIds={instrument.equipmentId ? [instrument.equipmentId] : []} onSaved={() => window.location.reload()} />
      </div> : null}
    </div>)}
    {!candidates.length ? <Notice tone="warning">ยังไม่มี Instrument สำหรับ IQC</Notice> : null}
    {error ? <Notice tone="danger">{error}</Notice> : null}
    {actor.role === 'Admin' ? <form onSubmit={createInstrument} className="space-y-2 rounded-md border border-[#d8e6e7] p-3">
      <h4 className="text-sm font-bold">เพิ่ม Instrument สำหรับการตั้งค่า IQC</h4>
      <p className="text-xs text-[#58747d]">สร้างเฉพาะ Instrument สำหรับงาน IQC แล้วเลือกเครื่องมือจาก Portal · ไม่ใช่การเพิ่มทะเบียนเครื่องมือใหม่</p>
      <div className="grid gap-2 md:grid-cols-3">
        <Field label="รหัส Instrument"><Input required value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value })} /></Field>
        <Field label="ชื่อ Instrument"><Input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></Field>
        <Field label="Model"><Input value={form.model} onChange={(event) => setForm({ ...form, model: event.target.value })} /></Field>
      </div>
      <Button disabled={busy}>เพิ่ม Instrument</Button>
      {error ? <Notice tone="danger">{error}</Notice> : null}
    </form> : null}
  </Card>
}

function ControlLotTask({ data, onOk, onErr, onCreated }: { data: IqcWorkspace; onOk: (text: string, data: IqcWorkspace) => void; onErr: (text: string) => void; onCreated: (lot: IqcWorkspace['controlLots'][number]) => void }) {
  const [existingMaterialId, setExistingMaterialId] = useState(data.controlMaterials.find((material) => material.isActive)?.id ?? '')
  const [createMaterial, setCreateMaterial] = useState(!data.controlMaterials.length)
  const [materialName, setMaterialName] = useState('')
  const [level, setLevel] = useState('HPC/LPC')
  const [manufacturer, setManufacturer] = useState('Roche')
  const [lotNumber, setLotNumber] = useState('')
  const [expiryDate, setExpiryDate] = useState('')
  const [stockLotId, setStockLotId] = useState('')
  const [equipmentId, setEquipmentId] = useState('')
  const [showAllStock, setShowAllStock] = useState(false)
  const [editingLotId, setEditingLotId] = useState<string | null>(null)
  const [renewFromLot, setRenewFromLot] = useState<IqcWorkspace['controlLots'][number] | null>(null)
  const [showInactiveLots, setShowInactiveLots] = useState(false)
  const [lotPage, setLotPage] = useState(1)
  const [busy, setBusy] = useState(false)

  const editingLot = editingLotId ? data.controlLots.find((lot) => lot.id === editingLotId) : undefined
  const availableMaterials = data.controlMaterials.filter((material) => material.isActive || material.id === editingLot?.controlMaterialId)
  const selectedMaterial = createMaterial ? undefined : availableMaterials.find((material) => material.id === existingMaterialId)
  // A material linked to a stock item narrows the stock lots to that item, so
  // a new shipment is one pick. Unlinked materials keep the full list.
  const materialStockItemId = selectedMaterial?.stockItemId ?? null
  const equipmentStockLots = equipmentId ? data.stockLots.filter((lot) => lot.equipmentIds.includes(equipmentId)) : data.stockLots
  const materialStockLots = materialStockItemId ? equipmentStockLots.filter((lot) => lot.itemId === materialStockItemId) : equipmentStockLots
  const narrowedByMaterial = Boolean(materialStockItemId) && !showAllStock && materialStockLots.length > 0
  const stockLots = narrowedByMaterial ? materialStockLots : equipmentStockLots
  const usedStockLotIds = new Set(data.controlLots.filter((lot) => lot.stockLotId && lot.id !== editingLotId).map((lot) => lot.stockLotId!))
  const activeControlLots = data.controlLots.filter((lot) => lot.isActive)
  const inactiveControlLots = data.controlLots.filter((lot) => !lot.isActive)
  const visibleControlLots = showInactiveLots ? data.controlLots : activeControlLots
  const lotPageCount = Math.max(1, Math.ceil(visibleControlLots.length / CONTROL_LOTS_PER_PAGE))
  const currentLotPage = Math.min(lotPage, lotPageCount)
  const paginatedControlLots = visibleControlLots.slice((currentLotPage - 1) * CONTROL_LOTS_PER_PAGE, currentLotPage * CONTROL_LOTS_PER_PAGE)
  const formTitle = editingLotId ? 'แก้ไข Control lot' : renewFromLot ? `Lot ใหม่ของ ${renewFromLot.controlMaterialName}${renewFromLot.level ? ` · ${renewFromLot.level}` : ''}` : 'เพิ่ม Control lot'

  function resetLotForm() {
    setEditingLotId(null)
    setRenewFromLot(null)
    setCreateMaterial(false)
    setExistingMaterialId(data.controlMaterials.find((material) => material.isActive)?.id ?? '')
    setMaterialName('')
    setLevel('HPC/LPC')
    setManufacturer('Roche')
    setLotNumber('')
    setExpiryDate('')
    setStockLotId('')
    setEquipmentId('')
    setShowAllStock(false)
  }

  function focusForm() {
    window.setTimeout(() => {
      document.getElementById('iqc-lot-form')?.scrollIntoView({ block: 'start', behavior: 'smooth' })
      document.getElementById('iqc-lot-stock')?.focus({ preventScroll: true })
    }, 0)
  }

  function startEditingLot(lot: IqcWorkspace['controlLots'][number]) {
    setEditingLotId(lot.id)
    setRenewFromLot(null)
    setCreateMaterial(false)
    setExistingMaterialId(lot.controlMaterialId)
    setMaterialName('')
    setLevel(lot.level ?? 'HPC/LPC')
    setManufacturer('Roche')
    setLotNumber(lot.lotNumber)
    setExpiryDate(lot.expiryDate ?? '')
    setStockLotId(lot.stockLotId ?? '')
    setEquipmentId('')
    setShowAllStock(false)
    focusForm()
  }

  function startRenewLot(lot: IqcWorkspace['controlLots'][number]) {
    resetLotForm()
    setRenewFromLot(lot)
    setExistingMaterialId(lot.controlMaterialId)
    focusForm()
  }

  function selectStockLot(value: string) {
    const stockLot = data.stockLots.find((lot) => lot.id === value)
    setStockLotId(value)
    if (stockLot) {
      setLotNumber(stockLot.lotNumber)
      setExpiryDate(stockLot.expiryDate ?? '')
    }
  }

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
      const lotPayload = { controlMaterialId, lotNumber: lotNumber.trim() || stockLot?.lotNumber, expiryDate: expiryDate || stockLot?.expiryDate || null, stockLotId: stockLotId || null }
      if (editingLotId) {
        const lotResult = await api<{ iqc: IqcWorkspace }>(`/api/iqc/lots/${editingLotId}`, { method: 'PATCH', body: JSON.stringify(lotPayload) })
        onOk('แก้ไข Control lot และการเชื่อมโยงกับ Stock แล้ว', lotResult.iqc)
        resetLotForm()
      } else {
        const previousLotIds = new Set(nextData.controlLots.map((lot) => lot.id))
        const lotResult = await api<{ iqc: IqcWorkspace }>('/api/iqc/lots', { method: 'POST', body: JSON.stringify(lotPayload) })
        onOk('เพิ่ม Control lot และบันทึกความเชื่อมโยงกับ Stock แล้ว', lotResult.iqc)
        const created = lotResult.iqc.controlLots.find((lot) => !previousLotIds.has(lot.id) && lot.controlMaterialId === controlMaterialId)
        resetLotForm()
        if (created) onCreated(created)
      }
    } catch (error) {
      onErr(error instanceof Error ? error.message : 'เพิ่ม Control lot ไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="space-y-4 p-5">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="font-bold text-[#173d50]">{formTitle}</h3>
          <p className="mt-1 text-sm text-[#6e878e]">{renewFromLot ? 'Material และระดับเดิมเลือกไว้แล้ว เลือก lot จาก Stock หรือกรอกเลข lot ใหม่' : 'lot ใหม่ของ Control เดิม กด “ต่อ lot ใหม่” ในตารางด้านล่างได้เลย'}</p>
        </div>
        {renewFromLot || editingLotId ? <StatusBadge tone="investigate" label={editingLotId ? 'กำลังแก้ไข' : 'ต่อ lot ใหม่'} /> : null}
      </div>
      <form id="iqc-lot-form" className="scroll-mt-4 space-y-4" onSubmit={submit}>
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="Material" hint="ชนิด Control และระดับ">
            <Select value={createMaterial ? '__new__' : existingMaterialId} onChange={(event) => { const value = event.target.value; setCreateMaterial(value === '__new__'); setShowAllStock(false); if (value !== '__new__') setExistingMaterialId(value) }}>
              <option value="">เลือก Material ที่มีอยู่</option>
              {availableMaterials.map((material) => <option key={material.id} value={material.id}>{material.name}{material.level ? ` · ${material.level}` : ''}</option>)}
              <option value="__new__" disabled={Boolean(editingLotId)}>+ เพิ่ม Material ใหม่</option>
            </Select>
          </Field>
          {createMaterial ? <Field label="ชื่อ Material ใหม่" hint="เช่น HIV-VL Control"><Input value={materialName} onChange={(event) => setMaterialName(event.target.value)} required /></Field> : null}
          {createMaterial ? <Field label="ระดับ" hint="HPC/LPC/Normal"><Select value={level} onChange={(event) => setLevel(event.target.value)}><option>HPC/LPC</option><option>HPC</option><option>LPC</option><option>Normal</option></Select></Field> : null}
          {createMaterial ? <Field label="ผู้ผลิต"><Input value={manufacturer} onChange={(event) => setManufacturer(event.target.value)} /></Field> : null}
        </div>
        <Field label="เลือก lot จาก Stock" hint={narrowedByMaterial ? `แสดงเฉพาะ lot ของ stock item ที่ผูกกับ ${selectedMaterial?.name ?? 'Material นี้'} · เลข lot และ expiry จะเติมให้อัตโนมัติ` : 'เลข lot และ expiry จะเติมให้อัตโนมัติ และช่วยกันลบ lot ที่ถูกใช้ในคลัง'}>
          <Select id="iqc-lot-stock" value={stockLotId} onChange={(event) => selectStockLot(event.target.value)}>
            <option value="">ไม่เชื่อม Stock / กรอกเลข lot เอง</option>
            {stockLots.map((lot) => <option key={lot.id} value={lot.id}>{lot.itemCode} · {lot.itemName} · LOT {lot.lotNumber}{lot.expiryDate ? ` · exp ${lot.expiryDate}` : ''}{usedStockLotIds.has(lot.id) ? ' · ใช้แล้ว' : ''}</option>)}
          </Select>
        </Field>
        {materialStockItemId && materialStockLots.length ? (
          <button type="button" onClick={() => setShowAllStock((value) => !value)} className="-mt-2 min-h-11 rounded-md px-2 text-xs font-semibold text-[#0b7f76] hover:bg-[#eef6f5] focus-visible:ring-2 focus-visible:ring-[#0b7f76] focus-visible:outline-none">
            {showAllStock ? 'แสดงเฉพาะ lot ของ Material นี้' : 'แสดง Stock lot ทั้งหมด'}
          </button>
        ) : null}
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="เลข Control lot" hint={stockLotId ? 'มาจาก Stock lot ที่เลือก' : undefined}><Input value={lotNumber} onChange={(event) => setLotNumber(event.target.value)} readOnly={Boolean(stockLotId)} /></Field>
          <Field label="Expiry" hint={stockLotId ? 'มาจาก Stock lot ที่เลือก' : undefined}><Input type="date" value={expiryDate} onChange={(event) => setExpiryDate(event.target.value)} readOnly={Boolean(stockLotId)} /></Field>
          {!narrowedByMaterial ? <Field label="กรอง Stock ตามเครื่องมือ" hint="ไม่บังคับ"><Select value={equipmentId} onChange={(event) => setEquipmentId(event.target.value)}><option value="">ทุกเครื่องมือ</option>{data.instruments.filter((instrument) => instrument.isActive && instrument.equipmentId).map((instrument) => <option key={instrument.id} value={instrument.equipmentId!}>{instrument.code} · {instrument.name}</option>)}</Select></Field> : null}
        </div>
        <div className="flex flex-wrap items-center gap-3 border-t border-[#e1ebec] pt-3">
          <Button disabled={busy}>{busy ? 'กำลังบันทึก…' : editingLotId ? 'บันทึกการแก้ไข' : 'บันทึก Control lot'}</Button>
          {editingLotId || renewFromLot ? <Button type="button" variant="ghost" disabled={busy} onClick={resetLotForm}>ยกเลิก</Button> : null}
          {!editingLotId ? <span role="status" className="text-xs text-[#789097]">บันทึกแล้วระบบจะพาไปกรอก Mean/SD ของ lot นี้ (CD4)</span> : null}
        </div>
      </form>
      <div className="space-y-2 border-t border-[#e1ebec] pt-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h4 className="font-bold text-[#173d50]">Control lot ที่มีอยู่</h4>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <span className="mono text-xs text-[#789097]">{showInactiveLots ? `${data.controlLots.length} รายการ` : `${activeControlLots.length} รายการใช้งาน`}</span>
            {inactiveControlLots.length ? <Button type="button" variant="ghost" className="min-h-8 px-2 py-1 text-xs" onClick={() => { setShowInactiveLots((value) => !value); setLotPage(1) }}>{showInactiveLots ? 'ซ่อน lot ที่ปิดใช้งาน' : `แสดง lot ที่ปิดใช้งาน (${inactiveControlLots.length})`}</Button> : null}
          </div>
        </div>
        {visibleControlLots.length ? (
          <>
            <div className="overflow-x-auto rounded-md border border-[#e1ebec]">
              <table className="w-full min-w-[820px] text-left text-xs">
                <thead className="bg-[#f7fbfb] text-[#789097]">
                  <tr><th className="px-3 py-2">Material</th><th className="px-3 py-2">ระดับ</th><th className="px-3 py-2">Control lot</th><th className="px-3 py-2">Expiry</th><th className="px-3 py-2">Stock</th><th className="px-3 py-2">สถานะ</th><th className="px-3 py-2"><span className="sr-only">จัดการ</span></th></tr>
                </thead>
                <tbody className="divide-y divide-[#edf2f2] text-[#3f5c64]">
                  {paginatedControlLots.map((lot) => {
                    const materialActive = data.controlMaterials.some((material) => material.id === lot.controlMaterialId && material.isActive)
                    return (
                      <tr key={lot.id} className={lot.isActive ? '' : 'bg-[#fbfcfc] text-[#91a3a7]'}>
                        <td className="px-3 py-2.5 font-semibold text-[#315763]">{lot.controlMaterialName}</td>
                        <td className="px-3 py-2.5">{lot.level ?? '—'}</td>
                        <td className="mono px-3 py-2.5 font-semibold">{lot.lotNumber}</td>
                        <td className="px-3 py-2.5">{lot.expiryDate ? formatDate(lot.expiryDate) : '—'}</td>
                        <td className="px-3 py-2.5">{lot.stockLotId ? <span className="text-[#2f7d44]">เชื่อมแล้ว</span> : <span className="text-[#789097]">กรอกเอง</span>}</td>
                        <td className="px-3 py-2.5"><StatusBadge tone={lot.isActive ? 'accepted' : 'not_evaluated'} label={lot.isActive ? 'ใช้งาน' : 'ปิดใช้งาน'} /></td>
                        <td className="px-3 py-1.5">
                          <div className="flex justify-end gap-1">
                            {materialActive ? <Button type="button" variant="secondary" className="gap-1 px-2.5 text-xs" disabled={busy} onClick={() => startRenewLot(lot)} aria-label={`ต่อ lot ใหม่ของ ${lot.controlMaterialName}${lot.level ? ` ${lot.level}` : ''}`}><Plus className="size-3.5" aria-hidden="true" />ต่อ lot ใหม่</Button> : null}
                            <Button type="button" variant="ghost" className="gap-1 px-2 text-xs" disabled={busy} onClick={() => startEditingLot(lot)} aria-label={`แก้ไข lot ${lot.lotNumber}`}><Pencil className="size-3.5" aria-hidden="true" />แก้ไข</Button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {lotPageCount > 1 ? <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#789097]">
              <span>แสดง {(currentLotPage - 1) * CONTROL_LOTS_PER_PAGE + 1}–{Math.min(currentLotPage * CONTROL_LOTS_PER_PAGE, visibleControlLots.length)} จาก {visibleControlLots.length} รายการ</span>
              <div className="flex items-center gap-1">
                <Button type="button" variant="ghost" className="min-h-8 gap-1 px-2 py-1 text-xs" disabled={currentLotPage === 1} onClick={() => setLotPage((page) => Math.max(1, page - 1))}><ChevronLeft className="size-3.5" aria-hidden="true" />ก่อนหน้า</Button>
                <span className="px-2">หน้า {currentLotPage} / {lotPageCount}</span>
                <Button type="button" variant="ghost" className="min-h-8 gap-1 px-2 py-1 text-xs" disabled={currentLotPage === lotPageCount} onClick={() => setLotPage((page) => Math.min(lotPageCount, page + 1))}>ถัดไป<ChevronRight className="size-3.5" aria-hidden="true" /></Button>
              </div>
            </div> : null}
          </>
        ) : data.controlLots.length ? <Notice tone="info">ไม่มี Control lot ที่ใช้งานอยู่ — กดปุ่มแสดง lot ที่ปิดใช้งานเพื่อดูรายการทั้งหมด</Notice> : <Notice tone="info">ยังไม่มี Control lot — เพิ่มรายการแรกได้จากฟอร์มด้านบน</Notice>}
      </div>
    </Card>
  )
}

type SpecDraftRow = { mean: string; sd: string }

function specDraftFor(data: IqcWorkspace, controlLotId: string, analyteIds: string[]) {
  return Object.fromEntries(analyteIds.map((analyteId) => {
    const spec = data.specs.find((item) => item.controlLotId === controlLotId && item.analyteId === analyteId)
    return [analyteId, { mean: spec?.assignedMean == null ? '' : String(spec.assignedMean), sd: spec?.assignedSd == null ? '' : String(spec.assignedSd) }]
  })) as Record<string, SpecDraftRow>
}

function AssignedSpecTask({ data, initialLotId, onOk, onErr }: { data: IqcWorkspace; initialLotId?: string | null; onOk: (text: string, data: IqcWorkspace) => void; onErr: (text: string) => void }) {
  const activeLots = data.controlLots.filter((lot) => lot.isActive && !isVlControlLot(lot))
  const cd4Analytes = data.analytes.filter((analyte) => isAssignedSpecAnalyte(analyte))
  const cd4AnalyteIds = cd4Analytes.map((analyte) => analyte.id)
  const isComplete = (controlLotId: string, analyteId: string) => {
    const spec = data.specs.find((item) => item.controlLotId === controlLotId && item.analyteId === analyteId)
    return spec?.assignedMean != null && spec.assignedSd != null && spec.assignedSd > 0
  }
  const missingCount = (controlLotId: string) => cd4AnalyteIds.filter((analyteId) => !isComplete(controlLotId, analyteId)).length
  const firstLotId = (initialLotId && activeLots.some((lot) => lot.id === initialLotId) ? initialLotId : undefined)
    ?? activeLots.find((lot) => missingCount(lot.id) > 0)?.id
    ?? activeLots[0]?.id
    ?? ''
  const [controlLotId, setControlLotId] = useState(firstLotId)
  const [draft, setDraft] = useState<Record<string, SpecDraftRow>>(() => specDraftFor(data, firstLotId, cd4AnalyteIds))
  const [changeReason, setChangeReason] = useState('')
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const selectedLot = activeLots.find((lot) => lot.id === controlLotId)

  const rows = cd4Analytes.map((analyte) => {
    const spec = data.specs.find((item) => item.controlLotId === controlLotId && item.analyteId === analyte.id)
    const value = draft[analyte.id] ?? { mean: '', sd: '' }
    const savedMean = spec?.assignedMean == null ? '' : String(spec.assignedMean)
    const savedSd = spec?.assignedSd == null ? '' : String(spec.assignedSd)
    const dirty = value.mean.trim() !== savedMean || value.sd.trim() !== savedSd
    const filled = Boolean(value.mean.trim() || value.sd.trim())
    return { analyte, spec, value, dirty: dirty && filled, isChange: Boolean(spec) && dirty && filled }
  })
  const pendingRows = rows.filter((row) => row.dirty)
  const needsReason = pendingRows.some((row) => row.isChange)
  const savedCount = rows.filter((row) => controlLotId && isComplete(controlLotId, row.analyte.id)).length

  function selectLot(nextId: string) {
    if (pendingRows.length && !window.confirm('มีค่าที่ยังไม่บันทึก ต้องการเปลี่ยน Control lot หรือไม่')) return
    setControlLotId(nextId)
    setDraft(specDraftFor(data, nextId, cd4AnalyteIds))
    setRowErrors({})
    setChangeReason('')
  }

  function update(analyteId: string, field: keyof SpecDraftRow, value: string) {
    setDraft((current) => ({ ...current, [analyteId]: { ...(current[analyteId] ?? { mean: '', sd: '' }), [field]: value } }))
    setRowErrors((current) => {
      if (!current[analyteId]) return current
      const next = { ...current }
      delete next[analyteId]
      return next
    })
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!controlLotId) return onErr('เลือก Control lot ก่อนบันทึก')
    if (!pendingRows.length) return onErr('ยังไม่มีค่าที่เปลี่ยนแปลง')
    const errors: Record<string, string> = {}
    const items = pendingRows.map((row) => {
      const mean = Number(row.value.mean)
      const sd = Number(row.value.sd)
      if (!row.value.mean.trim() || !Number.isFinite(mean)) errors[row.analyte.id] = 'กรอก Mean เป็นตัวเลข'
      else if (!row.value.sd.trim() || !Number.isFinite(sd) || sd <= 0) errors[row.analyte.id] = 'SD ต้องเป็นตัวเลขมากกว่า 0'
      return { analyteId: row.analyte.id, assignedMean: mean, assignedSd: sd }
    })
    setRowErrors(errors)
    const firstError = Object.keys(errors)[0]
    if (firstError) {
      document.getElementById(`spec-mean-${firstError}`)?.focus()
      return onErr(`ตรวจค่า ${Object.keys(errors).length} แถวที่ไม่ถูกต้อง`)
    }
    if (needsReason && !changeReason.trim()) {
      document.getElementById('spec-change-reason')?.focus()
      return onErr('ระบุเหตุผลเมื่อแก้ไข Mean/SD เดิม')
    }
    setBusy(true)
    try {
      const result = await api<{ iqc: IqcWorkspace }>('/api/iqc/specs/batch', {
        method: 'POST',
        body: JSON.stringify({ controlLotId, changeReason: changeReason.trim() || null, items }),
      })
      onOk(`บันทึก Mean/SD ${items.length} รายการของ lot ${selectedLot?.lotNumber ?? ''} แล้ว`, result.iqc)
      setDraft(specDraftFor(result.iqc, controlLotId, cd4AnalyteIds))
      setChangeReason('')
    } catch (error) {
      onErr(error instanceof Error ? error.message : 'บันทึก Mean/SD ไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  if (!activeLots.length || !cd4Analytes.length) {
    return (
      <Card className="space-y-3 p-5">
        <h3 className="font-bold text-[#173d50]">Mean/SD จากผู้ผลิต (CD4)</h3>
        <Notice tone="warning">ต้องมี CD4 quantitative analyte และ Control lot ของ CD4 ที่เปิดใช้งานก่อน</Notice>
      </Card>
    )
  }

  return (
    <Card className="space-y-4 p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="font-bold text-[#173d50]">Mean/SD จากผู้ผลิต (CD4)</h3>
          <p className="mt-1 max-w-3xl text-sm text-[#6e878e]">กรอกตาม certificate ของผู้ผลิตให้ครบทุก analyte ของ lot แล้วบันทึกครั้งเดียว ค่านี้ใช้ประเมิน Westgard ของ CD4 และใช้เลือก lot ใน Lot verification</p>
        </div>
        <StatusBadge tone={savedCount === rows.length ? 'accepted' : 'warning'} label={`บันทึกแล้ว ${savedCount}/${rows.length}`} />
      </div>
      <form className="space-y-4" onSubmit={submit} noValidate>
        <Field label="Control lot" hint="lot ที่ยังกรอกไม่ครบแสดงจำนวนที่ขาด">
          <Select value={controlLotId} onChange={(event) => selectLot(event.target.value)} className="md:max-w-xl">
            {activeLots.map((lot) => {
              const missing = missingCount(lot.id)
              return <option key={lot.id} value={lot.id}>{lot.controlMaterialName}{lot.level ? ` · ${lot.level}` : ''} · {lot.lotNumber}{missing ? ` · ขาด ${missing}` : ' · ครบแล้ว'}</option>
            })}
          </Select>
        </Field>
        <div className="overflow-x-auto rounded-md border border-[#e1ebec]">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-[#f7fbfb] text-xs text-[#789097]">
              <tr><th scope="col" className="px-3 py-2">Analyte</th><th scope="col" className="px-3 py-2">Assigned mean</th><th scope="col" className="px-3 py-2">Assigned SD</th><th scope="col" className="px-3 py-2">สถานะ</th></tr>
            </thead>
            <tbody className="divide-y divide-[#edf2f2]">
              {rows.map(({ analyte, value, dirty, isChange }) => {
                const error = rowErrors[analyte.id]
                const complete = isComplete(controlLotId, analyte.id)
                const errorId = `spec-error-${analyte.id}`
                return (
                  <tr key={analyte.id} className={error ? 'bg-[#fff7f8]' : dirty ? 'bg-[#fffbf2]' : ''}>
                    <th scope="row" className="px-3 py-2 align-top font-normal">
                      <span className="mono block font-semibold text-[#173d50]">{analyte.code}</span>
                      <span className="text-xs text-[#789097]">{analyte.unit ?? analyte.name}</span>
                    </th>
                    <td className="px-3 py-2 align-top">
                      <Input id={`spec-mean-${analyte.id}`} className="mono w-36 tabular-nums" type="number" step="any" inputMode="decimal" aria-label={`Assigned mean ${analyte.code}`} aria-invalid={Boolean(error)} aria-describedby={error ? errorId : undefined} value={value.mean} onChange={(event) => update(analyte.id, 'mean', event.target.value)} />
                    </td>
                    <td className="px-3 py-2 align-top">
                      <Input className="mono w-36 tabular-nums" type="number" step="any" min="0" inputMode="decimal" aria-label={`Assigned SD ${analyte.code}`} aria-invalid={Boolean(error)} aria-describedby={error ? errorId : undefined} value={value.sd} onChange={(event) => update(analyte.id, 'sd', event.target.value)} />
                      {error ? <p id={errorId} className="mt-1 text-xs font-semibold text-[#a83541]">{error}</p> : null}
                    </td>
                    <td className="px-3 py-2 align-top">
                      <StatusBadge tone={dirty ? 'warning' : complete ? 'accepted' : 'not_evaluated'} label={dirty ? (isChange ? 'แก้ไข · ยังไม่บันทึก' : 'ใหม่ · ยังไม่บันทึก') : complete ? 'บันทึกแล้ว' : 'ยังไม่กรอก'} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {needsReason ? (
          <Field label="เหตุผลที่แก้ไขค่าเดิม" hint="บันทึกลง audit trail ของทุกแถวที่แก้">
            <Input id="spec-change-reason" value={changeReason} onChange={(event) => setChangeReason(event.target.value)} placeholder="เช่น แก้ตาม certificate ผู้ผลิตฉบับใหม่" className="md:max-w-xl" />
          </Field>
        ) : null}
        <div className="flex flex-wrap items-center gap-3 border-t border-[#e1ebec] pt-3">
          <Button disabled={busy || !pendingRows.length}>{busy ? 'กำลังบันทึก…' : pendingRows.length ? `บันทึก ${pendingRows.length} รายการ` : 'บันทึก'}</Button>
          {pendingRows.length ? <Button type="button" variant="ghost" disabled={busy} onClick={() => { setDraft(specDraftFor(data, controlLotId, cd4AnalyteIds)); setRowErrors({}); setChangeReason('') }}>ยกเลิกการแก้ไข</Button> : null}
          <span role="status" className="text-xs text-[#789097]">{pendingRows.length ? `มี ${pendingRows.length} แถวที่ยังไม่บันทึก` : 'ไม่มีค่าที่ค้างบันทึก'}</span>
        </div>
      </form>
    </Card>
  )
}

function BaselineTask({ data, actor, instrumentId, lotId, analyteId, vlAnalytes, baselineEligibleInstrumentIds, onSelect, onOk, onErr }: { data: IqcWorkspace; actor: BmActor; instrumentId: string; lotId: string; analyteId: string; vlAnalytes: IqcWorkspace['analytes']; baselineEligibleInstrumentIds: ReadonlySet<string>; onSelect: (lotId: string, analyteId: string, instrumentId?: string) => void; onOk: (text: string, data: IqcWorkspace) => void; onErr: (text: string) => void }) {
  const baselineScope = getIqcBaselineScope(data, vlAnalytes, instrumentId)
  const activeLots = baselineScope.controlLots
  const scopedAnalytes = baselineScope.analytes
  const hasBaselineScope = scopedAnalytes.length > 0 || activeLots.length > 0
  const candidateCount = (controlLotId: string, rowAnalyteId: string) => data.runs
    .filter((run) => run.instrumentId === instrumentId)
    .reduce((count, run) => count + run.results.filter((result) => result.controlLotId === controlLotId && result.analyteId === rowAnalyteId && !result.isVoided).length, 0)
  // Every lot × analyte of the instrument in one table; rows that can be
  // reviewed now come first, approved ones last. The row button is the only
  // way to choose what to review.
  const matrixRows = activeLots.flatMap((lot) => getIqcBaselineAnalytesForLot(data, scopedAnalytes, instrumentId, lot).map((analyte) => {
    const spec = data.specs.find((item) => item.controlLotId === lot.id && item.analyteId === analyte.id)
    const baseline = data.baselines?.find((item) => item.controlLotId === lot.id && item.analyteId === analyte.id && item.instrumentId === instrumentId && item.state === 'approved')
    const candidateN = candidateCount(lot.id, analyte.id)
    const ready = !baseline && candidateN >= (analyte.dataType === 'qualitative' ? 1 : 20)
    const rank = ready ? 0 : baseline?.baselineType === 'observed_seed' ? 1 : !baseline ? 2 : 3
    return { lot, analyte, spec, baseline, candidateN, ready, rank }
  })).sort((a, b) => a.rank - b.rank || a.lot.lotNumber.localeCompare(b.lot.lotNumber) || a.analyte.code.localeCompare(b.analyte.code))
  const selectedRow = matrixRows.find((row) => row.lot.id === lotId && row.analyte.id === analyteId) ?? matrixRows[0]
  const effectiveLotId = selectedRow?.lot.id ?? ''
  const effectiveAnalyteId = selectedRow?.analyte.id ?? ''
  const readyCount = matrixRows.filter((row) => row.ready).length

  function changeInstrument(nextInstrumentId: string) {
    onSelect('', '', nextInstrumentId)
  }

  return (
    <div className="space-y-4">
      <Card className="space-y-4 p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h3 className="font-bold text-[#173d50]">QC baseline (VL)</h3>
            <p className="mt-1 max-w-3xl text-sm text-[#6e878e]">เกณฑ์ตัดสิน VL มาจากผล QC จริงของห้องปฏิบัติการ เลือกเครื่องมือ แล้วกด “ทบทวน” ในแถวที่ต้องการ ค่า CoA ใช้เป็นข้อมูลอ้างอิงเท่านั้น</p>
          </div>
          <div className="flex items-center gap-2 text-xs text-[#5b7681]"><ShieldCheck className="size-4 text-[#0b7f76]" aria-hidden="true" /> Admin เท่านั้นที่กดใช้ baseline ได้</div>
        </div>
        <Field label="เครื่องมือ" hint="baseline แยกตามเครื่องมือ">
          <Select className="md:max-w-md" value={instrumentId} onChange={(event) => changeInstrument(event.target.value)}>
            <option value="">เลือกเครื่องมือ</option>
            {data.instruments.filter((instrument) => instrument.isActive).map((instrument) => <option key={instrument.id} value={instrument.id}>{instrument.code} · {instrument.name}{!baselineEligibleInstrumentIds.has(instrument.id) ? ' · ไม่มี VL baseline' : ''}</option>)}
          </Select>
        </Field>
        {!hasBaselineScope && instrumentId ? <Notice tone="info">เครื่องมือนี้ไม่มี VL control plan หรือผล VL ที่ใช้ทำ baseline · สำหรับ FACSLyric/CD4 ให้ใช้ “Mean/SD จากผู้ผลิต” แทน</Notice> : null}
        <details className="rounded-md border border-dashed border-[#cfdee0] bg-[#fbfdfd] px-3 py-2 text-xs text-[#58747d]">
          <summary className="flex min-h-11 cursor-pointer items-center gap-2 font-semibold text-[#315763] focus-visible:ring-2 focus-visible:ring-[#0b7f76] focus-visible:outline-none"><ClipboardCheck className="size-4 text-[#0b7f76]" aria-hidden="true" />วิธีทำ Baseline Review</summary>
          <ol className="mt-1 list-decimal space-y-1 pb-2 pl-5 leading-5">
            <li>ใช้กับ VL แบบ quantitative เท่านั้น (VL Normal ใช้ expected result ไม่ต้องทำ baseline)</li>
            <li>ต้องมีผล QC อย่างน้อย 20 ครั้งต่อระดับ จึงจะใช้ baseline ได้</li>
            <li>ตรวจผลรายครั้ง เอาผลที่ไม่ควรรวมออกพร้อมเหตุผล แล้วให้ Admin กด “คำนวณและใช้ค่า baseline”</li>
          </ol>
        </details>
      </Card>
      {instrumentId && hasBaselineScope ? (
        <Card className="overflow-hidden p-0">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#e1ebec] px-5 py-4">
            <h4 className="font-bold text-[#173d50]">Lot × ระดับ ของเครื่องนี้</h4>
            <span className="text-xs text-[#58747d]">{readyCount ? <><strong className="mono text-[#8f5f1d]">{readyCount}</strong> แถวพร้อมทบทวน · </> : null}<span className="mono">{matrixRows.length}</span> แถว</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-xs">
              <thead className="bg-[#f7fbfb] text-[#789097]"><tr><th scope="col" className="px-4 py-3">Assay / ระดับ</th><th scope="col" className="px-4 py-3">Control lot</th><th scope="col" className="px-4 py-3">CoA</th><th scope="col" className="px-4 py-3">ผล QC</th><th scope="col" className="px-4 py-3">สถานะ baseline</th><th scope="col" className="px-4 py-3"><span className="sr-only">ทบทวน</span></th></tr></thead>
              <tbody className="divide-y divide-[#edf2f2] text-[#3f5c64]">
                {matrixRows.map(({ lot, analyte, spec, baseline, candidateN, ready }) => {
                  const isOpen = lot.id === effectiveLotId && analyte.id === effectiveAnalyteId
                  return (
                    <tr key={`${lot.id}:${analyte.id}`} className={isOpen ? 'bg-[#f1faf9]' : ''}>
                      <td className="px-4 py-2.5"><span className="mono font-semibold text-[#173d50]">{analyte.code}</span><span className="ml-2 text-[#789097]">{analyte.dataType === 'qualitative' ? 'Normal' : lot.level ?? '—'}</span></td>
                      <td className="mono px-4 py-2.5">{lot.lotNumber}</td>
                      <td className="px-4 py-2.5">{spec?.manufacturerLower != null && spec.manufacturerUpper != null ? <span className="mono">{fmt(spec.manufacturerLower)}–{fmt(spec.manufacturerUpper)}</span> : <span className="text-[#7d9297]">ไม่มี CoA</span>}</td>
                      <td className="mono px-4 py-2.5">{candidateN}</td>
                      <td className="px-4 py-2.5">{baseline ? <StatusBadge tone={baseline.baselineType === 'observed_seed' ? 'investigate' : 'accepted'} label={baseline.baselineType === 'observed_seed' ? `Observed seed v${baseline.version}` : `Approved v${baseline.version}`} /> : ready ? <StatusBadge tone="warning" label="พร้อมทบทวน" /> : <StatusBadge tone="not_evaluated" label={`ผลยังไม่ครบ ${candidateN}/20`} />}</td>
                      <td className="px-4 py-1.5 text-right"><Button type="button" variant={isOpen ? 'ghost' : 'secondary'} aria-pressed={isOpen} onClick={() => onSelect(lot.id, analyte.id)}>{isOpen ? 'กำลังดูอยู่' : 'ทบทวน'}</Button></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}
      {selectedRow && instrumentId ? <BaselineReviewPanel key={`${effectiveLotId}:${effectiveAnalyteId}:${instrumentId}:${selectedRow.baseline?.id ?? 'none'}`} actor={actor} controlLotId={effectiveLotId} analyteId={effectiveAnalyteId} instrumentId={instrumentId} onOk={onOk} onErr={onErr} /> : !instrumentId ? <Notice tone="info">เลือกเครื่องมือเพื่อดูรายการที่ทำ baseline ได้</Notice> : null}
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

function ControlPlanTask({ data, onOk, onErr, onSaved }: { data: IqcWorkspace; onOk: (text: string, data: IqcWorkspace) => void; onErr: (text: string) => void; onSaved: (next: IqcWorkspace) => void }) {
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
      onSaved(result.iqc)
    } catch (error) { onErr(error instanceof Error ? error.message : 'บันทึกกำหนดการรันไม่สำเร็จ') } finally { setBusy(false) }
  }

  return (
    <Card className="space-y-5 p-5">
      <div>
        <h3 className="font-bold text-[#173d50]">กำหนดการรัน</h3>
        <p className="mt-1 text-sm text-[#6e878e]">บอกระบบว่าเครื่องนี้รัน control ของ test set ไหน หน้าบันทึกผลจะเตรียมรายการให้ตามนี้</p>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <Field label="เครื่องมือ"><Select value={instrumentId} onChange={(event) => changeInstrument(event.target.value)}><option value="">เลือกเครื่องมือ</option>{data.instruments.filter((instrument) => instrument.isActive).map((instrument) => <option key={instrument.id} value={instrument.id}>{instrument.code} · {instrument.name}</option>)}</Select></Field>
        <Field label="Test set"><Select value={activeTestSet} onChange={(event) => setTestSet(event.target.value)}><option value="">ทุก test set</option>{scope.testSets.map((set) => <option key={set} value={set}>{set}</option>)}</Select></Field>
        <Field label="ความถี่"><Select value={frequency} onChange={(event) => setFrequency(event.target.value as 'daily' | 'per-run')}><option value="daily">ทุกวัน</option><option value="per-run">ทุก run</option></Select></Field>
      </div>
      <div className="rounded-md border border-[#c8e2df] bg-[#f5fbfa] p-4">
        <p className="text-sm text-[#176b68]">จะกำหนด <strong className="mono">{selectedAnalytes.length}</strong> analyte{requiredLevels.length ? <> · ระดับ <strong>{requiredLevels.join(', ')}</strong></> : null}</p>
        <div className="mt-2 flex flex-wrap gap-1.5">{selectedAnalytes.map((analyte) => <span key={analyte.id} className="mono rounded-full border border-[#d9e5e6] bg-white px-2.5 py-1 text-xs font-semibold text-[#3f5c64]">{analyte.code}</span>)}</div>
        {!scope.hasPlans && instrumentId ? <p className="mt-2 text-xs text-[#8f5f1d]">เครื่องนี้ยังไม่มีกำหนดการรัน จึงแสดง test set ที่ใช้งานทั้งหมด</p> : null}
      </div>
      <div className="space-y-2">
        <p className="text-sm text-[#3f5c64]"><span className="font-semibold text-[#173d50]">Westgard rule:</span> <span className="mono">{rules.map((rule) => RULE_HELP[rule]?.label ?? rule).join(', ') || '—'}</span> <span className="text-xs text-[#789097]">· VL ใช้ vl-standard-v1 ส่วน CD4 ใช้ cd4-legacy อัตโนมัติ</span></p>
        <details className="rounded-md border border-dashed border-[#cfdee0] bg-[#fbfdfd] p-3">
          <summary className="flex min-h-11 cursor-pointer items-center font-semibold text-[#315763] focus-visible:ring-2 focus-visible:ring-[#0b7f76] focus-visible:outline-none">ปรับ rule (เมื่อ SOP กำหนดต่างจากค่าเริ่มต้น)</summary>
          <div className="mt-3 grid gap-2 md:grid-cols-3">
            {ALL_RULES.map((rule) => {
              const help = RULE_HELP[rule]
              return <label key={rule} className="flex min-h-16 cursor-pointer items-start gap-2 rounded-md border border-[#e1ebec] bg-white p-3 hover:border-[#9ec4c4]"><input type="checkbox" checked={rules.includes(rule)} onChange={() => toggleRule(rule)} className="mt-0.5 size-4 accent-[#0b7f76]" /><span><span className="mono block text-xs font-bold text-[#173d50]">{help.label}</span><span className="mt-1 block text-[11px] leading-4 text-[#6e878e]">{help.group} · {help.description}</span></span></label>
            })}
          </div>
        </details>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-3 border-t border-[#e1ebec] pt-4"><Button disabled={busy} onClick={() => void save()}>{busy ? 'กำลังบันทึก…' : 'บันทึก แล้วไปขั้นถัดไป'}</Button></div>
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
