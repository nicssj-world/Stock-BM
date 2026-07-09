'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Bell, ClipboardList, Download, Droplets, History, LayoutGrid, Lock, Pencil, Plus, QrCode as QrCodeIcon, Settings2, Thermometer, Trash2, Unlock, X } from 'lucide-react'
import { QrCode } from '@/components/qr-code'
import type { BmActor } from '@/lib/bm/types'
import type { EnvCardStatus, EnvPeriodIndex, EnvReadingStatus, EnvUnit, EnvWorkspace } from '@/lib/env/types'
import { envPeriodLabel, envPeriodOptions } from '@/lib/env/types'
import { formatDate, formatDateTime } from '@/lib/bm/rules'
import { api, Button, Card, Field, Input, Notice, PageHeader, Select, StatCard, StatusBadge, Textarea, type StatusTone, Tabs } from '@/components/ui'

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
const AVAILABILITY_LABEL: Record<string, string> = { active: 'ใช้งาน', maintenance: 'ซ่อม', paused: 'พักใช้งาน' }

function cardTone(status: EnvCardStatus): StatusTone {
  if (status === 'out-of-range') return 'rejected'
  if (status === 'pending') return 'warning'
  if (status === 'corrected') return 'warning'
  if (status === 'unavailable') return 'neutral'
  return 'accepted'
}
function cardLabel(status: EnvCardStatus): string {
  return status === 'out-of-range' ? 'นอกช่วง' : status === 'pending' ? 'ยังไม่บันทึก' : status === 'corrected' ? 'แก้ไขแล้ว' : status === 'unavailable' ? 'หยุดชั่วคราว' : 'ปกติ'
}

function unitCardShell(status: EnvCardStatus): string {
  if (status === 'out-of-range') return 'border-l-4 border-l-[#c02a37] shadow-[0_16px_36px_rgba(192,42,55,0.10)]'
  if (status === 'pending') return 'border-l-4 border-l-[#d48624] shadow-[0_16px_36px_rgba(212,134,36,0.10)]'
  if (status === 'corrected') return 'border-l-4 border-l-[#d48624]'
  if (status === 'unavailable') return 'border-l-4 border-l-[#91a4a9] opacity-90'
  return 'border-l-4 border-l-[#2f9b68] shadow-[0_14px_32px_rgba(11,127,118,0.08)]'
}

function unitUnavailableText(unit: EnvUnit) {
  if (unit.availabilityStatus === 'active') return ''
  const dates = [unit.unavailableFrom, unit.unavailableUntil].filter(Boolean).join(' ถึง ')
  return `${AVAILABILITY_LABEL[unit.availabilityStatus] ?? unit.availabilityStatus}${dates ? ` (${dates})` : ''}${unit.unavailableNote ? ` · ${unit.unavailableNote}` : ''}`
}

function nextMissingPeriod(unit: EnvUnit, loggedPeriods: EnvPeriodIndex[]): EnvPeriodIndex {
  return envPeriodOptions(unit.readingsPerDay).find((option) => !loggedPeriods.includes(option.periodIndex))?.periodIndex
    ?? envPeriodOptions(unit.readingsPerDay)[0]?.periodIndex
    ?? 1
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

      {data.summary.dueNowCount > 0 ? (
        <Notice tone="warning">
          <span className="inline-flex items-center gap-1.5 leading-none">
            <Bell className="size-4 shrink-0" />
            <span className="font-semibold">Reminder:</span>
            <span>ถึงรอบบันทึกแล้ว {data.summary.dueNowCount} ตู้ / {data.summary.dueNowPeriodCount} รอบ</span>
          </span>
        </Notice>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="ตู้ทั้งหมด" value={data.summary.unitCount} />
        <StatCard label="บันทึกแล้ววันนี้" value={data.summary.loggedToday} tone="accepted" />
        <StatCard label="ยังไม่บันทึก" value={data.summary.pendingToday} tone={data.summary.pendingToday ? 'warning' : 'neutral'} />
        <StatCard label="ถึงรอบแล้ว" value={data.summary.dueNowCount} tone={data.summary.dueNowCount ? 'warning' : 'neutral'} hint={`${data.summary.dueNowPeriodCount} รอบ`} />
        <StatCard label="นอกช่วงวันนี้" value={data.summary.outOfRangeToday} tone={data.summary.outOfRangeToday ? 'rejected' : 'neutral'} />
      </div>

      <Tabs tabs={tabs} active={tab} onChange={setTab} />

      {tab === 'dashboard' ? (
        data.cards.length ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {data.cards.map((card) => (
              <UnitCard key={card.unit.id} card={card} isAdmin={isAdmin} onChanged={() => router.refresh()} />
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

function UnitCard({ card, isAdmin, onChanged }: { card: EnvWorkspace['cards'][number]; isAdmin: boolean; onChanged: () => void }) {
  const [logging, setLogging] = useState(false)
  const { unit } = card
  return (
    <Card className={`p-4 transition-shadow duration-200 hover:shadow-md ${unitCardShell(card.status)}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-bold text-[#173d50]">{unit.name}</h3>
            <StatusBadge tone={cardTone(card.status)} label={cardLabel(card.status)} />
          </div>
          <p className="mt-0.5 text-xs text-[#789097]">
            {unit.code} · {KIND_LABEL[unit.kind] ?? unit.kind}
            {unit.locationCode ? ` · Location ${unit.locationCode}` : ''}
            {unit.locationName ? ` (${unit.locationName})` : ''} · ช่วง {unit.minLimit ?? '—'}–{unit.maxLimit ?? '—'} {unit.unit}
            {unit.trackHumidity ? ` · RH ${unit.humidityMinLimit ?? '—'}–${unit.humidityMaxLimit ?? '—'}%` : ''}
          </p>
          <p className="mt-0.5 text-[11px] text-[#8ba0a5]">
            {unit.thermometerId ? `Thermometer ${unit.thermometerId}` : ''}
            {unit.thermometerId && unit.dataloggerId ? ' · ' : ''}
            {unit.dataloggerId ? `Datalogger ${unit.dataloggerId}` : ''}
            {(unit.thermometerId || unit.dataloggerId) && unit.calibrationDueDate ? ' · ' : ''}
            {unit.calibrationDueDate ? `Cal due ${formatDate(unit.calibrationDueDate)}` : ''}
          </p>
          {unit.availabilityStatus !== 'active' ? <p className="mt-0.5 text-[11px] font-semibold text-[#a9700f]">{unitUnavailableText(unit)}</p> : null}
        </div>
        <div className="text-right">
          <p className="mono text-lg font-bold tabular-nums text-[#173d50]">
            {card.lastReading ? `${card.lastReading.readingValue} ${unit.unit}` : '—'}
          </p>
          {card.lastReading?.humidityPercent != null ? <p className="mono text-[11px] font-semibold text-[#58747d]">RH {card.lastReading.humidityPercent}%</p> : null}
          <p className="text-[11px] text-[#8ba0a5]">{card.lastReading ? formatDate(card.lastReading.readingDate) : 'ยังไม่มีข้อมูล'}</p>
        </div>
      </div>

      <div className="mt-3 rounded-md border border-[#d6e6e7] bg-gradient-to-b from-white to-[#f7fbfb] p-2 shadow-inner">
        <RangeChart points={card.points} minLimit={unit.minLimit} maxLimit={unit.maxLimit} unit={unit.unit} label={unit.name} showPeriodLabels={unit.readingsPerDay > 1} />
      </div>
      {unit.trackHumidity ? (
        <div className="mt-3 rounded-md border border-[#cde3ea] bg-gradient-to-b from-[#fbfefe] to-[#f3fafc] p-2 shadow-inner">
          <p className="mb-1 flex items-center gap-1.5 text-xs font-bold text-[#315763]"><Droplets className="size-3.5 text-[#0b7f76]" /> Relative humidity</p>
          <RangeChart
            points={card.points
              .filter((point) => point.humidityValue != null)
              .map((point) => ({
                ...point,
                value: point.humidityValue as number,
                status: rangeStatus(point.humidityValue as number, unit.humidityMinLimit, unit.humidityMaxLimit),
              }))}
            minLimit={unit.humidityMinLimit}
            maxLimit={unit.humidityMaxLimit}
            unit="%"
            label={`${unit.name} RH`}
            metricLabel="Relative humidity"
            showPeriodLabels={unit.readingsPerDay > 1}
          />
        </div>
      ) : null}

      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="text-[11px] text-[#8ba0a5]">
          {card.openCorrectiveActions > 0 ? <span className="inline-flex items-center gap-1 text-[#c02a37]"><AlertTriangle className="size-3" /> {card.openCorrectiveActions} CA ค้าง</span> : null}
          {card.duePeriodIndexes.length > 0 && !card.openCorrectiveActions ? (
            <span className="inline-flex items-center gap-1 font-semibold text-[#a9700f]"><Bell className="size-3" /> ถึงรอบ: {card.duePeriodIndexes.map(envPeriodLabel).join(', ')}</span>
          ) : null}
          {unit.readingsPerDay > 1 && !card.openCorrectiveActions && !card.duePeriodIndexes.length ? (
            <span>{card.todayPeriodIndexes.length ? `บันทึกแล้ว: ${card.todayPeriodIndexes.map(envPeriodLabel).join(', ')}` : 'ยังไม่บันทึกรอบวันนี้'}</span>
          ) : null}
        </span>
        {card.status === 'unavailable' && !isAdmin ? (
          <span className="text-xs font-semibold text-[#789097]">{AVAILABILITY_LABEL[unit.availabilityStatus] ?? 'หยุดชั่วคราว'}</span>
        ) : card.loggedToday && !isAdmin ? (
          <span className="text-xs font-semibold text-[#2f7d44]">
            บันทึกวันนี้แล้ว{card.unit.readingsPerDay > 1 ? ` (${card.todayReadingCount}/${card.unit.readingsPerDay})` : ''}
          </span>
        ) : (
          <Button className="min-h-8 px-3 py-1.5 text-xs" onClick={() => setLogging((v) => !v)}>
            <Thermometer className="size-3.5" />
            {card.loggedToday || card.status === 'unavailable' ? 'บันทึกย้อนหลัง' : `บันทึก${card.unit.readingsPerDay > 1 ? ` (${card.todayReadingCount}/${card.unit.readingsPerDay})` : 'วันนี้'}`}
          </Button>
        )}
      </div>

      {logging && (!card.loggedToday || isAdmin) ? (
        <div className="mt-3 rounded-md border border-[#d6e2e3] bg-[#f8fbfb] p-3">
          <EnvQuickLog unit={unit} autoFocus defaultPeriodIndex={nextMissingPeriod(unit, card.todayPeriodIndexes)} allowBackdate={isAdmin} onLogged={onChanged} />
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

function rangeStatus(value: number, minLimit: number | null, maxLimit: number | null): EnvReadingStatus {
  if (minLimit != null && value < minLimit) return 'out-of-range'
  if (maxLimit != null && value > maxLimit) return 'out-of-range'
  return 'in-range'
}

function HistoryTab({ data, actor, onChanged }: { data: EnvWorkspace; actor: BmActor; onChanged: () => void }) {
  const isAdmin = actor.role === 'Admin'
  const [unitId, setUnitId] = useState(data.units[0]?.id ?? '')
  const [month, setMonth] = useState(currentYearMonth)
  const [showVoided, setShowVoided] = useState(false)
  const [reviewNote, setReviewNote] = useState('')
  const [reviewBusy, setReviewBusy] = useState(false)
  const [reviewError, setReviewError] = useState('')
  const unit = data.units.find((u) => u.id === unitId)
  const monthlyReview = data.monthlyReviews.find((review) => review.unitId === unitId && review.yearMonth === month) ?? null
  const isLocked = Boolean(monthlyReview)

  const allUnitReadings = useMemo(
    () => data.readings.filter((r) => r.unitId === unitId && (showVoided || !r.isVoided))
      .sort((a, b) => b.readingDate.localeCompare(a.readingDate) || a.periodIndex - b.periodIndex || b.createdAt.localeCompare(a.createdAt)),
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
    const humidities = valid.map((r) => r.humidityPercent).filter((value): value is number => value != null)
    const humidityMean = humidities.length ? humidities.reduce((a, b) => a + b, 0) / humidities.length : null
    const humidityMin = humidities.length ? Math.min(...humidities) : null
    const humidityMax = humidities.length ? Math.max(...humidities) : null
    const oor = valid.filter((r) => r.status === 'out-of-range').length
    const uniqueDays = new Set(valid.map((r) => r.readingDate)).size
    const totalDays = daysInYearMonth(month)
    return { mean, stdev, minObs, maxObs, humidityMean, humidityMin, humidityMax, oor, oorPct: (oor / valid.length) * 100, daysLogged: uniqueDays, totalDays, count: valid.length }
  }, [readings, month])

  function exportCsv() {
    const rows: string[][] = [
      ['วันที่', 'รอบ', `ค่า (${unit?.unit ?? ''})`, 'Humidity (%)', `Min`, `Max`, 'สถานะ', 'หมายเหตุ', 'บันทึกโดย', 'Voided'],
      ...readings.map((r) => [
        r.readingDate,
        r.periodLabel,
        String(r.readingValue),
        r.humidityPercent != null ? String(r.humidityPercent) : '',
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
        dayRows.push([date, '', '', '', '', '', 'ไม่มีข้อมูล', '', ''])
      } else {
        for (const r of rs) {
          dayRows.push([date, r.periodLabel, String(r.readingValue), r.humidityPercent != null ? String(r.humidityPercent) : '', r.recordedMin != null ? String(r.recordedMin) : '', r.recordedMax != null ? String(r.recordedMax) : '', r.status === 'out-of-range' ? 'นอกช่วง' : r.status === 'corrected' ? 'แก้ไขแล้ว' : 'ปกติ', r.note ?? '', r.recordedByName ?? ''])
        }
      }
    }
    const rows: string[][] = [
      [`รายงานอุณหภูมิรายเดือน — ${unit.name} (${unit.code})`],
      [`เดือน: ${month}  |  ช่วงอนุญาต: ${unit.minLimit ?? '—'} ถึง ${unit.maxLimit ?? '—'} ${unit.unit}`],
      [`Review: ${monthlyReview ? `Locked by ${monthlyReview.reviewedByName ?? '-'} at ${formatDateTime(monthlyReview.reviewedAt)}` : 'Not reviewed'}`],
      monthlyReview?.note ? [`Review note: ${monthlyReview.note}`] : [],
      [],
      ['วันที่', 'รอบ', `ค่า (${unit.unit})`, 'Humidity (%)', 'Min', 'Max', 'สถานะ', 'หมายเหตุ', 'บันทึกโดย'],
      ...dayRows,
      [],
      ['สรุป'],
      ['วันที่บันทึก', `${stats.daysLogged}/${stats.totalDays} วัน`],
      ['จำนวน reading', String(stats.count)],
      ['ค่าเฉลี่ย (Mean)', stats.mean.toFixed(2)],
      ['Humidity mean (%)', stats.humidityMean != null ? stats.humidityMean.toFixed(1) : '-'],
      ['Humidity min-max (%)', stats.humidityMin != null && stats.humidityMax != null ? `${stats.humidityMin}-${stats.humidityMax}` : '-'],
      ['SD', stats.stdev != null ? stats.stdev.toFixed(2) : '-'],
      ['ต่ำสุดที่บันทึก', String(stats.minObs)],
      ['สูงสุดที่บันทึก', String(stats.maxObs)],
      ['นอกช่วง', `${stats.oor} ครั้ง (${stats.oorPct.toFixed(1)}%)`],
    ]
    downloadCsv(`temp_monthly_${unit.code}_${month}.csv`, rows)
  }

  async function voidReading(id: string) {
    if (isLocked) return
    const reason = window.prompt('เหตุผลที่ void reading:')
    if (!reason?.trim()) return
    await api(`/api/environment/readings/${id}/void`, { method: 'POST', body: JSON.stringify({ reason }) })
    onChanged()
  }

  async function lockMonth() {
    if (!unit) return
    setReviewBusy(true)
    setReviewError('')
    try {
      await api('/api/environment/monthly-reviews', { method: 'POST', body: JSON.stringify({ unitId: unit.id, yearMonth: month, note: reviewNote.trim() || null }) })
      setReviewNote('')
      onChanged()
    } catch (requestError) {
      setReviewError(requestError instanceof Error ? requestError.message : 'Review/lock ไม่สำเร็จ')
    } finally {
      setReviewBusy(false)
    }
  }

  async function unlockMonth() {
    if (!unit || !window.confirm(`ปลดล็อก ${unit.name} เดือน ${month} ใช่ไหม?`)) return
    setReviewBusy(true)
    setReviewError('')
    try {
      await api('/api/environment/monthly-reviews', { method: 'DELETE', body: JSON.stringify({ unitId: unit.id, yearMonth: month }) })
      onChanged()
    } catch (requestError) {
      setReviewError(requestError instanceof Error ? requestError.message : 'ปลดล็อกไม่สำเร็จ')
    } finally {
      setReviewBusy(false)
    }
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
            {unit ? (
              <Link
                href={`/environment/report?unitId=${encodeURIComponent(unit.id)}&month=${encodeURIComponent(month)}`}
                target="_blank"
                className="inline-flex min-h-8 items-center justify-center gap-2 rounded-md border border-[#c9dadd] bg-white px-3 py-1.5 text-xs font-semibold text-[#244854] transition hover:border-[#7fa9ad] hover:bg-[#f7fbfb]"
              >
                <Download className="size-3.5" /> แบบฟอร์ม PDF
              </Link>
            ) : null}
            <Button variant="secondary" className="min-h-8 px-3 py-1.5 text-xs" onClick={exportMonthlyReport} disabled={!stats}>
              <Download className="size-3.5" /> รายงานรายเดือน
            </Button>
            <Button variant="secondary" className="min-h-8 px-3 py-1.5 text-xs" onClick={exportCsv} disabled={!readings.length}>
              <Download className="size-3.5" /> Raw CSV
            </Button>
          </div>
        </div>
      </Card>

      <Card className={`p-4 ${isLocked ? 'border-[#c6e2ca] bg-[#f7fcf8]' : ''}`}>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-bold text-[#173d50]">Monthly review / lock</h3>
              {isLocked ? <StatusBadge tone="accepted" label="Locked" /> : <StatusBadge tone="warning" label="Not reviewed" />}
            </div>
            <p className="mt-1 text-sm text-[#58747d]">
              {isLocked
                ? `Reviewed by ${monthlyReview?.reviewedByName ?? '-'} · ${monthlyReview ? formatDateTime(monthlyReview.reviewedAt) : ''}`
                : 'ตรวจรายงานเดือนนี้แล้ว lock เพื่อกันการบันทึก/แก้ไขย้อนหลัง'}
            </p>
            {monthlyReview?.note ? <p className="mt-1 text-xs text-[#789097]">Note: {monthlyReview.note}</p> : null}
            {reviewError ? <div className="mt-2"><Notice tone="danger">{reviewError}</Notice></div> : null}
          </div>
          {isAdmin ? (
            isLocked ? (
              <Button type="button" variant="secondary" disabled={reviewBusy} onClick={unlockMonth}>
                <Unlock className="size-4" /> {reviewBusy ? 'กำลังปลดล็อก…' : 'Unlock'}
              </Button>
            ) : (
              <div className="w-full space-y-2 lg:max-w-md">
                <Field label="Review note">
                  <Textarea rows={2} value={reviewNote} onChange={(e) => setReviewNote(e.target.value)} placeholder="Optional" />
                </Field>
                <Button type="button" disabled={reviewBusy || !unit} onClick={lockMonth}>
                  <Lock className="size-4" /> {reviewBusy ? 'กำลัง lock…' : 'Review & Lock'}
                </Button>
              </div>
            )
          ) : null}
        </div>
      </Card>

      {stats ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
          <StatBox label="วันที่บันทึก" value={`${stats.daysLogged}/${stats.totalDays}`} unit="วัน" />
          <StatBox label="Reading" value={String(stats.count)} unit="ครั้ง" />
          <StatBox label="Mean" value={stats.mean.toFixed(2)} unit={unit?.unit} />
          <StatBox label="SD" value={stats.stdev != null ? stats.stdev.toFixed(2) : '—'} unit={unit?.unit} />
          <StatBox label="Min (obs)" value={String(stats.minObs)} unit={unit?.unit} />
          <StatBox label="Max (obs)" value={String(stats.maxObs)} unit={unit?.unit} />
          {unit?.trackHumidity ? <StatBox label="Humidity" value={stats.humidityMean != null ? stats.humidityMean.toFixed(1) : '—'} unit="%" /> : null}
          <StatBox label="นอกช่วง" value={`${stats.oor} (${stats.oorPct.toFixed(1)}%)`} tone={stats.oor > 0 ? 'danger' : 'normal'} />
        </div>
      ) : null}

      {readings.length > 0 && unit ? (
        <Card className="space-y-4 border-l-4 border-l-[#0b7f76] bg-gradient-to-b from-white to-[#f8fbfb] p-4 shadow-sm">
          <RangeChart
            points={readings
              .filter((r) => !r.isVoided)
              .slice()
              .reverse()
              .map((r) => ({ id: r.id, readingDate: r.readingDate, readingTime: r.readingTime, createdAt: r.createdAt, periodIndex: r.periodIndex, value: r.readingValue, status: r.status, isVoided: r.isVoided }))}
            minLimit={unit.minLimit}
            maxLimit={unit.maxLimit}
            unit={unit.unit}
            label={unit.name}
            showPeriodLabels={unit.readingsPerDay > 1}
          />
          {unit.trackHumidity ? (
            <div className="rounded-md border border-[#cde3ea] bg-gradient-to-b from-[#fbfefe] to-[#f3fafc] p-3 shadow-inner">
              <p className="mb-2 flex items-center gap-1.5 text-xs font-bold text-[#315763]"><Droplets className="size-3.5 text-[#0b7f76]" /> Relative humidity trend</p>
              <RangeChart
                points={readings
                  .filter((r) => !r.isVoided && r.humidityPercent != null)
                  .slice()
                  .reverse()
                  .map((r) => ({
                    id: r.id,
                    readingDate: r.readingDate,
                    readingTime: r.readingTime,
                    createdAt: r.createdAt,
                    periodIndex: r.periodIndex,
                    value: r.humidityPercent as number,
                    humidityValue: r.humidityPercent,
                    status: rangeStatus(r.humidityPercent as number, unit.humidityMinLimit, unit.humidityMaxLimit),
                    isVoided: r.isVoided,
                  }))}
                minLimit={unit.humidityMinLimit}
                maxLimit={unit.humidityMaxLimit}
                unit="%"
                label={`${unit.name} RH`}
                metricLabel="Relative humidity"
                showPeriodLabels={unit.readingsPerDay > 1}
              />
            </div>
          ) : null}
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
                  <th className="px-4 py-2.5 text-left">วันที่/เวลาอ่านค่า</th>
                  <th className="px-4 py-2.5 text-left">รอบ</th>
                  <th className="px-4 py-2.5 text-right">ค่า ({unit?.unit})</th>
                  <th className="px-4 py-2.5 text-right">Humidity (%)</th>
                  <th className="px-4 py-2.5 text-right">Min</th>
                  <th className="px-4 py-2.5 text-right">Max</th>
                  <th className="px-4 py-2.5 text-left">สถานะ</th>
                  <th className="px-4 py-2.5 text-left">หมายเหตุ</th>
                  <th className="px-4 py-2.5 text-left">บันทึกโดย</th>
                  <th className="px-4 py-2.5 text-left">บันทึกจริง</th>
                  {isAdmin ? <th className="px-4 py-2.5" /> : null}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f0f4f5]">
                {readings.map((r) => (
                  <tr key={r.id} className={r.isVoided ? 'opacity-40 line-through' : 'hover:bg-[#f8fbfb]'}>
                    <td className="mono px-4 py-2.5 text-xs text-[#244854]">
                      {formatDate(r.readingDate)}
                      {r.readingTime ? <span className="mt-0.5 block text-[11px] text-[#789097]">{r.readingTime}</span> : null}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-[#58747d]">{r.periodLabel}</td>
                    <td className="mono px-4 py-2.5 text-right font-semibold text-[#173d50]">{r.readingValue}</td>
                    <td className="mono px-4 py-2.5 text-right text-xs text-[#58747d]">{r.humidityPercent != null ? `${r.humidityPercent}%` : '—'}</td>
                    <td className="mono px-4 py-2.5 text-right text-xs text-[#789097]">{r.recordedMin ?? '—'}</td>
                    <td className="mono px-4 py-2.5 text-right text-xs text-[#789097]">{r.recordedMax ?? '—'}</td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusTone[r.status] ?? ''}`}>
                        {statusLabel[r.status] ?? r.status}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-[#58747d]">{r.note ?? ''}</td>
                    <td className="px-4 py-2.5 text-xs text-[#789097]">{r.recordedByName ?? '—'}</td>
                    <td className="px-4 py-2.5 text-xs text-[#789097]">{r.createdAt ? formatDateTime(r.createdAt) : '—'}</td>
                    {isAdmin ? (
                      <td className="px-4 py-2.5 text-right">
                        {isLocked ? (
                          <span className="inline-flex items-center gap-1 text-[11px] text-[#789097]"><Lock className="size-3" /> locked</span>
                        ) : !r.isVoided ? (
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
  const [form, setForm] = useState({ code: '', name: '', kind: 'fridge', locationId: '', readingsPerDay: '1', minLimit: '', maxLimit: '', unit: '°C', trackHumidity: false, humidityMinLimit: '', humidityMaxLimit: '', thermometerId: '', dataloggerId: '', calibrationDueDate: '', availabilityStatus: 'active', unavailableFrom: '', unavailableUntil: '', unavailableNote: '' })
  const [editingUnit, setEditingUnit] = useState<EnvUnit | null>(null)
  const [editForm, setEditForm] = useState({ name: '', kind: 'fridge', locationId: '', readingsPerDay: '1', minLimit: '', maxLimit: '', unit: '°C', trackHumidity: false, humidityMinLimit: '', humidityMaxLimit: '', thermometerId: '', dataloggerId: '', calibrationDueDate: '', availabilityStatus: 'active', unavailableFrom: '', unavailableUntil: '', unavailableNote: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const activeLocations = data.locations.filter((location) => location.isActive)

  function selectCreateLocation(locationId: string) {
    const location = data.locations.find((candidate) => candidate.id === locationId)
    setForm((current) => ({
      ...current,
      locationId,
      code: location && !current.code.trim() ? location.code : current.code,
      name: location && !current.name.trim() ? location.name : current.name,
    }))
  }

  function startEdit(unit: EnvUnit) {
    setEditingUnit(unit)
    setEditForm({
      name: unit.name,
      kind: unit.kind,
      locationId: unit.locationId ?? '',
      readingsPerDay: String(unit.readingsPerDay),
      minLimit: unit.minLimit != null ? String(unit.minLimit) : '',
      maxLimit: unit.maxLimit != null ? String(unit.maxLimit) : '',
      unit: unit.unit,
      trackHumidity: unit.trackHumidity,
      humidityMinLimit: unit.humidityMinLimit != null ? String(unit.humidityMinLimit) : '',
      humidityMaxLimit: unit.humidityMaxLimit != null ? String(unit.humidityMaxLimit) : '',
      thermometerId: unit.thermometerId ?? '',
      dataloggerId: unit.dataloggerId ?? '',
      calibrationDueDate: unit.calibrationDueDate ?? '',
      availabilityStatus: unit.availabilityStatus,
      unavailableFrom: unit.unavailableFrom ?? '',
      unavailableUntil: unit.unavailableUntil ?? '',
      unavailableNote: unit.unavailableNote ?? '',
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
          locationId: form.locationId || null,
          readingsPerDay: Number(form.readingsPerDay),
          minLimit: form.minLimit === '' ? null : Number(form.minLimit),
          maxLimit: form.maxLimit === '' ? null : Number(form.maxLimit),
          unit: form.unit.trim() || null,
          trackHumidity: form.trackHumidity,
          humidityMinLimit: form.trackHumidity && form.humidityMinLimit !== '' ? Number(form.humidityMinLimit) : null,
          humidityMaxLimit: form.trackHumidity && form.humidityMaxLimit !== '' ? Number(form.humidityMaxLimit) : null,
          thermometerId: form.thermometerId.trim() || null,
          dataloggerId: form.dataloggerId.trim() || null,
          calibrationDueDate: form.calibrationDueDate || null,
          availabilityStatus: form.availabilityStatus,
          unavailableFrom: form.unavailableFrom || null,
          unavailableUntil: form.unavailableUntil || null,
          unavailableNote: form.unavailableNote.trim() || null,
        }),
      })
      setForm({ code: '', name: '', kind: 'fridge', locationId: '', readingsPerDay: '1', minLimit: '', maxLimit: '', unit: '°C', trackHumidity: false, humidityMinLimit: '', humidityMaxLimit: '', thermometerId: '', dataloggerId: '', calibrationDueDate: '', availabilityStatus: 'active', unavailableFrom: '', unavailableUntil: '', unavailableNote: '' })
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
          locationId: editForm.locationId || null,
          readingsPerDay: Number(editForm.readingsPerDay),
          minLimit: editForm.minLimit === '' ? null : Number(editForm.minLimit),
          maxLimit: editForm.maxLimit === '' ? null : Number(editForm.maxLimit),
          unit: editForm.unit.trim() || null,
          trackHumidity: editForm.trackHumidity,
          humidityMinLimit: editForm.trackHumidity && editForm.humidityMinLimit !== '' ? Number(editForm.humidityMinLimit) : null,
          humidityMaxLimit: editForm.trackHumidity && editForm.humidityMaxLimit !== '' ? Number(editForm.humidityMaxLimit) : null,
          thermometerId: editForm.thermometerId.trim() || null,
          dataloggerId: editForm.dataloggerId.trim() || null,
          calibrationDueDate: editForm.calibrationDueDate || null,
          availabilityStatus: editForm.availabilityStatus,
          unavailableFrom: editForm.unavailableFrom || null,
          unavailableUntil: editForm.unavailableUntil || null,
          unavailableNote: editForm.unavailableNote.trim() || null,
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

  async function remove(unit: EnvUnit) {
    if (!window.confirm(`ลบตู้ "${unit.name}" ใช่ไหม?\n\nถ้ามีประวัติการบันทึกอุณหภูมิแล้ว ระบบจะไม่ให้ลบ เพื่อรักษาประวัติย้อนหลัง`)) return
    setBusy(true)
    setError('')
    try {
      await api(`/api/environment/units/${unit.id}`, { method: 'DELETE' })
      if (editingUnit?.id === unit.id) setEditingUnit(null)
      onChanged()
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'ลบตู้ไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
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
              <Field label="Stock Location">
                <Select value={editForm.locationId} onChange={(e) => setEditForm({ ...editForm, locationId: e.target.value })}>
                  <option value="">ไม่เชื่อม Location</option>
                  {data.locations
                    .filter((location) => location.isActive || location.id === editForm.locationId)
                    .map((location) => <option key={location.id} value={location.id}>{location.code} · {location.name}</option>)}
                </Select>
              </Field>
              <Field label="จำนวนรอบ / วัน">
                <Select value={editForm.readingsPerDay} onChange={(e) => setEditForm({ ...editForm, readingsPerDay: e.target.value })}>
                  <option value="1">1 รอบ / วัน</option>
                  <option value="2">2 รอบ: เช้า, บ่าย</option>
                  <option value="3">3 รอบ: เช้า, บ่าย, ดึก</option>
                </Select>
                <p className="mt-1 text-[11px] text-[#789097]">{envPeriodOptions(Number(editForm.readingsPerDay)).map((option) => option.label).join(' · ')}</p>
              </Field>
              <div className="grid grid-cols-3 gap-2">
                <Field label="Min"><Input type="number" step="any" value={editForm.minLimit} onChange={(e) => setEditForm({ ...editForm, minLimit: e.target.value })} placeholder="2" /></Field>
                <Field label="Max"><Input type="number" step="any" value={editForm.maxLimit} onChange={(e) => setEditForm({ ...editForm, maxLimit: e.target.value })} placeholder="8" /></Field>
                <Field label="หน่วย"><Input value={editForm.unit} onChange={(e) => setEditForm({ ...editForm, unit: e.target.value })} /></Field>
              </div>
              <div className="rounded-md border border-[#d6e2e3] bg-[#f8fbfb] p-3">
                <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-[#315763]">
                  <input type="checkbox" checked={editForm.trackHumidity} onChange={(e) => setEditForm({ ...editForm, trackHumidity: e.target.checked })} className="size-4" />
                  Track relative humidity
                </label>
                {editForm.trackHumidity ? (
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <Field label="RH Min (%)"><Input type="number" min="0" max="100" step="any" value={editForm.humidityMinLimit} onChange={(e) => setEditForm({ ...editForm, humidityMinLimit: e.target.value })} placeholder="40" /></Field>
                    <Field label="RH Max (%)"><Input type="number" min="0" max="100" step="any" value={editForm.humidityMaxLimit} onChange={(e) => setEditForm({ ...editForm, humidityMaxLimit: e.target.value })} placeholder="70" /></Field>
                  </div>
                ) : null}
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <Field label="Thermometer ID"><Input value={editForm.thermometerId} onChange={(e) => setEditForm({ ...editForm, thermometerId: e.target.value })} placeholder="เช่น TM-001" /></Field>
                <Field label="Datalogger ID"><Input value={editForm.dataloggerId} onChange={(e) => setEditForm({ ...editForm, dataloggerId: e.target.value })} placeholder="เช่น DL-001" /></Field>
              </div>
              <Field label="Calibration due date"><Input type="date" value={editForm.calibrationDueDate} onChange={(e) => setEditForm({ ...editForm, calibrationDueDate: e.target.value })} /></Field>
              <Field label="สถานะตู้">
                <Select value={editForm.availabilityStatus} onChange={(e) => setEditForm({ ...editForm, availabilityStatus: e.target.value })}>
                  <option value="active">ใช้งาน</option>
                  <option value="maintenance">ซ่อม</option>
                  <option value="paused">พักใช้งานชั่วคราว</option>
                </Select>
              </Field>
              {editForm.availabilityStatus !== 'active' ? (
                <div className="space-y-2 rounded-md border border-[#eed4a6] bg-[#fffaf0] p-3">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Field label="ตั้งแต่"><Input type="date" value={editForm.unavailableFrom} onChange={(e) => setEditForm({ ...editForm, unavailableFrom: e.target.value })} /></Field>
                    <Field label="ถึง"><Input type="date" value={editForm.unavailableUntil} onChange={(e) => setEditForm({ ...editForm, unavailableUntil: e.target.value })} /></Field>
                  </div>
                  <Field label="หมายเหตุ"><Textarea rows={2} value={editForm.unavailableNote} onChange={(e) => setEditForm({ ...editForm, unavailableNote: e.target.value })} placeholder="เช่น ส่งซ่อม / งดใช้ระหว่างรอ calibration" /></Field>
                </div>
              ) : null}
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
              <Field label="Stock Location">
                <Select value={form.locationId} onChange={(e) => selectCreateLocation(e.target.value)}>
                  <option value="">ไม่เชื่อม Location</option>
                  {activeLocations.map((location) => <option key={location.id} value={location.id}>{location.code} · {location.name}</option>)}
                </Select>
              </Field>
              <Field label="จำนวนรอบ / วัน">
                <Select value={form.readingsPerDay} onChange={(e) => setForm({ ...form, readingsPerDay: e.target.value })}>
                  <option value="1">1 รอบ / วัน</option>
                  <option value="2">2 รอบ: เช้า, บ่าย</option>
                  <option value="3">3 รอบ: เช้า, บ่าย, ดึก</option>
                </Select>
                <p className="mt-1 text-[11px] text-[#789097]">{envPeriodOptions(Number(form.readingsPerDay)).map((option) => option.label).join(' · ')}</p>
              </Field>
              <div className="grid grid-cols-3 gap-2">
                <Field label="Min"><Input type="number" step="any" value={form.minLimit} onChange={(e) => setForm({ ...form, minLimit: e.target.value })} placeholder="2" /></Field>
                <Field label="Max"><Input type="number" step="any" value={form.maxLimit} onChange={(e) => setForm({ ...form, maxLimit: e.target.value })} placeholder="8" /></Field>
                <Field label="หน่วย"><Input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} /></Field>
              </div>
              <div className="rounded-md border border-[#d6e2e3] bg-[#f8fbfb] p-3">
                <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-[#315763]">
                  <input type="checkbox" checked={form.trackHumidity} onChange={(e) => setForm({ ...form, trackHumidity: e.target.checked })} className="size-4" />
                  Track relative humidity
                </label>
                {form.trackHumidity ? (
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <Field label="RH Min (%)"><Input type="number" min="0" max="100" step="any" value={form.humidityMinLimit} onChange={(e) => setForm({ ...form, humidityMinLimit: e.target.value })} placeholder="40" /></Field>
                    <Field label="RH Max (%)"><Input type="number" min="0" max="100" step="any" value={form.humidityMaxLimit} onChange={(e) => setForm({ ...form, humidityMaxLimit: e.target.value })} placeholder="70" /></Field>
                  </div>
                ) : null}
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <Field label="Thermometer ID"><Input value={form.thermometerId} onChange={(e) => setForm({ ...form, thermometerId: e.target.value })} placeholder="เช่น TM-001" /></Field>
                <Field label="Datalogger ID"><Input value={form.dataloggerId} onChange={(e) => setForm({ ...form, dataloggerId: e.target.value })} placeholder="เช่น DL-001" /></Field>
              </div>
              <Field label="Calibration due date"><Input type="date" value={form.calibrationDueDate} onChange={(e) => setForm({ ...form, calibrationDueDate: e.target.value })} /></Field>
              <Field label="สถานะตู้">
                <Select value={form.availabilityStatus} onChange={(e) => setForm({ ...form, availabilityStatus: e.target.value })}>
                  <option value="active">ใช้งาน</option>
                  <option value="maintenance">ซ่อม</option>
                  <option value="paused">พักใช้งานชั่วคราว</option>
                </Select>
              </Field>
              {form.availabilityStatus !== 'active' ? (
                <div className="space-y-2 rounded-md border border-[#eed4a6] bg-[#fffaf0] p-3">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Field label="ตั้งแต่"><Input type="date" value={form.unavailableFrom} onChange={(e) => setForm({ ...form, unavailableFrom: e.target.value })} /></Field>
                    <Field label="ถึง"><Input type="date" value={form.unavailableUntil} onChange={(e) => setForm({ ...form, unavailableUntil: e.target.value })} /></Field>
                  </div>
                  <Field label="หมายเหตุ"><Textarea rows={2} value={form.unavailableNote} onChange={(e) => setForm({ ...form, unavailableNote: e.target.value })} placeholder="เช่น ส่งซ่อม / งดใช้ระหว่างรอ calibration" /></Field>
                </div>
              ) : null}
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
                  <p className="text-[11px] text-[#8ba0a5]">
                    {KIND_LABEL[unit.kind] ?? unit.kind} · {unit.minLimit ?? '—'}–{unit.maxLimit ?? '—'} {unit.unit}
                    {unit.trackHumidity ? ` · RH ${unit.humidityMinLimit ?? '—'}–${unit.humidityMaxLimit ?? '—'}%` : ''}
                    {` · ${unit.readingsPerDay} รอบ/วัน`}
                    {unit.locationCode ? ` · Location ${unit.locationCode}` : ''}
                    {unit.calibrationDueDate ? ` · Cal ${formatDate(unit.calibrationDueDate)}` : ''}
                  </p>
                  {unit.thermometerId || unit.dataloggerId || unit.availabilityStatus !== 'active' ? (
                    <p className="mt-0.5 text-[11px] text-[#8ba0a5]">
                      {[unit.thermometerId ? `Thermometer ${unit.thermometerId}` : '', unit.dataloggerId ? `Datalogger ${unit.dataloggerId}` : '', unitUnavailableText(unit)].filter(Boolean).join(' · ')}
                    </p>
                  ) : null}
                </div>
              </div>
              <div className="flex gap-1.5">
                <Button variant="secondary" className="min-h-8 px-2.5 py-1.5 text-xs" onClick={() => startEdit(unit)}><Pencil className="size-3" /></Button>
                <Button variant={unit.isActive ? 'secondary' : 'primary'} className="min-h-8 px-3 py-1.5 text-xs" onClick={() => toggleActive(unit)}>
                  {unit.isActive ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}
                </Button>
                <Button variant="danger" className="min-h-8 px-2.5 py-1.5 text-xs" disabled={busy} onClick={() => remove(unit)} title="ลบตู้"><Trash2 className="size-3" /></Button>
              </div>
            </div>
          ))}
          {!data.units.length ? <p className="text-sm text-[#789097]">ยังไม่มีตู้</p> : null}
        </div>
      </Card>
    </div>
  )
}
