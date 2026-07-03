'use client'

import { useState } from 'react'
import { CheckCircle2, ChevronDown, Thermometer } from 'lucide-react'
import type { EnvReading, EnvUnit } from '@/lib/env/types'
import { api, Button, Field, Input, Notice, Textarea } from '@/components/ui'

function localToday() {
  return new Date().toLocaleDateString('en-CA')
}

// Fast single-unit temperature entry. Used by the QR deep-link page and the
// dashboard cards. On an out-of-range value it reveals a corrective-action form.
export function EnvQuickLog({ unit, onLogged, autoFocus }: { unit: EnvUnit; onLogged?: () => void; autoFocus?: boolean }) {
  const [value, setValue] = useState('')
  const [note, setNote] = useState('')
  const [readingDate, setReadingDate] = useState(localToday)
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

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    const numeric = Number(value)
    if (value.trim() === '' || Number.isNaN(numeric)) {
      setError('กรอกค่าตัวเลข / Enter a numeric value')
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
          readingDate,
          recordedMin: recordedMin !== '' ? Number(recordedMin) : null,
          recordedMax: recordedMax !== '' ? Number(recordedMax) : null,
          note: note.trim() || null,
        }),
      })
      setLogged(env.reading)
      if (env.outOfRange) setProblem(`อุณหภูมิ ${numeric}${unit.unit} อยู่นอกช่วง ${limitText}`)
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
        <span className="mono text-[11px] text-[#789097]">ช่วง {limitText}</span>
      </div>
      <Field label={`อุณหภูมิ / Temperature (${unit.unit})`}>
        <div className="relative">
          <Thermometer className="absolute top-2.5 left-3 size-5 text-[#7b979c]" />
          <Input
            autoFocus={autoFocus}
            type="number"
            step="any"
            inputMode="decimal"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="h-14 pl-11 text-2xl"
            placeholder="0.0"
            required
          />
        </div>
      </Field>
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
            <Input type="number" step="any" value={recordedMin} onChange={(e) => setRecordedMin(e.target.value)} placeholder="—" />
          </Field>
          <Field label={`Max (${unit.unit})`}>
            <Input type="number" step="any" value={recordedMax} onChange={(e) => setRecordedMax(e.target.value)} placeholder="—" />
          </Field>
        </div>
      ) : null}

      {error ? <Notice tone="danger">{error}</Notice> : null}
      <Button type="submit" className="h-12 w-full text-base" disabled={busy}>{busy ? 'กำลังบันทึก…' : 'บันทึก / Save'}</Button>
    </form>
  )
}
