'use client'

import { useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  AlertOctagon,
  Archive,
  ArrowRightFromLine,
  Boxes,
  CalendarClock,
  Camera,
  Check,
  CheckCircle2,
  Clock3,
  Dna,
  FlaskConical,
  History,
  LayoutDashboard,
  LoaderCircle,
  MapPin,
  Plus,
  QrCode,
  Search,
  Send,
  ShieldCheck,
  Trash2,
  Undo2,
  X,
} from 'lucide-react'
import type { BmActor } from '@/lib/bm/types'
import { daysUntil, formatDate, formatDateTime, todayBangkok } from '@/lib/bm/rules'
import {
  businessDaysElapsed,
  formatHivDrtPosition,
  getHivDrtDestructionState,
  getHivDrtTatState,
  HIV_DRT_RACK_CAPACITY,
} from '@/lib/hiv-drt/rules'
import type { HivDrtRack, HivDrtSample, HivDrtWorkspace } from '@/lib/hiv-drt/types'
import { useCameraScanner } from '@/components/camera-scanner'
import { api, Button, Card, Field, Input, Notice, PageHeader, Select, StatusBadge, Tabs } from '@/components/ui'

type TabKey = 'overview' | 'storage' | 'tracking' | 'history'
type NoticeState = { tone: 'success' | 'warning' | 'danger'; text: string } | null

const tabs = [
  { key: 'overview' as const, label: 'ภาพรวม', icon: LayoutDashboard },
  { key: 'storage' as const, label: 'Sample Storage', icon: Boxes },
  { key: 'tracking' as const, label: 'ส่งตรวจและติดตามผล', icon: Send },
  { key: 'history' as const, label: 'ประวัติ', icon: History },
]

function isTab(value: string | null): value is TabKey {
  return value === 'overview' || value === 'storage' || value === 'tracking' || value === 'history'
}

export function HivDrtView({ actor, initialData }: { actor: BmActor; initialData: HivDrtWorkspace }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const requestedTab = searchParams.get('view')
  const [tab, setTab] = useState<TabKey>(isTab(requestedTab) ? requestedTab : 'overview')
  const [workspace, setWorkspace] = useState(initialData)
  const [notice, setNotice] = useState<NoticeState>(null)
  const [busy, setBusy] = useState(false)

  function changeTab(next: TabKey) {
    setTab(next)
    const params = new URLSearchParams(searchParams.toString())
    params.set('view', next)
    if (next !== 'tracking' && next !== 'storage') params.delete('filter')
    router.replace(`/hiv-drt?${params.toString()}`, { scroll: false })
  }

  async function mutate(url: string, options: RequestInit, success: string) {
    setBusy(true)
    setNotice(null)
    try {
      const result = await api<{ workspace: HivDrtWorkspace }>(url, options)
      setWorkspace(result.workspace)
      setNotice({ tone: 'success', text: success })
      return true
    } catch (error) {
      setNotice({ tone: 'danger', text: error instanceof Error ? error.message : 'เกิดข้อผิดพลาด' })
      return false
    } finally {
      setBusy(false)
    }
  }

  const today = todayBangkok()
  const stored = workspace.samples.filter((sample) => sample.status === 'stored')
  const waiting = workspace.samples.filter((sample) => sample.status === 'checked_out')
  const overdue = waiting.filter((sample) => getHivDrtTatState(sample.checkedOutAt, sample.status, today) === 'overdue')
  const dueSoon = stored.filter((sample) => getHivDrtDestructionState(sample.destroyDueOn, sample.status, today) === 'due_soon')
  const dueNow = stored.filter((sample) => getHivDrtDestructionState(sample.destroyDueOn, sample.status, today) === 'due_now')

  return (
    <div className="mx-auto max-w-[1600px] space-y-5">
      <PageHeader
        eyebrow="HIV Drug Resistance Testing"
        title="HIV DRT"
        description="ติดตาม tube ตั้งแต่รับเข้า rack ส่งตรวจ HIV Genotyping จนถึงรับผลหรือทำลายตัวอย่าง"
        actions={
          <div className="flex items-center gap-2 rounded-full border border-[#b9d7d5] bg-[#edf9f7] px-3 py-1.5 text-xs font-bold text-[#176b68]">
            <ShieldCheck className="size-4" /> {actor.role} · Audit enabled
          </div>
        }
      />

      <div className="relative overflow-hidden rounded-xl border border-[#bfd7d8] bg-[#123944] px-5 py-4 text-white shadow-[0_20px_60px_rgba(18,57,68,.18)]">
        <div className="pointer-events-none absolute -top-16 -right-8 size-52 rounded-full border-[28px] border-[#25b2a5]/15" />
        <div className="pointer-events-none absolute right-32 -bottom-20 size-40 rounded-full border border-white/10" />
        <div className="relative flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="grid size-11 place-items-center rounded-lg border border-[#72d5ca]/30 bg-[#0b7f76]"><Dna className="size-6" /></div>
            <div>
              <p className="text-[10px] font-bold tracking-[0.2em] text-[#7ee3d8] uppercase">Chain of custody</p>
              <p className="mt-0.5 text-sm font-semibold text-[#d6eeee]">96-position racks · TAT 18 business days · Retention 3 months</p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <Signal value={waiting.length} label="รอผล" danger={false} />
            <Signal value={overdue.length} label="เกิน TAT" danger={overdue.length > 0} />
            <Signal value={dueNow.length} label="ครบทำลาย" danger={dueNow.length > 0} />
          </div>
        </div>
      </div>

      {notice ? <Notice tone={notice.tone}>{notice.text}</Notice> : null}
      <div className="flex items-center justify-between gap-3 overflow-x-auto pb-1">
        <Tabs tabs={tabs} active={tab} onChange={changeTab} />
        {busy ? <span className="inline-flex shrink-0 items-center gap-2 text-xs font-semibold text-[#58747d]"><LoaderCircle className="size-4 animate-spin" /> กำลังบันทึก</span> : null}
      </div>

      {tab === 'overview' ? (
        <Overview
          samples={workspace.samples}
          stored={stored}
          waiting={waiting}
          overdue={overdue}
          dueSoon={dueSoon}
          dueNow={dueNow}
          onTab={changeTab}
          onDestroy={(sample) => destroySample(sample, mutate)}
          onDelete={(sample) => deleteSampleRecord(sample, mutate)}
          busy={busy}
        />
      ) : null}
      {tab === 'storage' ? <StoragePanel workspace={workspace} busy={busy} mutate={mutate} setNotice={setNotice} initialFilter={searchParams.get('filter')} /> : null}
      {tab === 'tracking' ? <TrackingPanel workspace={workspace} busy={busy} mutate={mutate} initialFilter={searchParams.get('filter')} setNotice={setNotice} /> : null}
      {tab === 'history' ? <HistoryPanel workspace={workspace} busy={busy} mutate={mutate} /> : null}
    </div>
  )
}

function Signal({ value, label, danger }: { value: number; label: string; danger: boolean }) {
  return (
    <div className={`min-w-20 rounded-lg border px-3 py-2 ${danger ? 'border-[#ff9ca6]/35 bg-[#be3d49]/25' : 'border-white/10 bg-white/7'}`}>
      <p className="mono text-lg font-bold">{value}</p><p className="text-[#bad8dd]">{label}</p>
    </div>
  )
}

function Overview({ samples, stored, waiting, overdue, dueSoon, dueNow, onTab, onDestroy, onDelete, busy }: {
  samples: HivDrtSample[]
  stored: HivDrtSample[]
  waiting: HivDrtSample[]
  overdue: HivDrtSample[]
  dueSoon: HivDrtSample[]
  dueNow: HivDrtSample[]
  onTab: (tab: TabKey) => void
  onDestroy: (sample: HivDrtSample) => void
  onDelete: (sample: HivDrtSample) => void
  busy: boolean
}) {
  return (
    <div className="space-y-4">
      <section className="grid grid-cols-2 gap-3 xl:grid-cols-5">
        <Metric icon={<FlaskConical />} label="Tube ใน Storage" value={stored.length} tone="teal" />
        <Metric icon={<Clock3 />} label="กำลังรอผล" value={waiting.length} tone="blue" />
        <Metric icon={<AlertOctagon />} label="เกิน TAT" value={overdue.length} tone="red" />
        <Metric icon={<CalendarClock />} label="ใกล้กำหนดทำลาย" value={dueSoon.length} tone="amber" />
        <Metric icon={<Archive />} label="ครบกำหนดทำลาย" value={dueNow.length} tone="red" />
      </section>
      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="overflow-hidden">
          <PanelTitle icon={<AlertOctagon />} title="ยังไม่ได้รับผลเกิน 18 วันทำการ" count={overdue.length} tone="danger" action="ดูรายการรอผล" onClick={() => onTab('tracking')} />
          <div className="divide-y divide-[#edf2f2]">
            {overdue.slice(0, 8).map((sample) => <TrackingRow key={sample.id} sample={sample} busy={busy} onDelete={onDelete} />)}
            {!overdue.length ? <EmptyState icon={<CheckCircle2 />} text="ไม่มีรายการเกิน TAT" /> : null}
          </div>
        </Card>
        <Card className="overflow-hidden">
          <PanelTitle icon={<Archive />} title="Tube ที่ต้องทำลาย" count={dueNow.length + dueSoon.length} tone={dueNow.length ? 'danger' : 'warning'} action="เปิด Storage" onClick={() => onTab('storage')} />
          <div className="divide-y divide-[#edf2f2]">
            {[...dueNow, ...dueSoon].slice(0, 8).map((sample) => (
              <div key={sample.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2"><strong className="mono text-sm text-[#173d50]">{sample.barcode}</strong><DestructionBadge sample={sample} /></div>
                  <p className="mt-1 text-xs text-[#789097]">{sample.storedRackCode} · {formatHivDrtPosition(sample.storedPosition)} · กำหนด {formatDate(sample.destroyDueOn)}</p>
                </div>
                <div className="flex gap-2"><Button variant="secondary" disabled={busy} onClick={() => onDestroy(sample)}><Archive className="size-4" /> ทำลาย</Button><Button variant="danger" disabled={busy} onClick={() => onDelete(sample)} aria-label={`ลบ ${sample.barcode}`}><Trash2 className="size-4" /> ลบ</Button></div>
              </div>
            ))}
            {!dueNow.length && !dueSoon.length ? <EmptyState icon={<CheckCircle2 />} text="ไม่มี tube ใกล้กำหนดทำลาย" /> : null}
          </div>
        </Card>
      </div>
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-[#dce8e9] bg-[#fbfdfd] px-4 py-3"><div><h2 className="font-bold text-[#173d50]">รายการล่าสุด</h2><p className="mt-0.5 text-xs text-[#789097]">ลบ tube ได้ทุกสถานะจากหน้าภาพรวม</p></div><span className="mono rounded-full bg-[#eef5f4] px-2.5 py-1 text-xs font-bold text-[#58747d]">{samples.length}</span></div>
        <div className="divide-y divide-[#edf2f2]">
          {samples.slice(0, 8).map((sample) => <div key={sample.id} className="flex items-center gap-3 px-4 py-3"><div className="min-w-0 flex-1"><strong className="mono block truncate text-sm text-[#173d50]">{sample.barcode}</strong><p className="mt-1 text-xs text-[#789097]">{sample.checkoutDestination ?? sample.storedRackCode ?? 'Storage'} · {sample.createdAt ? formatDateTime(sample.createdAt) : '-'}</p></div><SampleStatusBadge sample={sample} /><Button variant="danger" disabled={busy} onClick={() => onDelete(sample)}><Trash2 className="size-4" /> ลบ</Button></div>)}
          {!samples.length ? <EmptyState icon={<FlaskConical />} text="ยังไม่มี tube ในระบบ" /> : null}
        </div>
      </Card>
    </div>
  )
}

function Metric({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: number; tone: 'teal' | 'blue' | 'amber' | 'red' }) {
  const map = {
    teal: 'bg-[#e5f7f4] text-[#08776f]',
    blue: 'bg-[#eaf4f8] text-[#2d6b82]',
    amber: 'bg-[#fff6e4] text-[#a76511]',
    red: 'bg-[#fff0f1] text-[#b33b46]',
  }
  return (
    <Card className="relative overflow-hidden p-4">
      <div className={`flex size-9 items-center justify-center rounded-lg [&>svg]:size-4 ${map[tone]}`}>{icon}</div>
      <p className="mt-4 text-xs font-semibold text-[#68828a]">{label}</p>
      <p className={`mono mt-1 text-3xl font-bold ${tone === 'red' && value ? 'text-[#b33b46]' : 'text-[#173d50]'}`}>{value}</p>
    </Card>
  )
}

function StoragePanel({ workspace, busy, mutate, setNotice, initialFilter }: {
  workspace: HivDrtWorkspace
  busy: boolean
  mutate: (url: string, options: RequestInit, success: string) => Promise<boolean>
  setNotice: (notice: NoticeState) => void
  initialFilter: string | null
}) {
  const [selectedRackId, setSelectedRackId] = useState(workspace.racks[0]?.id ?? '')
  const [selectedSampleId, setSelectedSampleId] = useState<string | null>(null)
  const [rackCode, setRackCode] = useState(`DRT-${todayBangkok().replaceAll('-', '')}-01`)
  const [barcode, setBarcode] = useState('')
  const [position, setPosition] = useState<number | null>(null)
  const [search, setSearch] = useState('')

  const effectiveRackId = workspace.racks.some((rack) => rack.id === selectedRackId) ? selectedRackId : (workspace.racks[0]?.id ?? '')
  const rack = workspace.racks.find((item) => item.id === effectiveRackId) ?? null
  const autoPosition = rack?.nextPosition ?? 1
  const selectedSample = workspace.samples.find((sample) => sample.id === selectedSampleId && sample.status === 'stored') ?? null
  const searchResult = search.trim()
    ? workspace.samples.find((sample) => sample.status === 'stored' && sample.barcode.toLowerCase().includes(search.trim().toLowerCase())) ?? null
    : null
  const destructionAttention = workspace.samples
    .filter((sample) => sample.status === 'stored' && getHivDrtDestructionState(sample.destroyDueOn, sample.status) !== 'none')
    .sort((a, b) => (a.destroyDueOn ?? '').localeCompare(b.destroyDueOn ?? ''))

  async function store(code = barcode) {
    if (!effectiveRackId || !code.trim()) return
    const ok = await mutate('/api/hiv-drt/storage', { method: 'POST', body: JSON.stringify({ barcode: code.trim(), rackId: effectiveRackId, position }) }, `เก็บ tube ${code.trim()} เข้าสู่ Storage แล้ว`)
    if (ok) { setBarcode(''); setPosition(null) }
  }

  const camera = useCameraScanner({
    onScan: (code) => { setBarcode(code); void store(code) },
    onError: (text) => setNotice({ tone: 'danger', text }),
    stopOnScan: true,
  })

  async function createRack(event: React.FormEvent) {
    event.preventDefault()
    if (!rackCode.trim()) return
    const ok = await mutate('/api/hiv-drt/racks', { method: 'POST', body: JSON.stringify({ rackCode }) }, `สร้าง Rack ${rackCode.trim()} แล้ว`)
    if (ok) setRackCode(`DRT-${todayBangkok().replaceAll('-', '')}-${String(workspace.racks.length + 2).padStart(2, '0')}`)
  }

  async function deleteRack(target: HivDrtRack) {
    if (!window.confirm(`ลบ Rack ${target.rackCode}? ลบได้เฉพาะ Rack ที่ว่างเท่านั้น`)) return
    await mutate(`/api/hiv-drt/racks/${target.id}`, { method: 'DELETE' }, `ลบ Rack ${target.rackCode} แล้ว`)
  }

  async function moveSample(sampleId: string, targetPosition: number) {
    await mutate(`/api/hiv-drt/samples/${sampleId}`, { method: 'PATCH', body: JSON.stringify({ position: targetPosition }) }, `ย้าย tube ไป ${formatHivDrtPosition(targetPosition)} แล้ว`)
    setSelectedSampleId(sampleId)
  }

  async function deleteSample(sample: HivDrtSample) {
    const ok = await deleteSampleRecord(sample, mutate)
    if (ok) setSelectedSampleId(null)
  }

  return (
    <div className="grid gap-4 2xl:grid-cols-[360px_minmax(0,1fr)]">
      <div className="space-y-4">
        {initialFilter === 'destroy_due' || destructionAttention.length > 0 ? (
          <Card className="overflow-hidden">
            <div className="flex items-center gap-2 border-b border-[#efd5b2] bg-[#fff9ed] px-4 py-3 text-sm font-bold text-[#8f5919]"><CalendarClock className="size-4" /> Tube ใกล้/ครบกำหนดทำลาย <span className="mono ml-auto">{destructionAttention.length}</span></div>
            <div className="max-h-56 divide-y divide-[#edf2f2] overflow-y-auto">
              {destructionAttention.map((sample) => <div key={sample.id} className="flex items-center gap-2 px-3 py-2"><button type="button" onClick={() => { setSelectedRackId(sample.currentRackId ?? ''); setSelectedSampleId(sample.id) }} className="min-w-0 flex-1 text-left"><strong className="mono block truncate text-xs text-[#173d50]">{sample.barcode}</strong><span className="text-[11px] text-[#789097]">{sample.storedRackCode} · {formatHivDrtPosition(sample.currentPosition)} · {formatDate(sample.destroyDueOn)}</span></button><DestructionBadge sample={sample} /><button type="button" disabled={busy} onClick={() => void deleteSample(sample)} aria-label={`ลบ ${sample.barcode}`} className="grid size-8 shrink-0 place-items-center rounded-md border border-[#edc7cb] bg-[#fff7f7] text-[#af3541] transition hover:bg-[#ffebed] disabled:opacity-50"><Trash2 className="size-3.5" /></button></div>)}
              {!destructionAttention.length ? <p className="px-4 py-8 text-center text-xs text-[#789097]">ไม่มี tube ที่ต้องดำเนินการ</p> : null}
            </div>
          </Card>
        ) : null}
        <Card className="p-4">
          <div className="flex items-center justify-between"><div><p className="text-xs font-bold tracking-[.14em] text-[#0b7f76] uppercase">Rack registry</p><h2 className="mt-1 font-bold text-[#173d50]">สร้าง Storage Rack</h2></div><Plus className="size-5 text-[#0b7f76]" /></div>
          <form onSubmit={createRack} className="mt-4 flex gap-2"><Input value={rackCode} onChange={(event) => setRackCode(event.target.value)} placeholder="Rack code" className="min-w-0 flex-1" /><Button disabled={busy}>สร้าง</Button></form>
        </Card>
        <Card className="p-4">
          <h2 className="font-bold text-[#173d50]">รับ tube เข้า Storage</h2>
          <p className="mt-1 text-xs leading-5 text-[#789097]">Auto-fill จะเดินไปช่องถัดไปโดยไม่ย้อนอุดช่องว่าง หากต้องการใช้ช่องเดิมที่ว่างให้เลือกตำแหน่งเอง</p>
          <form onSubmit={(event) => { event.preventDefault(); void store() }} className="mt-4 space-y-3">
            <Field label="Barcode / Sample ID"><Input autoFocus value={barcode} onChange={(event) => setBarcode(event.target.value)} className="mono" placeholder="Scan or type barcode" /></Field>
            <Field label="Rack"><Select value={effectiveRackId} onChange={(event) => setSelectedRackId(event.target.value)}><option value="">เลือก Rack</option>{workspace.racks.map((item) => <option key={item.id} value={item.id}>{item.rackCode} · {item.samples.length}/96</option>)}</Select></Field>
            <Field label="ตำแหน่ง"><Select value={position ?? ''} onChange={(event) => setPosition(event.target.value ? Number(event.target.value) : null)}><option value="">{autoPosition <= HIV_DRT_RACK_CAPACITY ? `Auto-fill ช่องถัดไป ${formatHivDrtPosition(autoPosition)}` : 'ไม่มีช่อง Auto-fill ถัดไป — กรุณาเลือกช่องว่าง'}</option>{Array.from({ length: HIV_DRT_RACK_CAPACITY }, (_, index) => index + 1).map((value) => { const occupied = rack?.samples.some((sample) => sample.currentPosition === value); return <option key={value} value={value} disabled={occupied}>{formatHivDrtPosition(value)}{occupied ? ' · ไม่ว่าง' : ''}</option> })}</Select></Field>
            <div className="flex gap-2"><Button disabled={busy || !barcode.trim() || !effectiveRackId || (position === null && autoPosition > HIV_DRT_RACK_CAPACITY)} className="flex-1"><QrCode className="size-4" /> Store tube</Button><Button type="button" variant="secondary" onClick={camera.toggle}>{camera.cameraOn ? <X className="size-4" /> : <Camera className="size-4" />} กล้อง</Button></div>
          </form>
          {camera.cameraOn ? <CameraFrame videoRef={camera.videoRef} /> : null}
        </Card>
        <Card className="p-4">
          <Field label="ค้นหา Barcode"><div className="relative"><Search className="absolute top-2.5 left-3 size-4 text-[#8ba0a5]" /><Input value={search} onChange={(event) => setSearch(event.target.value)} className="pl-9 mono" placeholder="ค้นหาตำแหน่ง tube" /></div></Field>
          {search.trim() ? searchResult ? <button type="button" onClick={() => { setSelectedRackId(searchResult.currentRackId ?? ''); setSelectedSampleId(searchResult.id) }} className="mt-3 w-full rounded-lg border border-[#badbd7] bg-[#f1faf9] p-3 text-left"><strong className="mono text-sm">{searchResult.barcode}</strong><p className="mt-1 text-xs text-[#58747d]">{searchResult.storedRackCode} · {formatHivDrtPosition(searchResult.currentPosition)}</p></button> : <p className="mt-3 text-xs text-[#a76511]">ไม่พบ tube ใน Storage</p> : null}
        </Card>
      </div>

      <div className="space-y-4">
        <Card className="overflow-hidden">
          <div className="flex flex-col gap-3 border-b border-[#dce8e9] bg-[#fbfdfd] p-4 sm:flex-row sm:items-center sm:justify-between">
            <div><p className="text-[10px] font-bold tracking-[.18em] text-[#0b7f76] uppercase">12 columns × 8 rows</p><h2 className="mt-1 text-lg font-bold text-[#173d50]">{rack?.rackCode ?? 'เลือก Rack'}</h2></div>
            <div className="flex items-center gap-2"><Select value={effectiveRackId} onChange={(event) => setSelectedRackId(event.target.value)} className="min-w-48"><option value="">เลือก Rack</option>{workspace.racks.map((item) => <option key={item.id} value={item.id}>{item.rackCode} · {item.samples.length}/96</option>)}</Select>{rack ? <Button variant="danger" disabled={busy || rack.samples.length > 0} onClick={() => void deleteRack(rack)} title={rack.samples.length ? 'ต้องย้ายหรือลบ tube ออกจาก Rack ก่อน' : 'ลบ Rack'}><Trash2 className="size-4" /></Button> : null}</div>
          </div>
          {rack ? <RackGrid rack={rack} selectedSampleId={selectedSampleId} onSelect={setSelectedSampleId} onMove={moveSample} busy={busy} /> : <EmptyState icon={<Boxes />} text="สร้างหรือเลือก Rack เพื่อเริ่มจัดเก็บ tube" />}
        </Card>
        {selectedSample ? (
          <Card className="border-l-4 border-l-[#0b7f76] p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div><div className="flex flex-wrap items-center gap-2"><strong className="mono text-base text-[#173d50]">{selectedSample.barcode}</strong><StatusBadge tone="accepted" label="stored" /><DestructionBadge sample={selectedSample} /></div><p className="mt-2 text-xs text-[#789097]">{selectedSample.storedRackCode} · {formatHivDrtPosition(selectedSample.currentPosition)} · เก็บ {selectedSample.storedAt ? formatDateTime(selectedSample.storedAt) : '-'}</p><p className="mt-1 text-xs text-[#789097]">กำหนดทำลาย {formatDate(selectedSample.destroyDueOn)}</p></div>
              <div className="flex flex-wrap gap-2"><Button variant="danger" disabled={busy} onClick={() => void deleteSample(selectedSample)}><Trash2 className="size-4" /> ลบ tube</Button><Button variant="secondary" disabled={busy} onClick={() => void destroySample(selectedSample, mutate)}><Archive className="size-4" /> บันทึกทำลาย</Button></div>
            </div>
          </Card>
        ) : null}
        {rack ? (
          <Card className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-[#dce8e9] bg-[#fbfdfd] px-4 py-3"><div><h3 className="font-bold text-[#173d50]">Tube ใน {rack.rackCode}</h3><p className="mt-0.5 text-xs text-[#789097]">ลบได้โดยตรงจากรายการนี้</p></div><span className="mono rounded-full bg-[#e8f7f5] px-2.5 py-1 text-xs font-bold text-[#0b7f76]">{rack.samples.length}/96</span></div>
            <div className="max-h-72 divide-y divide-[#edf2f2] overflow-y-auto">
              {rack.samples.map((sample) => <div key={sample.id} className="flex items-center gap-3 px-4 py-2.5"><button type="button" onClick={() => setSelectedSampleId(sample.id)} className="min-w-0 flex-1 text-left"><strong className="mono block truncate text-sm text-[#173d50]">{sample.barcode}</strong><span className="text-xs text-[#789097]">ตำแหน่ง {formatHivDrtPosition(sample.currentPosition)} · ทำลาย {formatDate(sample.destroyDueOn)}</span></button><Button variant="danger" disabled={busy} onClick={() => void deleteSample(sample)}><Trash2 className="size-4" /> ลบ</Button></div>)}
              {!rack.samples.length ? <p className="px-4 py-8 text-center text-sm text-[#8aa0a5]">Rack นี้ยังไม่มี tube</p> : null}
            </div>
          </Card>
        ) : null}
      </div>
    </div>
  )
}

function RackGrid({ rack, selectedSampleId, onSelect, onMove, busy }: { rack: HivDrtRack; selectedSampleId: string | null; onSelect: (id: string | null) => void; onMove: (sampleId: string, position: number) => void; busy: boolean }) {
  const byPosition = new Map(rack.samples.map((sample) => [sample.currentPosition, sample]))
  const [mobileRow, setMobileRow] = useState(0)
  const selectedSample = rack.samples.find((sample) => sample.id === selectedSampleId) ?? null

  function selectOrMove(sample: HivDrtSample | undefined, position: number) {
    if (busy) return
    if (selectedSampleId && selectedSampleId !== sample?.id) onMove(selectedSampleId, position)
    else onSelect(sample?.id ?? null)
  }

  return (
    <div className="bg-[radial-gradient(circle_at_15%_0%,rgba(11,127,118,.08),transparent_35%)]">
      <div className="p-3 sm:hidden">
        <div className="grid grid-cols-8 gap-1 rounded-lg border border-[#d4e3e3] bg-white/80 p-1" role="tablist" aria-label="เลือกแถว Rack">
          {Array.from({ length: 8 }, (_, row) => <button key={row} type="button" role="tab" aria-selected={mobileRow === row} onClick={() => setMobileRow(row)} className={`min-h-10 touch-manipulation rounded-md mono text-xs font-bold transition ${mobileRow === row ? 'bg-[#0b7f76] text-white shadow-sm' : 'text-[#58747d] active:bg-[#e8f7f5]'}`}>{String.fromCharCode(65 + row)}</button>)}
        </div>

        <div className={`mt-3 flex min-h-12 items-center gap-2 rounded-lg border px-3 py-2 text-xs ${selectedSample ? 'border-[#8bc8c1] bg-[#e9f8f5] text-[#176b68]' : 'border-[#d6e2e3] bg-white/75 text-[#6f888f]'}`}>
          {selectedSample ? <><CheckCircle2 className="size-4 shrink-0" /><span className="min-w-0 flex-1"><strong className="mono block truncate">{selectedSample.barcode}</strong>แตะช่องปลายทางเพื่อย้ายหรือสลับ</span><button type="button" onClick={() => onSelect(null)} aria-label="ยกเลิกการเลือก" className="grid size-8 shrink-0 place-items-center rounded-md text-[#55727c] active:bg-white"><X className="size-4" /></button></> : <><MapPin className="size-4 shrink-0 text-[#0b7f76]" /><span>แตะ tube เพื่อเลือก จากนั้นแตะช่องปลายทาง</span></>}
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2" role="grid" aria-label={`Rack ${rack.rackCode} row ${String.fromCharCode(65 + mobileRow)}`}>
          {Array.from({ length: 12 }, (_, column) => {
            const position = mobileRow * 12 + column + 1
            const sample = byPosition.get(position)
            const selected = sample?.id === selectedSampleId
            return (
              <button
                key={position}
                type="button"
                role="gridcell"
                disabled={busy}
                aria-label={`${formatHivDrtPosition(position)} ${sample?.barcode ?? 'ว่าง'}`}
                onClick={() => selectOrMove(sample, position)}
                className={`relative min-h-18 touch-manipulation rounded-xl border px-2 py-2 text-center transition active:scale-[.97] disabled:opacity-50 ${sample ? 'border-[#8bc8c1] bg-[#e6f6f3] shadow-[inset_0_-3px_0_rgba(11,127,118,.08)]' : 'border-dashed border-[#cbdedf] bg-white/80'} ${selected ? 'ring-2 ring-[#0b7f76] ring-offset-2' : ''}`}
              >
                <span className={`mx-auto block size-3.5 rounded-full border ${sample ? 'border-[#0b7f76] bg-[#49b8ad]' : 'border-[#bcd0d3] bg-white'}`} />
                <span className="mt-1.5 block mono text-[10px] font-bold text-[#315763]">{formatHivDrtPosition(position)}</span>
                <span className="mt-0.5 block truncate mono text-[9px] text-[#6f888f]">{sample?.barcode ?? 'ว่าง'}</span>
              </button>
            )
          })}
        </div>
        <div className="mt-3 flex items-center justify-between text-[11px] text-[#6f888f]"><span>แถว {String.fromCharCode(65 + mobileRow)} · 12 ช่อง</span><span>{Array.from({ length: 12 }, (_, column) => byPosition.has(mobileRow * 12 + column + 1)).filter(Boolean).length}/12 occupied</span></div>
      </div>

      <div className="hidden overflow-x-auto p-4 sm:block">
        <div className="grid min-w-[930px] grid-cols-[34px_repeat(12,minmax(66px,1fr))] gap-2" role="grid" aria-label={`Rack ${rack.rackCode} 8 by 12`}>
          <div />
          {Array.from({ length: 12 }, (_, index) => <div key={index} className="text-center mono text-[10px] font-bold text-[#6e898f]">{index + 1}</div>)}
          {Array.from({ length: 8 }, (_, row) => (
            <RackRow key={row} row={row} byPosition={byPosition} selectedSampleId={selectedSampleId} onSelect={onSelect} onMove={onMove} busy={busy} />
          ))}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-4 text-[11px] text-[#6f888f]"><Legend color="bg-[#dff3f0] border-[#8bc8c1]" label="มี tube" /><Legend color="bg-white border-[#d7e4e5]" label="ช่องว่าง" /><span>คลิก tube แล้วคลิกช่องปลายทาง หรือ Drag & Drop เพื่อย้าย/สลับ</span></div>
      </div>
    </div>
  )
}

function RackRow({ row, byPosition, selectedSampleId, onSelect, onMove, busy }: { row: number; byPosition: Map<number | null, HivDrtSample>; selectedSampleId: string | null; onSelect: (id: string | null) => void; onMove: (sampleId: string, position: number) => void; busy: boolean }) {
  return (
    <>
      <div className="grid place-items-center mono text-xs font-bold text-[#315763]">{String.fromCharCode(65 + row)}</div>
      {Array.from({ length: 12 }, (_, column) => {
        const position = row * 12 + column + 1
        const sample = byPosition.get(position)
        const selected = sample?.id === selectedSampleId
        return (
          <button
            key={position}
            type="button"
            role="gridcell"
            draggable={Boolean(sample) && !busy}
            aria-label={`${formatHivDrtPosition(position)} ${sample?.barcode ?? 'ว่าง'}`}
            onDragStart={(event) => { if (sample) event.dataTransfer.setData('text/hiv-drt-sample', sample.id) }}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => { event.preventDefault(); const id = event.dataTransfer.getData('text/hiv-drt-sample'); if (id) onMove(id, position) }}
            onClick={() => {
              if (selectedSampleId && selectedSampleId !== sample?.id) onMove(selectedSampleId, position)
              else onSelect(sample?.id ?? null)
            }}
            className={`group relative h-14 rounded-lg border text-center transition focus-visible:ring-2 focus-visible:ring-[#0b7f76] focus-visible:outline-none ${sample ? 'border-[#8bc8c1] bg-[#e6f6f3] shadow-[inset_0_-3px_0_rgba(11,127,118,.08)] hover:-translate-y-0.5 hover:border-[#0b7f76]' : 'border-dashed border-[#d2e0e1] bg-white/70 hover:border-[#84b8b6] hover:bg-[#f4fbfa]'} ${selected ? 'ring-2 ring-[#0b7f76] ring-offset-2' : ''}`}
          >
            <span className={`mx-auto block size-3 rounded-full border ${sample ? 'border-[#0b7f76] bg-[#49b8ad]' : 'border-[#c5d7d9] bg-white'}`} />
            <span className="mt-1 block truncate px-1 mono text-[9px] font-semibold text-[#315763]">{sample?.barcode ?? formatHivDrtPosition(position)}</span>
          </button>
        )
      })}
    </>
  )
}

function TrackingPanel({ workspace, busy, mutate, initialFilter, setNotice }: { workspace: HivDrtWorkspace; busy: boolean; mutate: (url: string, options: RequestInit, success: string) => Promise<boolean>; initialFilter: string | null; setNotice: (notice: NoticeState) => void }) {
  const [barcode, setBarcode] = useState('')
  const [destination, setDestination] = useState('LAB Rama')
  const [search, setSearch] = useState('')
  const [onlyOverdue, setOnlyOverdue] = useState(initialFilter === 'overdue')
  const today = todayBangkok()
  const waiting = useMemo(() => workspace.samples.filter((sample) => sample.status === 'checked_out')
    .filter((sample) => !onlyOverdue || getHivDrtTatState(sample.checkedOutAt, sample.status, today) === 'overdue')
    .filter((sample) => !search.trim() || sample.barcode.toLowerCase().includes(search.trim().toLowerCase()) || sample.checkoutDestination?.toLowerCase().includes(search.trim().toLowerCase())), [onlyOverdue, search, today, workspace.samples])

  const camera = useCameraScanner({ onScan: setBarcode, onError: (text) => setNotice({ tone: 'danger', text }), stopOnScan: true })

  async function checkout(event: React.FormEvent) {
    event.preventDefault()
    if (!barcode.trim()) return
    const ok = await mutate('/api/hiv-drt/checkout', { method: 'POST', body: JSON.stringify({ barcode, destination }) }, `Checkout ${barcode.trim()} เพื่อส่งตรวจแล้ว`)
    if (ok) setBarcode('')
  }

  async function receive(sample: HivDrtSample) {
    if (!window.confirm(`ยืนยันว่าได้รับผล HIV Genotyping ของ ${sample.barcode} แล้ว?`)) return
    await mutate(`/api/hiv-drt/samples/${sample.id}/result`, { method: 'POST' }, `บันทึกรับผล ${sample.barcode} แล้ว`)
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[380px_minmax(0,1fr)]">
      <Card className="h-fit overflow-hidden">
        <div className="border-b border-[#dce8e9] bg-[#123944] p-4 text-white"><div className="flex items-center gap-3"><div className="grid size-9 place-items-center rounded-lg bg-[#0b7f76]"><ArrowRightFromLine className="size-5" /></div><div><p className="text-[10px] font-bold tracking-[.16em] text-[#7ee3d8] uppercase">Checkout</p><h2 className="font-bold">ส่ง HIV Genotyping Test</h2></div></div></div>
        <form onSubmit={checkout} className="space-y-4 p-4">
          <Field label="Barcode / Sample ID" hint="รองรับทั้ง tube จาก Storage และ Direct Checkout"><Input autoFocus value={barcode} onChange={(event) => setBarcode(event.target.value)} className="mono" placeholder="Scan or type barcode" /></Field>
          <Field label="Lab ปลายทาง" hint="หากเว้นว่าง ระบบจะใช้ LAB Rama"><Input value={destination} onChange={(event) => setDestination(event.target.value)} placeholder="LAB Rama" /></Field>
          <div className="rounded-lg border border-[#c9dedf] bg-[#f3f9f9] p-3 text-xs leading-5 text-[#58747d]"><Clock3 className="mr-1 inline size-4 text-[#0b7f76]" /> ระบบกำหนด TAT 18 วันทำการอัตโนมัติ ไม่นับวัน Checkout เสาร์ และอาทิตย์</div>
          <div className="flex gap-2"><Button disabled={busy || !barcode.trim()} className="flex-1"><Send className="size-4" /> ยืนยัน Checkout</Button><Button type="button" variant="secondary" onClick={camera.toggle}>{camera.cameraOn ? <X className="size-4" /> : <Camera className="size-4" />}</Button></div>
          {camera.cameraOn ? <CameraFrame videoRef={camera.videoRef} /> : null}
        </form>
      </Card>
      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-[#dce8e9] bg-[#fbfdfd] p-4 lg:flex-row lg:items-center lg:justify-between"><div><h2 className="font-bold text-[#173d50]">รายการรอผล</h2><p className="mt-1 text-xs text-[#789097]">เรียงรายการเกิน TAT ขึ้นก่อน</p></div><div className="flex flex-col gap-2 sm:flex-row"><div className="relative"><Search className="absolute top-2.5 left-3 size-4 text-[#8ba0a5]" /><Input value={search} onChange={(event) => setSearch(event.target.value)} className="pl-9" placeholder="ค้นหา Barcode หรือ Lab" /></div><label className="flex items-center gap-2 rounded-md border border-[#cfdee0] bg-white px-3 py-2 text-xs font-semibold text-[#58747d]"><input type="checkbox" checked={onlyOverdue} onChange={(event) => setOnlyOverdue(event.target.checked)} className="accent-[#b33b46]" /> เฉพาะเกิน TAT</label></div></div>
        <div className="overflow-x-auto"><table className="w-full min-w-[920px] text-left text-sm"><thead className="bg-[#f4f8f8] text-[10px] font-bold tracking-[.08em] text-[#718a91] uppercase"><tr><th className="px-4 py-3">Tube</th><th className="px-4 py-3">Lab ปลายทาง</th><th className="px-4 py-3">Checkout</th><th className="px-4 py-3">TAT</th><th className="px-4 py-3">สถานะ</th><th className="px-4 py-3 text-right">Action</th></tr></thead><tbody className="divide-y divide-[#edf2f2]">{waiting.sort((a, b) => Number(getHivDrtTatState(b.checkedOutAt, b.status, today) === 'overdue') - Number(getHivDrtTatState(a.checkedOutAt, a.status, today) === 'overdue')).map((sample) => <tr key={sample.id} className="hover:bg-[#f8fbfb]"><td className="px-4 py-3"><strong className="mono text-[#173d50]">{sample.barcode}</strong><p className="mt-1 text-[11px] text-[#8ba0a5]">{sample.fromStorage ? `${sample.storedRackCode} · ${formatHivDrtPosition(sample.storedPosition)}` : 'Direct checkout'}</p></td><td className="px-4 py-3 text-[#315763]">{sample.checkoutDestination}</td><td className="px-4 py-3 text-xs text-[#58747d]">{sample.checkedOutAt ? formatDateTime(sample.checkedOutAt) : '-'}</td><td className="px-4 py-3"><p className="font-semibold text-[#315763]">ครบ {formatDate(sample.tatDueOn)}</p><p className="mt-1 text-[11px] text-[#8ba0a5]">ผ่าน {sample.checkedOutAt ? businessDaysElapsed(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date(sample.checkedOutAt)), today) : 0} วันทำการ</p></td><td className="px-4 py-3"><TatBadge sample={sample} /></td><td className="px-4 py-3"><div className="flex justify-end gap-2"><Button disabled={busy} onClick={() => void receive(sample)}><Check className="size-4" /> ได้รับผลแล้ว</Button><Button variant="danger" disabled={busy} onClick={() => void deleteSampleRecord(sample, mutate)}><Trash2 className="size-4" /> ลบ</Button></div></td></tr>)}</tbody></table></div>
        {!waiting.length ? <EmptyState icon={<CheckCircle2 />} text={onlyOverdue ? 'ไม่มีรายการเกิน TAT' : 'ไม่มีรายการรอผล'} /> : null}
      </Card>
    </div>
  )
}

function HistoryPanel({ workspace, busy, mutate }: { workspace: HivDrtWorkspace; busy: boolean; mutate: (url: string, options: RequestInit, success: string) => Promise<boolean> }) {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<'all' | 'result_received' | 'destroyed'>('all')
  const completed = workspace.samples.filter((sample) => sample.status === 'result_received' || sample.status === 'destroyed')
    .filter((sample) => status === 'all' || sample.status === status)
    .filter((sample) => !search.trim() || sample.barcode.toLowerCase().includes(search.trim().toLowerCase()) || sample.checkoutDestination?.toLowerCase().includes(search.trim().toLowerCase()))

  async function undo(sample: HivDrtSample) {
    const reason = window.prompt(`เหตุผลที่ย้อนสถานะรับผลของ ${sample.barcode}`)?.trim()
    if (!reason) return
    await mutate(`/api/hiv-drt/samples/${sample.id}/result`, { method: 'DELETE', body: JSON.stringify({ reason }) }, `ย้อน ${sample.barcode} กลับเป็นรอผลแล้ว`)
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-[#dce8e9] bg-[#fbfdfd] p-4 lg:flex-row lg:items-center lg:justify-between"><div><h2 className="font-bold text-[#173d50]">ประวัติ HIV DRT</h2><p className="mt-1 text-xs text-[#789097]">รายการรับผลแล้วและ tube ที่บันทึกทำลาย</p></div><div className="flex gap-2"><div className="relative"><Search className="absolute top-2.5 left-3 size-4 text-[#8ba0a5]" /><Input value={search} onChange={(event) => setSearch(event.target.value)} className="pl-9" placeholder="ค้นหา Barcode หรือ Lab" /></div><Select value={status} onChange={(event) => setStatus(event.target.value as typeof status)}><option value="all">ทุกสถานะ</option><option value="result_received">ได้รับผลแล้ว</option><option value="destroyed">ทำลายแล้ว</option></Select></div></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead className="bg-[#f4f8f8] text-[10px] font-bold tracking-[.08em] text-[#718a91] uppercase"><tr><th className="px-4 py-3">Tube</th><th className="px-4 py-3">แหล่งที่มา</th><th className="px-4 py-3">Lab</th><th className="px-4 py-3">สถานะ</th><th className="px-4 py-3">ดำเนินการเมื่อ</th><th className="px-4 py-3 text-right">Action</th></tr></thead><tbody className="divide-y divide-[#edf2f2]">{completed.map((sample) => <tr key={sample.id} className="hover:bg-[#f8fbfb]"><td className="px-4 py-3 mono font-semibold text-[#173d50]">{sample.barcode}</td><td className="px-4 py-3 text-xs text-[#58747d]">{sample.fromStorage ? `${sample.storedRackCode} · ${formatHivDrtPosition(sample.storedPosition)}` : 'Direct checkout'}</td><td className="px-4 py-3 text-[#315763]">{sample.checkoutDestination ?? '-'}</td><td className="px-4 py-3">{sample.status === 'result_received' ? <StatusBadge tone="accepted" label="ได้รับผลแล้ว" /> : <StatusBadge tone="neutral" label="ทำลายแล้ว" />}</td><td className="px-4 py-3 text-xs text-[#58747d]">{sample.resultReceivedAt ? formatDateTime(sample.resultReceivedAt) : sample.destroyedAt ? formatDateTime(sample.destroyedAt) : '-'}</td><td className="px-4 py-3"><div className="flex justify-end gap-2">{sample.status === 'result_received' ? <Button variant="ghost" disabled={busy} onClick={() => void undo(sample)}><Undo2 className="size-4" /> ย้อนสถานะ</Button> : null}<Button variant="danger" disabled={busy} onClick={() => void deleteSampleRecord(sample, mutate)}><Trash2 className="size-4" /> ลบ</Button></div></td></tr>)}</tbody></table></div>
      {!completed.length ? <EmptyState icon={<History />} text="ยังไม่มีประวัติที่ตรงกับตัวกรอง" /> : null}
    </Card>
  )
}

async function deleteSampleRecord(sample: HivDrtSample, mutate: (url: string, options: RequestInit, success: string) => Promise<boolean>) {
  if (!window.confirm(`ลบ tube ${sample.barcode} และประวัติสถานะ ${sample.status}? การลบนี้ย้อนกลับไม่ได้ แต่ Audit log จะยังคงอยู่`)) return false
  return mutate(`/api/hiv-drt/samples/${sample.id}`, { method: 'DELETE' }, `ลบ tube ${sample.barcode} แล้ว`)
}

async function destroySample(sample: HivDrtSample, mutate: (url: string, options: RequestInit, success: string) => Promise<boolean>) {
  if (!window.confirm(`ยืนยันบันทึกทำลาย tube ${sample.barcode}? รายการจะถูกนำออกจาก Rack แต่ยังเก็บในประวัติ`)) return
  await mutate(`/api/hiv-drt/samples/${sample.id}/destroy`, { method: 'POST' }, `บันทึกทำลาย tube ${sample.barcode} แล้ว`)
}

function TatBadge({ sample }: { sample: HivDrtSample }) {
  const state = getHivDrtTatState(sample.checkedOutAt, sample.status)
  return state === 'overdue' ? <StatusBadge tone="rejected" label="เกิน TAT" /> : <StatusBadge tone="warning" label="รอผล" />
}

function SampleStatusBadge({ sample }: { sample: HivDrtSample }) {
  if (sample.status === 'stored') return <StatusBadge tone="accepted" label="stored" />
  if (sample.status === 'checked_out') return <TatBadge sample={sample} />
  if (sample.status === 'result_received') return <StatusBadge tone="accepted" label="ได้รับผลแล้ว" />
  return <StatusBadge tone="neutral" label="ทำลายแล้ว" />
}

function DestructionBadge({ sample }: { sample: HivDrtSample }) {
  const state = getHivDrtDestructionState(sample.destroyDueOn, sample.status)
  if (state === 'due_now') return <StatusBadge tone="rejected" label="ครบกำหนดทำลาย" />
  if (state === 'due_soon') return <StatusBadge tone="warning" label={`เหลือ ${Math.max(0, daysUntil(sample.destroyDueOn ?? ''))} วัน`} />
  return <StatusBadge tone="neutral" label="อยู่ในอายุจัดเก็บ" />
}

function TrackingRow({ sample, busy, onDelete }: { sample: HivDrtSample; busy: boolean; onDelete: (sample: HivDrtSample) => void }) {
  return <div className="flex items-center gap-3 px-4 py-3"><div className="grid size-9 shrink-0 place-items-center rounded-lg bg-[#fff0f1] text-[#b33b46]"><Clock3 className="size-4" /></div><div className="min-w-0 flex-1"><strong className="mono text-sm text-[#173d50]">{sample.barcode}</strong><p className="mt-1 truncate text-xs text-[#789097]">{sample.checkoutDestination} · ครบ {formatDate(sample.tatDueOn)}</p></div><TatBadge sample={sample} /><Button variant="danger" disabled={busy} onClick={() => onDelete(sample)} aria-label={`ลบ ${sample.barcode}`}><Trash2 className="size-4" /> ลบ</Button></div>
}

function PanelTitle({ icon, title, count, tone, action, onClick }: { icon: React.ReactNode; title: string; count: number; tone: 'danger' | 'warning'; action: string; onClick: () => void }) {
  return <div className={`flex items-center gap-3 border-b px-4 py-3 ${tone === 'danger' ? 'border-[#f1d1d4] bg-[#fff7f7]' : 'border-[#eedfbf] bg-[#fffaf0]'}`}><span className={`[&>svg]:size-4 ${tone === 'danger' ? 'text-[#b33b46]' : 'text-[#a76511]'}`}>{icon}</span><strong className="text-[#173d50]">{title}</strong><span className="mono rounded-full bg-white px-2 py-0.5 text-xs font-bold text-[#315763]">{count}</span><button type="button" onClick={onClick} className="ml-auto text-xs font-semibold text-[#0b7f76] hover:underline">{action} →</button></div>
}

function CameraFrame({ videoRef }: { videoRef: React.RefObject<HTMLVideoElement | null> }) {
  return <div className="relative mt-3 overflow-hidden rounded-lg border border-[#315763] bg-black"><video ref={videoRef} autoPlay muted playsInline className="aspect-video w-full object-cover" /><div className="pointer-events-none absolute inset-0 grid place-items-center"><div className="h-[34%] w-[78%] rounded-lg border-2 border-[#5de1d0] shadow-[0_0_0_999px_rgba(0,0,0,.25),0_0_22px_rgba(93,225,208,.8)]" /></div></div>
}

function Legend({ color, label }: { color: string; label: string }) {
  return <span className="inline-flex items-center gap-1.5"><span className={`size-3 rounded border ${color}`} />{label}</span>
}

function EmptyState({ icon, text }: { icon: React.ReactNode; text: string }) {
  return <div className="grid place-items-center px-4 py-12 text-center text-sm text-[#8aa0a5]"><span className="mb-2 text-[#91bbb8] [&>svg]:size-7">{icon}</span><p>{text}</p></div>
}
