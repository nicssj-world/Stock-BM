'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AlertTriangle, ClipboardList, LayoutGrid, Plus, QrCode as QrCodeIcon, Settings2, Thermometer } from 'lucide-react'
import { QrCode } from '@/components/qr-code'
import type { BmActor } from '@/lib/bm/types'
import type { EnvCardStatus, EnvUnit, EnvWorkspace } from '@/lib/env/types'
import { formatDate } from '@/lib/bm/rules'
import { api, Button, Card, Field, Input, Notice, PageHeader, Select, StatCard, StatusBadge, type StatusTone, Tabs } from '@/components/ui'
import { RangeChart } from '@/components/range-chart'
import { EnvQuickLog } from '@/components/env-quick-log'
import { AttachmentList } from '@/components/attachments'

type TabKey = 'dashboard' | 'corrective' | 'units'

const KIND_LABEL: Record<string, string> = { fridge: 'ตู้เย็น', freezer: 'ตู้แช่แข็ง', room: 'ห้อง', incubator: 'ตู้บ่ม', other: 'อื่นๆ' }

function cardTone(status: EnvCardStatus): StatusTone {
  if (status === 'out-of-range') return 'rejected'
  if (status === 'pending') return 'warning'
  if (status === 'corrected') return 'warning'
  return 'accepted'
}
function cardLabel(status: EnvCardStatus): string {
  return status === 'out-of-range' ? 'นอกช่วง' : status === 'pending' ? 'ยังไม่บันทึก' : status === 'corrected' ? 'แก้ไขแล้ว' : 'ปกติ'
}

export function EnvironmentView({ actor, initialData, origin }: { actor: BmActor; initialData: EnvWorkspace; origin: string }) {
  const router = useRouter()
  const [tab, setTab] = useState<TabKey>('dashboard')
  const data = initialData
  const isAdmin = actor.role === 'Admin'

  const tabs: { key: TabKey; label: string; icon: typeof LayoutGrid }[] = [
    { key: 'dashboard', label: 'แดชบอร์ด', icon: LayoutGrid },
    { key: 'corrective', label: `Corrective (${data.summary.openCorrectiveActions})`, icon: ClipboardList },
  ]
  if (isAdmin) tabs.push({ key: 'units', label: 'จัดการตู้', icon: Settings2 })

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="Monitoring" title="อุณหภูมิ / Temperature" description="บันทึกอุณหภูมิตู้เย็น/ตู้แช่รายวัน คุม cold chain ของน้ำยา (วันละ 1 รอบ/ตู้)" />

      {data.summary.pendingToday > 0 || data.summary.outOfRangeToday > 0 ? (
        <Notice tone={data.summary.outOfRangeToday > 0 ? 'danger' : 'warning'}>
          {data.summary.outOfRangeToday > 0 ? `${data.summary.outOfRangeToday} ตู้มีค่านอกช่วงวันนี้ · ` : ''}
          {data.summary.pendingToday > 0 ? `${data.summary.pendingToday} ตู้ยังไม่บันทึกวันนี้ (${formatDate(data.today)})` : 'บันทึกครบทุกตู้แล้ววันนี้'}
        </Notice>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="ตู้ทั้งหมด" value={data.summary.unitCount} />
        <StatCard label="บันทึกแล้ววันนี้" value={data.summary.loggedToday} tone="accepted" />
        <StatCard label="ยังไม่บันทึก" value={data.summary.pendingToday} tone={data.summary.pendingToday ? 'warning' : 'neutral'} />
        <StatCard label="นอกช่วงวันนี้" value={data.summary.outOfRangeToday} tone={data.summary.outOfRangeToday ? 'rejected' : 'neutral'} />
      </div>

      <Tabs tabs={tabs} active={tab} onChange={setTab} />

      {tab === 'dashboard' ? (
        data.cards.length ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {data.cards.map((card) => (
              <UnitCard key={card.unit.id} card={card} onChanged={() => router.refresh()} />
            ))}
          </div>
        ) : (
          <Card className="p-8 text-center text-sm text-[#789097]">
            ยังไม่มีตู้ที่เฝ้าระวัง {isAdmin ? '— เพิ่มได้ที่แท็บจัดการตู้' : '— แจ้ง Admin เพื่อเพิ่มตู้'}
          </Card>
        )
      ) : null}

      {tab === 'corrective' ? <CorrectiveList data={data} onChanged={() => router.refresh()} /> : null}

      {tab === 'units' && isAdmin ? <UnitsAdmin data={data} origin={origin} onChanged={() => router.refresh()} /> : null}
    </div>
  )
}

function UnitCard({ card, onChanged }: { card: EnvWorkspace['cards'][number]; onChanged: () => void }) {
  const [logging, setLogging] = useState(false)
  const { unit } = card
  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-bold text-[#173d50]">{unit.name}</h3>
            <StatusBadge tone={cardTone(card.status)} label={cardLabel(card.status)} />
          </div>
          <p className="mt-0.5 text-xs text-[#789097]">
            {unit.code} · {KIND_LABEL[unit.kind] ?? unit.kind}
            {unit.locationName ? ` · ${unit.locationName}` : ''} · ช่วง {unit.minLimit ?? '—'}–{unit.maxLimit ?? '—'} {unit.unit}
          </p>
        </div>
        <div className="text-right">
          <p className="mono text-lg font-bold tabular-nums text-[#173d50]">
            {card.lastReading ? `${card.lastReading.readingValue} ${unit.unit}` : '—'}
          </p>
          <p className="text-[11px] text-[#8ba0a5]">{card.lastReading ? formatDate(card.lastReading.readingDate) : 'ยังไม่มีข้อมูล'}</p>
        </div>
      </div>

      <div className="mt-3">
        <RangeChart points={card.points} minLimit={unit.minLimit} maxLimit={unit.maxLimit} unit={unit.unit} label={unit.name} />
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="text-[11px] text-[#8ba0a5]">
          {card.openCorrectiveActions > 0 ? <span className="inline-flex items-center gap-1 text-[#c02a37]"><AlertTriangle className="size-3" /> {card.openCorrectiveActions} CA ค้าง</span> : ''}
        </span>
        {card.loggedToday ? (
          <span className="text-xs font-semibold text-[#2f7d44]">บันทึกวันนี้แล้ว</span>
        ) : (
          <Button className="min-h-8 px-3 py-1.5 text-xs" onClick={() => setLogging((v) => !v)}><Thermometer className="size-3.5" /> บันทึกวันนี้</Button>
        )}
      </div>

      {logging && !card.loggedToday ? (
        <div className="mt-3 rounded-md border border-[#d6e2e3] bg-[#f8fbfb] p-3">
          <EnvQuickLog unit={unit} autoFocus onLogged={onChanged} />
        </div>
      ) : null}
    </Card>
  )
}

function CorrectiveList({ data, onChanged }: { data: EnvWorkspace; onChanged: () => void }) {
  const [busyId, setBusyId] = useState('')
  async function close(id: string) {
    setBusyId(id)
    try {
      await api(`/api/environment/corrective-actions/${id}`, { method: 'PATCH', body: JSON.stringify({ status: 'closed' }) })
      onChanged()
    } finally {
      setBusyId('')
    }
  }
  if (!data.correctiveActions.length) return <Card className="p-8 text-center text-sm text-[#789097]">ไม่มี corrective action</Card>
  return (
    <div className="space-y-3">
      {data.correctiveActions.map((ca) => (
        <Card key={ca.id} className="p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-bold text-[#173d50]">{ca.unitName}</h3>
                <StatusBadge tone={ca.status === 'closed' ? 'accepted' : 'warning'} label={ca.status === 'closed' ? 'ปิดแล้ว' : 'เปิด'} />
              </div>
              <p className="mt-1 text-sm text-[#3f6470]"><span className="font-semibold">ปัญหา:</span> {ca.problem}</p>
              {ca.rootCause ? <p className="text-sm text-[#3f6470]"><span className="font-semibold">สาเหตุ:</span> {ca.rootCause}</p> : null}
              {ca.actionTaken ? <p className="text-sm text-[#3f6470]"><span className="font-semibold">การแก้ไข:</span> {ca.actionTaken}</p> : null}
              <p className="mt-1 text-[11px] text-[#8ba0a5]">โดย {ca.createdByName ?? '—'}</p>
            </div>
            {ca.status === 'open' ? <Button variant="secondary" className="min-h-8 px-3 py-1.5 text-xs" disabled={busyId === ca.id} onClick={() => close(ca.id)}>ปิด CA</Button> : null}
          </div>
          <div className="mt-3">
            <AttachmentList module="env" entityType="corrective-action" entityId={ca.id} kind="evidence" label="หลักฐาน / Evidence" />
          </div>
        </Card>
      ))}
    </div>
  )
}

function UnitsAdmin({ data, origin, onChanged }: { data: EnvWorkspace; origin: string; onChanged: () => void }) {
  const [form, setForm] = useState({ code: '', name: '', kind: 'fridge', minLimit: '', maxLimit: '', unit: '°C' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function create(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await api('/api/environment/units', {
        method: 'POST',
        body: JSON.stringify({
          code: form.code.trim(),
          name: form.name.trim(),
          kind: form.kind,
          minLimit: form.minLimit === '' ? null : Number(form.minLimit),
          maxLimit: form.maxLimit === '' ? null : Number(form.maxLimit),
          unit: form.unit.trim() || null,
        }),
      })
      setForm({ code: '', name: '', kind: 'fridge', minLimit: '', maxLimit: '', unit: '°C' })
      onChanged()
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'เพิ่มตู้ไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  async function toggleActive(unit: EnvUnit) {
    await api(`/api/environment/units/${unit.id}`, { method: 'PATCH', body: JSON.stringify({ isActive: !unit.isActive }) })
    onChanged()
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
      <Card className="p-4">
        <h3 className="flex items-center gap-2 font-bold text-[#173d50]"><Plus className="size-4" /> เพิ่มตู้</h3>
        <form onSubmit={create} className="mt-3 space-y-3">
          <Field label="รหัส / Code"><Input required value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="FRZ-A" /></Field>
          <Field label="ชื่อ / Name"><Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="ตู้เย็นเก็บน้ำยา ชั้น A" /></Field>
          <Field label="ชนิด / Kind">
            <Select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
              <option value="fridge">ตู้เย็น</option>
              <option value="freezer">ตู้แช่แข็ง</option>
              <option value="room">ห้อง</option>
              <option value="incubator">ตู้บ่ม</option>
              <option value="other">อื่นๆ</option>
            </Select>
          </Field>
          <div className="grid grid-cols-3 gap-2">
            <Field label="Min"><Input type="number" step="any" value={form.minLimit} onChange={(e) => setForm({ ...form, minLimit: e.target.value })} placeholder="2" /></Field>
            <Field label="Max"><Input type="number" step="any" value={form.maxLimit} onChange={(e) => setForm({ ...form, maxLimit: e.target.value })} placeholder="8" /></Field>
            <Field label="หน่วย"><Input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} /></Field>
          </div>
          {error ? <Notice tone="danger">{error}</Notice> : null}
          <Button type="submit" disabled={busy}>{busy ? 'กำลังบันทึก…' : 'เพิ่มตู้'}</Button>
        </form>
      </Card>

      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-bold text-[#173d50]">ตู้ที่เฝ้าระวัง ({data.units.length})</h3>
          <Link href="/environment/qr" className="inline-flex items-center gap-1.5 rounded-md border border-[#c9dadd] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#244854] hover:border-[#7fa9ad]"><QrCodeIcon className="size-3.5" /> พิมพ์ QR ทั้งหมด</Link>
        </div>
        <div className="mt-3 space-y-2">
          {data.units.map((unit) => (
            <div key={unit.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-[#e3ebec] px-3 py-2">
              <div className="flex items-center gap-3">
                {origin ? <a href={`/environment/u/${unit.qrToken}`} target="_blank" rel="noreferrer" title="เปิดฟอร์มบันทึก"><QrCode value={`${origin}/environment/u/${unit.qrToken}`} size={56} /></a> : <div className="size-14" />}
                <div>
                  <p className="font-semibold text-[#173d50]">{unit.name} <span className="mono text-xs text-[#789097]">{unit.code}</span></p>
                  <p className="text-[11px] text-[#8ba0a5]">{KIND_LABEL[unit.kind] ?? unit.kind} · {unit.minLimit ?? '—'}–{unit.maxLimit ?? '—'} {unit.unit}</p>
                </div>
              </div>
              <Button variant={unit.isActive ? 'secondary' : 'primary'} className="min-h-8 px-3 py-1.5 text-xs" onClick={() => toggleActive(unit)}>
                {unit.isActive ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}
              </Button>
            </div>
          ))}
          {!data.units.length ? <p className="text-sm text-[#789097]">ยังไม่มีตู้</p> : null}
        </div>
      </Card>
    </div>
  )
}
