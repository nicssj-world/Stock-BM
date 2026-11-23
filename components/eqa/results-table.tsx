'use client'

import { useMemo, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import type { EqaResult, EqaRound, EqaWorkspace } from '@/lib/eqa/types'
import { analyteDefaultUnit, analyteScopeOptions, type EqaReadinessTarget } from '@/lib/eqa/rules'
import { api, Button, Input, Select } from '@/components/ui'
import type { Update } from '@/components/eqa/shared'

export const OUTCOME_LABELS: Record<EqaResult['outcome'], string> = {
  acceptable: 'ผ่าน (acceptable)', warning: 'ไม่ผ่าน (warning)', unacceptable: 'ไม่ผ่าน (unacceptable)', 'not-evaluated': 'รอประเมิน',
}

function outcomeSelectClass(outcome: EqaResult['outcome']) {
  if (outcome === 'unacceptable') return 'bg-red-100 text-red-800'
  if (outcome === 'warning') return 'bg-amber-100 text-amber-800'
  if (outcome === 'acceptable') return 'bg-emerald-100 text-emerald-800'
  return 'bg-slate-100 text-slate-800'
}

function copiesToLog10(value: string | null) {
  const raw = (value ?? '').trim()
  if (!raw || /^[<>]/.test(raw)) return null
  const copies = Number(raw.replace(/,/g, '').replace(/\s*(?:copies|iu)\/?ml\s*$/i, ''))
  return Number.isFinite(copies) && copies > 0 ? Math.log10(copies) : null
}

type Draft = {
  key: string
  id?: string
  sampleCode: string
  analyte: string
  submittedValue: string
  unit: string
  ctValue: string
  assignedValue: string
  evaluationScore: string
  outcome: EqaResult['outcome']
  iqcAnalyteId: string
}

function toDraft(result: EqaResult): Draft {
  return {
    key: result.id, id: result.id, sampleCode: result.sampleCode ?? '', analyte: result.analyte, submittedValue: result.submittedValue ?? '', unit: result.unit ?? '',
    ctValue: result.ctValue == null ? '' : String(result.ctValue), assignedValue: result.assignedValue ?? '',
    evaluationScore: result.evaluationScore == null ? '' : String(result.evaluationScore), outcome: result.outcome, iqcAnalyteId: result.iqcAnalyteId ?? '',
  }
}

const EDITABLE: (keyof Draft)[] = ['sampleCode', 'analyte', 'submittedValue', 'unit', 'ctValue', 'assignedValue', 'evaluationScore', 'outcome', 'iqcAnalyteId']
const isBlank = (row: Draft) => !row.sampleCode.trim() && !row.submittedValue.trim() && !row.ctValue.trim() && !row.assignedValue.trim() && !row.evaluationScore.trim()

/**
 * The round's whole result table, editable in place: submitted values first,
 * then the provider's reference, score and outcome. Everything is saved with
 * one request (PUT /api/eqa/rounds/[id]/results), like IQC's run entry.
 * The parent remounts it (key) whenever the saved results change.
 */
export function RoundResultsTable({ round, data, canAddRows, defaultIqcAnalyteId, onNavigate, onOk, onErr }: {
  round: EqaRound; data: EqaWorkspace; canAddRows: boolean; defaultIqcAnalyteId: string | null
  onNavigate: (target: EqaReadinessTarget) => void; onOk: Update; onErr: (text: string) => void
}) {
  const analyteOptions = useMemo(() => analyteScopeOptions(data.schemes.find((scheme) => scheme.id === round.schemeId)?.analyteScope), [data.schemes, round.schemeId])
  const original = useMemo(() => new Map(round.results.map((result) => [result.id, toDraft(result)])), [round.results])
  const [counter, setCounter] = useState(0)
  const blankRow = (index: number): Draft => {
    const analyte = analyteOptions.length === 1 ? analyteOptions[0] : ''
    return { key: `new-${index}`, sampleCode: '', analyte, submittedValue: '', unit: analyte ? analyteDefaultUnit(analyte, data.iqcAnalytes) : '', ctValue: '', assignedValue: '', evaluationScore: '', outcome: 'not-evaluated', iqcAnalyteId: defaultIqcAnalyteId ?? '' }
  }
  const [rows, setRows] = useState<Draft[]>(() => round.results.length ? round.results.map(toDraft) : canAddRows ? [blankRow(-1)] : [])
  const [busy, setBusy] = useState(false)

  const changed = rows.filter((row) => {
    if (!row.id) return !isBlank(row)
    const before = original.get(row.id)
    return !before || EDITABLE.some((field) => row[field] !== before[field])
  })

  function update(key: string, patch: Partial<Draft>) {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)))
  }
  function selectAnalyte(key: string, analyte: string) {
    update(key, { analyte, unit: analyteDefaultUnit(analyte, data.iqcAnalytes) })
  }
  function addRow() {
    setRows((current) => [...current, blankRow(counter)])
    setCounter((value) => value + 1)
  }

  async function removeRow(row: Draft) {
    if (!row.id) return setRows((current) => current.filter((item) => item.key !== row.key))
    // Deleting reloads the table from the server, which drops unsaved edits.
    const unsaved = changed.filter((item) => item.key !== row.key).length
    if (!window.confirm(`ลบผล ${row.sampleCode || row.analyte} ใช่ไหม?${unsaved ? `\nการแก้ไขอีก ${unsaved} รายการที่ยังไม่บันทึกจะหายไป` : ''}`)) return
    setBusy(true)
    try { const response = await api<{ eqa: EqaWorkspace }>(`/api/eqa/results/${row.id}`, { method: 'DELETE' }); onOk('ลบผลแล้ว', response.eqa) }
    catch (error) { onErr(error instanceof Error ? error.message : 'ลบผลไม่สำเร็จ') } finally { setBusy(false) }
  }

  async function saveAll() {
    if (!changed.length) return onErr('ยังไม่มีการแก้ไข')
    const incomplete = changed.find((row) => !row.sampleCode.trim() || !row.analyte.trim() || !row.submittedValue.trim())
    if (incomplete) return onErr('กรอกรหัสตัวอย่าง รายการทดสอบ และผลที่ส่งให้ครบทุกแถวก่อนบันทึก')
    const number = (value: string) => (value.trim() ? Number(value) : null)
    if (changed.some((row) => [row.ctValue, row.evaluationScore].some((value) => value.trim() && !Number.isFinite(Number(value))))) return onErr('Ct และคะแนนต้องเป็นตัวเลข')
    setBusy(true)
    try {
      const results = changed.map((row) => ({
        ...(row.id ? { id: row.id } : {}), analyte: row.analyte.trim(), sampleCode: row.sampleCode.trim(), submittedValue: row.submittedValue.trim(), unit: row.unit.trim() || null,
        ctValue: number(row.ctValue), evaluationScore: number(row.evaluationScore), outcome: row.outcome, iqcAnalyteId: row.iqcAnalyteId || null, assignedValue: row.assignedValue.trim() || null,
      }))
      const response = await api<{ eqa: EqaWorkspace }>(`/api/eqa/rounds/${round.id}/results`, { method: 'PUT', body: JSON.stringify({ results }) })
      onOk(`บันทึกผล ${results.length} รายการแล้ว`, response.eqa)
    } catch (error) { onErr(error instanceof Error ? error.message : 'บันทึกผลไม่สำเร็จ') } finally { setBusy(false) }
  }

  if (!rows.length && !canAddRows) return null
  return (
    <div className="mt-3 space-y-2">
      <div className="overflow-x-auto rounded-md border border-[#e9eff0]">
        <table className="w-full min-w-[960px] text-left text-xs">
          <thead className="bg-[#f6fafa] text-[#55727c]">
            <tr>
              <th className="p-2">รหัสตัวอย่าง</th>
              <th className="p-2">รายการทดสอบ</th>
              <th className="p-2">ผลที่ส่ง / หน่วย</th>
              <th className="p-2">Ct</th>
              <th className="p-2">ค่าอ้างอิงจากผู้จัด</th>
              <th className="p-2">คะแนนจากผู้จัด</th>
              <th className="p-2">ผลประเมินจากผู้จัด</th>
              <th className="p-2"><span className="sr-only">จัดการ</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#eef3f3]">
            {rows.map((row, index) => {
              const label = row.sampleCode || `แถว ${index + 1}`
              const isLogScale = data.iqcAnalytes.find((analyte) => analyte.id === row.iqcAnalyteId)?.scale === 'log10' || /\b(?:HIV|HBV|HCV)[\w-]*\s*VL\b/i.test(row.analyte)
              const log10 = isLogScale ? copiesToLog10(row.submittedValue) : null
              const saved = row.id ? round.results.find((result) => result.id === row.id) : undefined
              const correctiveAction = saved ? data.correctiveActions.find((action) => action.roundId === round.id && action.resultId === saved.id) ?? data.correctiveActions.find((action) => action.roundId === round.id && !action.resultId) ?? null : null
              const isChanged = changed.includes(row)
              return (
                <tr key={row.key} className={isChanged ? 'bg-[#fffbf0]' : undefined}>
                  <td className="p-1.5"><Input aria-label={`รหัสตัวอย่าง ${label}`} className="min-w-24" value={row.sampleCode} onChange={(event) => update(row.key, { sampleCode: event.target.value })} /></td>
                  <td className="p-1.5">{analyteOptions.length ? (
                    <Select aria-label={`รายการทดสอบ ${label}`} className="min-w-36" value={row.analyte} onChange={(event) => selectAnalyte(row.key, event.target.value)}>
                      <option value="">— เลือก —</option>
                      {row.analyte && !analyteOptions.includes(row.analyte) ? <option value={row.analyte}>{row.analyte}</option> : null}
                      {analyteOptions.map((analyte) => <option key={analyte} value={analyte}>{analyte}</option>)}
                    </Select>
                  ) : <Input aria-label={`รายการทดสอบ ${label}`} className="min-w-32" value={row.analyte} onChange={(event) => update(row.key, { analyte: event.target.value })} />}</td>
                  <td className="p-1.5">
                    <div className="flex min-w-44 gap-1"><Input aria-label={`ผลที่ส่ง ${label}`} value={row.submittedValue} onChange={(event) => update(row.key, { submittedValue: event.target.value })} /><Input aria-label={`หน่วย ${label}`} className="w-20" value={row.unit} onChange={(event) => update(row.key, { unit: event.target.value })} /></div>
                    {log10 != null ? <span className="mt-1 inline-block rounded bg-[#e8f5f3] px-1.5 py-0.5 text-[10px] font-semibold text-[#176d65]">log10 {log10.toFixed(3)}</span> : null}
                  </td>
                  <td className="p-1.5"><Input aria-label={`Ct ${label}`} inputMode="decimal" className="w-20" value={row.ctValue} onChange={(event) => update(row.key, { ctValue: event.target.value })} /></td>
                  <td className="p-1.5"><Input aria-label={`ค่าอ้างอิง ${label}`} className="min-w-28" placeholder="Positive / Negative" value={row.assignedValue} onChange={(event) => update(row.key, { assignedValue: event.target.value })} /></td>
                  <td className="p-1.5"><Input aria-label={`คะแนน ${label}`} inputMode="decimal" className="w-20" value={row.evaluationScore} onChange={(event) => update(row.key, { evaluationScore: event.target.value })} /></td>
                  <td className="p-1.5">
                    <Select aria-label={`ผลประเมิน ${label}`} className={`min-w-36 rounded-full border-0 px-3 py-1.5 text-xs font-semibold ${outcomeSelectClass(row.outcome)}`} value={row.outcome} onChange={(event) => update(row.key, { outcome: event.target.value as EqaResult['outcome'] })}>
                      {Object.entries(OUTCOME_LABELS).map(([value, text]) => <option key={value} value={value}>{text}</option>)}
                    </Select>
                  </td>
                  <td className="p-1.5">
                    <div className="flex items-center gap-1">
                      <Button type="button" variant="danger" className="min-h-8 px-2 py-1" title={`ลบ ${label}`} aria-label={`ลบ ${label}`} disabled={busy} onClick={() => removeRow(row)}><Trash2 className="size-3.5" /></Button>
                      {saved && (saved.outcome === 'warning' || saved.outcome === 'unacceptable') ? <Button type="button" variant="secondary" className="min-h-8 px-2 py-1 text-[11px] whitespace-nowrap" onClick={() => onNavigate({ kind: 'corrective', roundId: round.id, resultId: saved.id })}>{correctiveAction ? 'เปิด CAPA เดิม' : 'เปิด CAPA'}</Button> : null}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {canAddRows ? <Button type="button" variant="secondary" className="min-h-9 px-3 text-xs" onClick={addRow}><Plus className="size-4" />เพิ่มตัวอย่าง</Button> : null}
        <Button type="button" className="min-h-9 px-3 text-xs" disabled={busy || !changed.length} onClick={saveAll}>{busy ? 'กำลังบันทึก…' : changed.length ? `บันทึกทั้งหมด (${changed.length} รายการ)` : 'บันทึกทั้งหมด'}</Button>
        {changed.length ? <span className="text-xs font-semibold text-[#a9700f]">มีการแก้ไขที่ยังไม่บันทึก</span> : null}
      </div>
    </div>
  )
}
