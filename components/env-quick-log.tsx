'use client'

import { useState } from 'react'
import { CheckCircle2, ChevronDown, Droplets, Thermometer } from 'lucide-react'
import type { EnvPeriodIndex, EnvReading, EnvUnit } from '@/lib/env/types'
import { envPeriodLabel, envPeriodOptions } from '@/lib/env/types'
import { api, Button, Field, Input, Notice, Select, Textarea } from '@/components/ui'

function localToday() {
  return new Date().toLocaleDateString('en-CA')
}

function currentPeriodIndex(readingsPerDay: number): EnvPeriodIndex {
  const hour = new Date().getHours()
  if (readingsPerDay >= 3 && hour < 8) return 3
  if (readingsPerDay >= 2 && hour >= 16) return 2
  return 1
}

function unitUnavailableToday(unit: EnvUnit) {
  if (unit.availabilityStatus === 'active') return false
  const today = localToday()
  if (unit.unavailableFrom && today < unit.unavailableFrom) return false
  if (unit.unavailableUntil && today > unit.unavailableUntil) return false
  return true
}

// Fast single-unit temperature entry. Used by the QR deep-link page and the
// dashboard cards. On an out-of-range value it reveals a corrective-action form.
export function EnvQuickLog({ unit, onLogged, autoFocus, defaultPeriodIndex }: { unit: EnvUnit; onLogged?: () => void; autoFocus?: boolean; defaultPeriodIndex?: EnvPeriodIndex }) {
  const [value, setValue] = useState('')
  const [humidityPercent, setHumidityPercent] = useState('')
  const [note, setNote] = useState('')
  const [readingDate, setReadingDate] = useState(localToday)
  const [periodIndex, setPeriodIndex] = useState<EnvPeriodIndex>(defaultPeriodIndex ?? currentPeriodIndex(unit.readingsPerDay))
  const [recordedMin, setRecordedMin] = useState('')
  const [recordedMax, setRecordedMax] = useState('')
  const [showExtra, setShowExtra] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [logged, setLogged] = useState<EnvReading | null>(null)

  // corrective action (only when out-of-range)
  const [problem, setProblem] = useState('')
  const [rootCause, setRootCause] = useState('')
  const [actionTaken, setActionTaken] = useState('')
  const [caSaved, setCaSaved] = useState(false)
  const [caBusy, setCaBusy] = useState(false)

  const limitText = `${unit.minLimit ?? '—'} ถึง ${unit.maxLimit ?? '—'} ${unit.unit}`
  const unavailableToday = unitUnavailableToday(unit)

  function toggleSign(current: string, setNext: (value: string) => void) {
    const trimmed = current.trim()
    if (!trimmed) {
      setNext('-')
      return
    }
    setNext(trimmed.startsWith('-') ? trimmed.slice(1) : `-${trimmed.replace(/^\+/, '')}`)
  }

  if (unavailableToday) {
    const reason = unit.availabilityStatus === 'maintenance' ? 'ซ่อม' : 'พักใช้งาน'
    const dates = [unit.unavailableFrom, unit.unavailableUntil].filter(Boolean).join(' ถึง ')
    return (
      <Notice tone="warning">
        ตู้นี้อยู่ในสถานะ{reason}{dates ? ` (${dates})` : ''} จึงไม่ต้องบันทึกอุณหภูมิในช่วงนี้
        {unit.unavailableNote ? ` · ${unit.unavailableNote}` : ''}
      </Notice>
    )
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    const numeric = Number(value)
    const hasHumidity = humidityPercent.trim() !== ''
    const humidityValue = hasHumidity ? Number(humidityPercent) : null
    if (value.trim() === '' || Number.isNaN(numeric)) {
      setError('กรอกค่าตัวเลข / Enter a numeric value')
      return
    }
    if (unit.trackHumidity && !hasHumidity) {
      setError('Enter relative humidity (%RH)')
      return
    }
    if (hasHumidity && (humidityValue == null || Number.isNaN(humidityValue) || humidityValue < 0 || humidityValue > 100)) {
      setError('Humidity must be between 0 and 100%')
      return
    }
    setBusy(true)
    setError('')
    try {
      const { env } = await api<{ env: { reading: EnvReading; outOfRange: boolean } }>('/api/environment/readings', {
        method: 'POST',
        body: JSON.stringify({
          unitId: unit.id,
          readingValue: numeric,
          humidityPercent: humidityValue,
          readingDate,
          periodIndex,
          recordedMin: recordedMin !== '' ? Number(recordedMin) : null,
          recordedMax: recordedMax !== '' ? Number(recordedMax) : null,
          note: note.trim() || null,
        }),
      })
      setLogged(env.reading)
      if (env.outOfRange) {
        const issues = []
        if ((unit.minLimit != null && numeric < unit.minLimit) || (unit.maxLimit != null && numeric > unit.maxLimit)) issues.push(`อุณหภูมิ ${numeric}${unit.unit} อยู่นอกช่วง ${limitText}`)
        if (unit.trackHumidity && humidityValue != null && ((unit.humidityMinLimit != null && humidityValue < unit.humidityMinLimit) || (unit.humidityMaxLimit != null && humidityValue > unit.humidityMaxLimit))) {
          issues.push(`Relative humidity ${humidityValue}% อยู่นอกช่วง ${unit.humidityMinLimit ?? '—'}–${unit.humidityMaxLimit ?? '—'}%`)
        }
        setProblem(issues.join(' / ') || `Reading out of range`)
      }
      onLogged?.()
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'บันทึกไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  async function submitCa(event: React.FormEvent) {
    event.preventDefault()
    if (!logged) return
    setCaBusy(true)
    setError('')
    try {
      await api('/api/environment/corrective-actions', {
        method: 'POST',
        body: JSON.stringify({ readingId: logged.id, problem: problem.trim(), rootCause: rootCause.trim() || null, actionTaken: actionTaken.trim() || null }),
      })
      setCaSaved(true)
      onLogged?.()
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'บันทึก corrective action ไม่สำเร็จ')
    } finally {
      setCaBusy(false)
    }
  }

  if (logged) {
    const outOfRange = logged.status === 'out-of-range'
    const isBackdate = logged.readingDate !== localToday()
    return (
      <div className="space-y-3" role="status" aria-live="polite">
        <Notice tone={outOfRange ? 'danger' : 'success'}>
          บันทึกแล้ว: <span className="mono font-bold">{logged.readingValue} {unit.unit}</span>
          {logged.humidityPercent != null ? <span className="ml-1 text-[11px] opacity-75">Humidity {logged.humidityPercent}%</span> : null}
          <span className="ml-1 text-[11px] opacity-75">({logged.periodLabel})</span>
          {isBackdate ? <span className="ml-1 text-[11px] opacity-75">({logged.readingDate})</span> : ''}
          {' '}— {outOfRange ? 'นอกช่วง / Out of range' : 'อยู่ในช่วง / In range'}
        </Notice>
        {outOfRange && !caSaved ? (
          <form onSubmit={submitCa} className="space-y-3 rounded-md border border-[#efc7cc] bg-[#fff8f8] p-3">
            <p className="text-sm font-bold text-[#a83541]">บันทึกการแก้ไข / Corrective action</p>
            <Field label="ปัญหา / Problem"><Input value={problem} onChange={(e) => setProblem(e.target.value)} required /></Field>
            <Field label="สาเหตุ / Root cause"><Input value={rootCause} onChange={(e) => setRootCause(e.target.value)} /></Field>
            <Field label="การแก้ไข / Action taken"><Textarea rows={2} value={actionTaken} onChange={(e) => setActionTaken(e.target.value)} /></Field>
            {error ? <Notice tone="danger">{error}</Notice> : null}
            <Button type="submit" variant="danger" disabled={caBusy}>{caBusy ? 'กำลังบันทึก…' : 'บันทึก Corrective action'}</Button>
          </form>
        ) : null}
        {caSaved ? <Notice tone="success"><CheckCircle2 className="size-4" /> บันทึก corrective action แล้ว</Notice> : null}
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm font-bold text-[#173d50]">{unit.name}</p>
        <span className="text-[11px] text-[#789097]">{envPeriodLabel(periodIndex)} · ช่วง {limitText}</span>
      </div>
      {unit.readingsPerDay > 1 ? (
        <Field label="รอบการบันทึก / Shift">
          <Select value={String(periodIndex)} onChange={(e) => setPeriodIndex(Number(e.target.value) as EnvPeriodIndex)}>
            {envPeriodOptions(unit.readingsPerDay).map((option) => <option key={option.periodIndex} value={option.periodIndex}>{option.label}</option>)}
          </Select>
        </Field>
      ) : null}
      <Field label={`อุณหภูมิ / Temperature (${unit.unit})`}>
        <div className="flex h-14 overflow-hidden rounded-md border border-[#b7d2d0] bg-white focus-within:ring-2 focus-within:ring-[#0b7f76]">
          <button
            type="button"
            aria-label="Toggle temperature sign"
            title="Toggle +/-"
            onClick={() => toggleSign(value, setValue)}
            className="flex w-14 shrink-0 items-center justify-center border-r border-[#d8e6e6] text-[#0b7f76] transition hover:bg-[#eef7f6] active:bg-[#d9eeec]"
          >
            <span className="mono text-base font-bold">+/-</span>
          </button>
          <div className="relative min-w-0 flex-1">
            <Thermometer className="absolute top-2.5 left-3 size-5 text-[#7b979c]" />
            <Input
              autoFocus={autoFocus}
              type="text"
              inputMode="decimal"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="h-full border-0 pl-11 text-2xl focus-visible:ring-0"
              placeholder="0.0"
              required
            />
          </div>
        </div>
      </Field>
      {unit.trackHumidity ? <Field label="Relative humidity (%RH)">
        <div className="relative">
          <Droplets className="absolute top-2.5 left-3 size-5 text-[#7b979c]" />
          <Input
            type="number"
            min="0"
            max="100"
            step="any"
            inputMode="decimal"
            value={humidityPercent}
            onChange={(e) => setHumidityPercent(e.target.value)}
            className="h-12 pl-11 text-xl"
            placeholder="%"
            required
          />
        </div>
      </Field> : null}
      <Field label="หมายเหตุ / Note"><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="ถ้ามี" /></Field>

      <button
        type="button"
        onClick={() => setShowExtra((v) => !v)}
        className="flex items-center gap-1 text-xs font-semibold text-[#58747d] hover:text-[#0b7f76]"
      >
        <ChevronDown className={`size-3.5 transition-transform ${showExtra ? 'rotate-180' : ''}`} />
        {showExtra ? 'ซ่อนตัวเลือกเพิ่ม' : 'บันทึกย้อนหลัง / Min–Max datalogger'}
      </button>

      {showExtra ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="วันที่บันทึก">
            <Input type="date" value={readingDate} onChange={(e) => setReadingDate(e.target.value)} required />
          </Field>
          <Field label={`Min (${unit.unit})`}>
            <div className="flex h-11 overflow-hidden rounded-md border border-[#c9dadd] bg-white focus-within:ring-2 focus-within:ring-[#0b7f76]">
              <button type="button" aria-label="Toggle min sign" title="Toggle +/-" onClick={() => toggleSign(recordedMin, setRecordedMin)} className="flex w-11 shrink-0 items-center justify-center border-r border-[#d8e6e6] text-[#0b7f76] hover:bg-[#eef7f6]">
                <span className="mono text-xs font-bold">+/-</span>
              </button>
              <Input type="text" inputMode="decimal" value={recordedMin} onChange={(e) => setRecordedMin(e.target.value)} placeholder="—" className="h-full border-0 focus-visible:ring-0" />
            </div>
          </Field>
          <Field label={`Max (${unit.unit})`}>
            <div className="flex h-11 overflow-hidden rounded-md border border-[#c9dadd] bg-white focus-within:ring-2 focus-within:ring-[#0b7f76]">
              <button type="button" aria-label="Toggle max sign" title="Toggle +/-" onClick={() => toggleSign(recordedMax, setRecordedMax)} className="flex w-11 shrink-0 items-center justify-center border-r border-[#d8e6e6] text-[#0b7f76] hover:bg-[#eef7f6]">
                <span className="mono text-xs font-bold">+/-</span>
              </button>
              <Input type="text" inputMode="decimal" value={recordedMax} onChange={(e) => setRecordedMax(e.target.value)} placeholder="—" className="h-full border-0 focus-visible:ring-0" />
            </div>
          </Field>
        </div>
      ) : null}

      {error ? <Notice tone="danger">{error}</Notice> : null}
      <Button type="submit" className="h-12 w-full text-base" disabled={busy}>{busy ? 'กำลังบันทึก…' : 'บันทึก / Save'}</Button>
    </form>
  )
}
