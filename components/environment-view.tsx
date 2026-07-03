'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AlertTriangle, ClipboardList, Download, History, LayoutGrid, Pencil, Plus, QrCode as QrCodeIcon, Settings2, Thermometer, X } from 'lucide-react'
import { QrCode } from '@/components/qr-code'
import type { BmActor } from '@/lib/bm/types'
import type { EnvCardStatus, EnvUnit, EnvWorkspace } from '@/lib/env/types'
import { formatDate } from '@/lib/bm/rules'
import { api, Button, Card, Field, Input, Notice, PageHeader, Select, StatCard, StatusBadge, type StatusTone, Tabs } from '@/components/ui'

function downloadCsv(filename: string, rows: string[][]) {
  const bom = '﻿'
  const content = bom + rows.map((row) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
import { RangeChart } from '@/components/range-chart'
import { EnvQuickLog } from '@/components/env-quick-log'
import { AttachmentList } from '@/components/attachments'

type TabKey = 'dashboard' | 'corrective' | 'units' | 'history'

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
    { key: 'history', label: 'ประวัติ / History', icon: History },
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

      {tab === 'history' ? <HistoryTab data={data} actor={actor} onChanged={() => router.refresh()} /> : null}

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
          <span className="text-xs font-semibold text-[#2f7d44]">
            บันทึกวันนี้แล้ว{card.unit.readingsPerDay > 1 ? ` (${card.todayReadingCount}/${card.unit.readingsPerDay})` : ''}
          </span>
        ) : (
          <Button className="min-h-8 px-3 py-1.5 text-xs" onClick={() => setLogging((v) => !v)}>
            <Thermometer className="size-3.5" />
            บันทึก{card.unit.readingsPerDay > 1 ? ` (${card.todayReadingCount}/${card.unit.readingsPerDay})` : 'วันนี้'}
          </Button>
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

function StatBox({ label, value, unit, tone = 'normal' }: { label: string; value: string; unit?: string; tone?: 'normal' | 'danger' }) {
  return (
    <Card className="p-3">
      <p className="text-[10px] font-bold text-[#789097]">{label}</p>
      <p className={`mono mt-1 text-lg font-bold leading-none ${tone === 'danger' ? 'text-[#be3d49]' : 'text-[#173d50]'}`}>{value}</p>
      {unit ? <p className="mt-0.5 text-[10px] text-[#8ba0a5]">{unit}</p> : null}
    </Card>
  )
}

function currentYearMonth() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function daysInYearMonth(ym: string) {
  const [y, m] = ym.split('-').map(Number)
  return new Date(y, m, 0).getDate()
}

function sd(values: number[]) {
  if (values.length < 2) return null
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / (values.length - 1)
  return Math.sqrt(variance)
}

function HistoryTab({ data, actor, onChanged }: { data: EnvWorkspace; actor: BmActor; onChanged: () => void }) {
  const isAdmin = actor.role === 'Admin'
  const [unitId, setUnitId] = useState(data.units[0]?.id ?? '')
  const [month, setMonth] = useState(currentYearMonth)
  const [showVoided, setShowVoided] = useState(false)
  const unit = data.units.find((u) => u.id === unitId)

  const allUnitReadings = useMemo(
    () => data.readings.filter((r) => r.unitId === unitId && (showVoided || !r.isVoided))
      .sort((a, b) => b.readingDate.localeCompare(a.readingDate) || b.createdAt.localeCompare(a.createdAt)),
    [data.readings, unitId, showVoided],
  )

  const readings = useMemo(
    () => allUnitReadings.filter((r) => r.readingDate.startsWith(month)),
    [allUnitReadings, month],
  )

  const stats = useMemo(() => {
    const valid = readings.filter((r) => !r.isVoided)
    if (!valid.length) return null
    const values = valid.map((r) => r.readingValue)
    const mean = values.reduce((a, b) => a + b, 0) / values.length
    const stdev = sd(values)
    const minObs = Math.min(...values)
    const maxObs = Math.max(...values)
    const oor = valid.filter((r) => r.status === 'out-of-range').length
    const uniqueDays = new Set(valid.map((r) => r.readingDate)).size
    const totalDays = daysInYearMonth(month)
    return { mean, stdev, minObs, maxObs, oor, oorPct: (oor / valid.length) * 100, daysLogged: uniqueDays, totalDays, count: valid.length }
  }, [readings, month])

  function exportCsv() {
    const rows: string[][] = [
      ['วันที่', `ค่า (${unit?.unit ?? ''})`, `Min`, `Max`, 'สถานะ', 'หมายเหตุ', 'บันทึกโดย', 'Voided'],
      ...readings.map((r) => [
        r.readingDate,
        String(r.readingValue),
        r.recordedMin != null ? String(r.recordedMin) : '',
        r.recordedMax != null ? String(r.recordedMax) : '',
        r.status,
        r.note ?? '',
        r.recordedByName ?? '',
        r.isVoided ? 'yes' : '',
      ]),
    ]
    downloadCsv(`temp_${unit?.code ?? 'export'}_${new Date().toISOString().slice(0, 10)}.csv`, rows)
  }

  function exportMonthlyReport() {
    if (!unit || !stats) return
    const totalDays = daysInYearMonth(month)
    const [y, m] = month.split('-').map(Number)
    const byDate = new Map<string, typeof readings[number][]>()
    for (const r of readings.filter((r) => !r.isVoided)) {
      byDate.set(r.readingDate, [...(byDate.get(r.readingDate) ?? []), r])
    }
    const dayRows: string[][] = []
    for (let d = 1; d <= totalDays; d++) {
      const date = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      const rs = byDate.get(date) ?? []
      if (rs.length === 0) {
        dayRows.push([date, '', '', '', 'ไม่มีข้อมูล', '', ''])
      } else {
        for (const r of rs) {
          dayRows.push([date, String(r.readingValue), r.recordedMin != null ? String(r.recordedMin) : '', r.recordedMax != null ? String(r.recordedMax) : '', r.status === 'out-of-range' ? 'นอกช่วง' : r.status === 'corrected' ? 'แก้ไขแล้ว' : 'ปกติ', r.note ?? '', r.recordedByName ?? ''])
        }
      }
    }
    const rows: string[][] = [
      [`รายงานอุณหภูมิรายเดือน — ${unit.name} (${unit.code})`],
      [`เดือน: ${month}  |  ช่วงอนุญาต: ${unit.minLimit ?? '—'} ถึง ${unit.maxLimit ?? '—'} ${unit.unit}`],
      [],
      ['วันที่', `ค่า (${unit.unit})`, 'Min', 'Max', 'สถานะ', 'หมายเหตุ', 'บันทึกโดย'],
      ...dayRows,
      [],
      ['สรุป'],
      ['วันที่บันทึก', `${stats.daysLogged}/${stats.totalDays} วัน`],
      ['จำนวน reading', String(stats.count)],
      ['ค่าเฉลี่ย (Mean)', stats.mean.toFixed(2)],
      ['SD', stats.stdev != null ? stats.stdev.toFixed(2) : '-'],
      ['ต่ำสุดที่บันทึก', String(stats.minObs)],
      ['สูงสุดที่บันทึก', String(stats.maxObs)],
      ['นอกช่วง', `${stats.oor} ครั้ง (${stats.oorPct.toFixed(1)}%)`],
    ]
    downloadCsv(`temp_monthly_${unit.code}_${month}.csv`, rows)
  }

  async function voidReading(id: string) {
    const reason = window.prompt('เหตุผลที่ void reading:')
    if (!reason?.trim()) return
    await api(`/api/environment/readings/${id}/void`, { method: 'POST', body: JSON.stringify({ reason }) })
    onChanged()
  }

  const statusLabel: Record<string, string> = { 'in-range': 'ปกติ', 'out-of-range': 'นอกช่วง', corrected: 'แก้ไขแล้ว' }
  const statusTone: Record<string, string> = { 'in-range': 'text-[#2f7d44] bg-[#edf6ef]', 'out-of-range': 'text-[#a83541] bg-[#fff1f2]', corrected: 'text-[#7a5c00] bg-[#fffae5]' }

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <Select value={unitId} onChange={(e) => setUnitId(e.target.value)} className="w-56">
              {data.units.map((u) => <option key={u.id} value={u.id}>{u.name} ({u.code})</option>)}
            </Select>
            <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-36" />
            <label className="flex cursor-pointer items-center gap-1.5 text-xs text-[#58747d]">
              <input type="checkbox" checked={showVoided} onChange={(e) => setShowVoided(e.target.checked)} className="size-3.5" />
              แสดง void ด้วย
            </label>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" className="min-h-8 px-3 py-1.5 text-xs" onClick={exportMonthlyReport} disabled={!stats}>
              <Download className="size-3.5" /> รายงานรายเดือน
            </Button>
            <Button variant="secondary" className="min-h-8 px-3 py-1.5 text-xs" onClick={exportCsv} disabled={!readings.length}>
              <Download className="size-3.5" /> Raw CSV
            </Button>
          </div>
        </div>
      </Card>

      {stats ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          <StatBox label="วันที่บันทึก" value={`${stats.daysLogged}/${stats.totalDays}`} unit="วัน" />
          <StatBox label="Reading" value={String(stats.count)} unit="ครั้ง" />
          <StatBox label="Mean" value={stats.mean.toFixed(2)} unit={unit?.unit} />
          <StatBox label="SD" value={stats.stdev != null ? stats.stdev.toFixed(2) : '—'} unit={unit?.unit} />
          <StatBox label="Min (obs)" value={String(stats.minObs)} unit={unit?.unit} />
          <StatBox label="Max (obs)" value={String(stats.maxObs)} unit={unit?.unit} />
          <StatBox label="นอกช่วง" value={`${stats.oor} (${stats.oorPct.toFixed(1)}%)`} tone={stats.oor > 0 ? 'danger' : 'normal'} />
        </div>
      ) : null}

      {readings.length > 0 && unit ? (
        <Card className="p-4">
          <RangeChart
            points={readings
              .filter((r) => !r.isVoided)
              .slice()
              .reverse()
              .map((r) => ({ id: r.id, readingDate: r.readingDate, value: r.readingValue, status: r.status, isVoided: r.isVoided }))}
            minLimit={unit.minLimit}
            maxLimit={unit.maxLimit}
            unit={unit.unit}
            label={unit.name}
          />
        </Card>
      ) : null}

      {readings.length === 0 ? (
        <Card className="p-8 text-center text-sm text-[#789097]">ไม่มีข้อมูลในเดือนนี้</Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-[#e3ebec] bg-[#f6f9fa] text-xs text-[#58747d]">
                <tr>
                  <th className="px-4 py-2.5 text-left">วันที่</th>
                  <th className="px-4 py-2.5 text-right">ค่า ({unit?.unit})</th>
                  <th className="px-4 py-2.5 text-right">Min</th>
                  <th className="px-4 py-2.5 text-right">Max</th>
                  <th className="px-4 py-2.5 text-left">สถานะ</th>
                  <th className="px-4 py-2.5 text-left">หมายเหตุ</th>
                  <th className="px-4 py-2.5 text-left">บันทึกโดย</th>
                  {isAdmin ? <th className="px-4 py-2.5" /> : null}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f0f4f5]">
                {readings.map((r) => (
                  <tr key={r.id} className={r.isVoided ? 'opacity-40 line-through' : 'hover:bg-[#f8fbfb]'}>
                    <td className="mono px-4 py-2.5 text-xs text-[#244854]">{formatDate(r.readingDate)}</td>
                    <td className="mono px-4 py-2.5 text-right font-semibold text-[#173d50]">{r.readingValue}</td>
                    <td className="mono px-4 py-2.5 text-right text-xs text-[#789097]">{r.recordedMin ?? '—'}</td>
                    <td className="mono px-4 py-2.5 text-right text-xs text-[#789097]">{r.recordedMax ?? '—'}</td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusTone[r.status] ?? ''}`}>
                        {statusLabel[r.status] ?? r.status}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-[#58747d]">{r.note ?? ''}</td>
                    <td className="px-4 py-2.5 text-xs text-[#789097]">{r.recordedByName ?? '—'}</td>
                    {isAdmin ? (
                      <td className="px-4 py-2.5 text-right">
                        {!r.isVoided ? (
                          <button type="button" onClick={() => voidReading(r.id)} className="text-[11px] text-[#a83541] hover:underline">void</button>
                        ) : (
                          <span className="text-[11px] text-[#789097]">voided</span>
                        )}
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="border-t border-[#e3ebec] px-4 py-2 text-[11px] text-[#8ba0a5]">{readings.length} รายการ</p>
        </Card>
      )}
    </div>
  )
}

function UnitsAdmin({ data, origin, onChanged }: { data: EnvWorkspace; origin: string; onChanged: () => void }) {
  const [form, setForm] = useState({ code: '', name: '', kind: 'fridge', minLimit: '', maxLimit: '', unit: '°C' })
  const [editingUnit, setEditingUnit] = useState<EnvUnit | null>(null)
  const [editForm, setEditForm] = useState({ name: '', kind: 'fridge', minLimit: '', maxLimit: '', unit: '°C' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  function startEdit(unit: EnvUnit) {
    setEditingUnit(unit)
    setEditForm({
      name: unit.name,
      kind: unit.kind,
      minLimit: unit.minLimit != null ? String(unit.minLimit) : '',
      maxLimit: unit.maxLimit != null ? String(unit.maxLimit) : '',
      unit: unit.unit,
    })
    setError('')
  }

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

  async function saveEdit(event: React.FormEvent) {
    event.preventDefault()
    if (!editingUnit) return
    setBusy(true)
    setError('')
    try {
      await api(`/api/environment/units/${editingUnit.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: editForm.name.trim(),
          kind: editForm.kind,
          minLimit: editForm.minLimit === '' ? null : Number(editForm.minLimit),
          maxLimit: editForm.maxLimit === '' ? null : Number(editForm.maxLimit),
          unit: editForm.unit.trim() || null,
        }),
      })
      setEditingUnit(null)
      onChanged()
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'บันทึกไม่สำเร็จ')
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
        {editingUnit ? (
          <>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="flex items-center gap-2 font-bold text-[#173d50]"><Pencil className="size-4" /> แก้ไขตู้</h3>
              <button type="button" onClick={() => { setEditingUnit(null); setError('') }} className="text-[#789097] hover:text-[#173d50]"><X className="size-4" /></button>
            </div>
            <p className="mb-3 mono text-xs text-[#789097]">{editingUnit.code}</p>
            <form onSubmit={saveEdit} className="space-y-3">
              <Field label="ชื่อ / Name"><Input required value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} /></Field>
              <Field label="ชนิด / Kind">
                <Select value={editForm.kind} onChange={(e) => setEditForm({ ...editForm, kind: e.target.value })}>
                  <option value="fridge">ตู้เย็น</option>
                  <option value="freezer">ตู้แช่แข็ง</option>
                  <option value="room">ห้อง</option>
                  <option value="incubator">ตู้บ่ม</option>
                  <option value="other">อื่นๆ</option>
                </Select>
              </Field>
              <div className="grid grid-cols-3 gap-2">
                <Field label="Min"><Input type="number" step="any" value={editForm.minLimit} onChange={(e) => setEditForm({ ...editForm, minLimit: e.target.value })} placeholder="2" /></Field>
                <Field label="Max"><Input type="number" step="any" value={editForm.maxLimit} onChange={(e) => setEditForm({ ...editForm, maxLimit: e.target.value })} placeholder="8" /></Field>
                <Field label="หน่วย"><Input value={editForm.unit} onChange={(e) => setEditForm({ ...editForm, unit: e.target.value })} /></Field>
              </div>
              {error ? <Notice tone="danger">{error}</Notice> : null}
              <div className="flex gap-2">
                <Button type="submit" disabled={busy}>{busy ? 'กำลังบันทึก…' : 'บันทึก'}</Button>
                <Button type="button" variant="secondary" onClick={() => { setEditingUnit(null); setError('') }}>ยกเลิก</Button>
              </div>
            </form>
          </>
        ) : (
          <>
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
          </>
        )}
      </Card>

      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-bold text-[#173d50]">ตู้ที่เฝ้าระวัง ({data.units.length})</h3>
          <Link href="/environment/qr" className="inline-flex items-center gap-1.5 rounded-md border border-[#c9dadd] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#244854] hover:border-[#7fa9ad]"><QrCodeIcon className="size-3.5" /> พิมพ์ QR ทั้งหมด</Link>
        </div>
        <div className="mt-3 space-y-2">
          {data.units.map((unit) => (
            <div key={unit.id} className={`flex flex-wrap items-center justify-between gap-3 rounded-md border px-3 py-2 ${editingUnit?.id === unit.id ? 'border-[#0b7f76] bg-[#eef9f7]' : 'border-[#e3ebec]'}`}>
              <div className="flex items-center gap-3">
                {origin ? <a href={`/environment/u/${unit.qrToken}`} target="_blank" rel="noreferrer" title="เปิดฟอร์มบันทึก"><QrCode value={`${origin}/environment/u/${unit.qrToken}`} size={56} /></a> : <div className="size-14" />}
                <div>
                  <p className="font-semibold text-[#173d50]">{unit.name} <span className="mono text-xs text-[#789097]">{unit.code}</span></p>
                  <p className="text-[11px] text-[#8ba0a5]">{KIND_LABEL[unit.kind] ?? unit.kind} · {unit.minLimit ?? '—'}–{unit.maxLimit ?? '—'} {unit.unit}</p>
                </div>
              </div>
              <div className="flex gap-1.5">
                <Button variant="secondary" className="min-h-8 px-2.5 py-1.5 text-xs" onClick={() => startEdit(unit)}><Pencil className="size-3" /></Button>
                <Button variant={unit.isActive ? 'secondary' : 'primary'} className="min-h-8 px-3 py-1.5 text-xs" onClick={() => toggleActive(unit)}>
                  {unit.isActive ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}
                </Button>
              </div>
            </div>
          ))}
          {!data.units.length ? <p className="text-sm text-[#789097]">ยังไม่มีตู้</p> : null}
        </div>
      </Card>
    </div>
  )
}
