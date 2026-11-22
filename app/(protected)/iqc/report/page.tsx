import type { Metadata } from 'next'
import Link from 'next/link'
import { PrintButton } from '@/components/print-button'
import { formatThaiDate } from '@/lib/bm/thai-date'
import type { IqcChart, QcStatus } from '@/lib/iqc/types'
import { PRINT_SHEET_CSS, REPORT_FOOTER, REPORT_SUBHEAD } from '@/lib/reports/print-sheet-css'
import { requireFullPageActor } from '@/lib/server/auth'
import { getIqcWorkspace } from '@/lib/server/iqc'
import { loadIqcRangeData } from '@/lib/server/iqc-export'

export const metadata: Metadata = { title: 'IQC monthly report' }

type RecordRow = Record<string, unknown>
const asString = (value: unknown) => (typeof value === 'string' ? value : '')
const num = (value: unknown) => (value == null || value === '' || !Number.isFinite(Number(value)) ? null : Number(value))

const STATUS_LABEL: Record<QcStatus, string> = { accepted: 'ผ่าน', warning: 'เตือน', investigate: 'ตรวจสอบ', rejected: 'Reject', not_evaluated: 'ยังไม่ประเมิน' }
const STATUS_COLOR: Record<QcStatus, string> = { accepted: '#16a34a', warning: '#d97706', investigate: '#8f5f1d', rejected: '#dc2626', not_evaluated: '#789097' }

interface MonthPoint {
  resultId: string
  runId: string
  when: string
  value: number | null
  stat: number | null
  z: number | null
  status: QcStatus
  rules: string[]
  voided: boolean
  voidReason: string | null
  enteredBy: string | null
}

interface MonthChart {
  key: string
  chart: IqcChart | null
  analyteCode: string
  analyteName: string
  unit: string | null
  scale: string
  materialName: string
  level: string | null
  lotNumber: string
  lotExpiry: string | null
  instrumentLabel: string | null
  points: MonthPoint[]
  actions: RecordRow[]
}

function currentYearMonth() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit' }).format(new Date()).slice(0, 7)
}

function monthBounds(month: string) {
  const [year, mon] = month.split('-').map(Number)
  const last = new Date(Date.UTC(year, mon, 0)).getUTCDate()
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, '0')}` }
}

function thaiMonth(month: string) {
  return new Intl.DateTimeFormat('th-TH-u-ca-buddhist', { month: 'long', year: 'numeric', timeZone: 'Asia/Bangkok' }).format(new Date(`${month}-15T00:00:00+07:00`))
}

function shortDateTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return new Intl.DateTimeFormat('th-TH', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Bangkok' }).format(date)
}

function fmt(value: number | null | undefined, digits = 3) {
  if (value == null || !Number.isFinite(value)) return '—'
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: digits }).format(value)
}

function stats(values: number[]) {
  if (!values.length) return { n: 0, mean: null, sd: null }
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length
  const sd = values.length > 1 ? Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1)) : null
  return { n: values.length, mean, sd }
}

/** Static Levey-Jennings plot for print: points in run order against active mean ±1/2/3 SD. */
function PrintLjChart({ points, mean, sd }: { points: MonthPoint[]; mean: number | null; sd: number | null }) {
  const W = 700
  const H = 210
  const PAD = { top: 12, right: 54, bottom: 26, left: 56 }
  const plotted = points.filter((point) => point.stat != null)
  const values = plotted.map((point) => point.stat as number)
  const hasLimits = mean != null && sd != null && sd > 0
  let lo = hasLimits ? (mean as number) - 4 * (sd as number) : Math.min(...values)
  let hi = hasLimits ? (mean as number) + 4 * (sd as number) : Math.max(...values)
  if (values.length) {
    lo = Math.min(lo, ...values)
    hi = Math.max(hi, ...values)
  }
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return null
  if (hi === lo) {
    lo -= 1
    hi += 1
  }
  const span = hi - lo
  lo -= span * 0.04
  hi += span * 0.04
  const sx = (index: number) => PAD.left + (plotted.length <= 1 ? (W - PAD.left - PAD.right) / 2 : (index / (plotted.length - 1)) * (W - PAD.left - PAD.right))
  const sy = (value: number) => PAD.top + ((hi - value) / (hi - lo)) * (H - PAD.top - PAD.bottom)
  const sdLines = hasLimits ? [-3, -2, -1, 0, 1, 2, 3] : []
  const path = plotted.filter((point) => !point.voided).map((point) => `${sx(plotted.indexOf(point))},${sy(point.stat as number)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Levey-Jennings chart">
      {sdLines.map((k) => {
        const y = sy((mean as number) + k * (sd as number))
        const color = k === 0 ? '#0b7f76' : Math.abs(k) === 3 ? '#c02a37' : Math.abs(k) === 2 ? '#d97706' : '#9aafb4'
        return (
          <g key={k}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y} y2={y} stroke={color} strokeWidth={k === 0 ? 1.4 : 1} strokeDasharray={k === 0 ? '0' : '4 3'} />
            <text x={W - PAD.right + 4} y={y + 3} fontSize="9" fill={color}>{k === 0 ? 'Mean' : `${k > 0 ? '+' : ''}${k}SD`}</text>
            <text x={PAD.left - 4} y={y + 3} fontSize="8.5" fill="#55727c" textAnchor="end">{fmt((mean as number) + k * (sd as number))}</text>
          </g>
        )
      })}
      <line x1={PAD.left} x2={PAD.left} y1={PAD.top} y2={H - PAD.bottom} stroke="#9aafb4" />
      {path ? <polyline points={path} fill="none" stroke="#315763" strokeWidth="1" /> : null}
      {plotted.map((point, index) => (
        <g key={point.resultId}>
          {point.voided
            ? <text x={sx(index)} y={sy(point.stat as number) + 3} fontSize="10" textAnchor="middle" fill="#9aafb4">×</text>
            : <circle cx={sx(index)} cy={sy(point.stat as number)} r="3.4" fill={STATUS_COLOR[point.status]} stroke="#fff" strokeWidth="0.8" />}
          {plotted.length <= 31 || index % Math.ceil(plotted.length / 31) === 0
            ? <text x={sx(index)} y={H - PAD.bottom + 12} fontSize="8" textAnchor="middle" fill="#55727c">{new Intl.DateTimeFormat('th-TH', { day: 'numeric', timeZone: 'Asia/Bangkok' }).format(new Date(point.when))}</text>
            : null}
        </g>
      ))}
      <text x={(W - PAD.right + PAD.left) / 2} y={H - 3} fontSize="9" textAnchor="middle" fill="#55727c">วันที่ (เรียงตาม run)</text>
    </svg>
  )
}

function ChartSection({ item, monthLabel }: { item: MonthChart; monthLabel: string }) {
  const chart = item.chart
  const usable = item.points.filter((point) => !point.voided && point.stat != null).map((point) => point.stat as number)
  const month = stats(usable)
  const isLog = item.scale === 'log10'
  const cv = !isLog && month.mean && month.sd != null ? (month.sd / month.mean) * 100 : null
  const counts = item.points.reduce<Record<string, number>>((acc, point) => {
    const key = point.voided ? 'voided' : point.status
    acc[key] = (acc[key] ?? 0) + 1
    return acc
  }, {})
  const limitLabel = !chart
    ? 'ไม่มีข้อมูลเกณฑ์ในระบบ'
    : chart.policyProfile === 'vl-standard-v1' && !chart.baselineId
      ? 'ยังไม่มี approved QC baseline (ยังไม่ใช้ตัดสิน)'
      : chart.activeLimit === 'baseline' ? `QC baseline v${chart.baselineVersion ?? '-'}` : chart.activeLimit === 'lab' ? 'LAB Mean/SD (locked)' : 'Assigned Mean/SD'
  return (
    <section className="sheet sheet-break">
      <div className="doc-code">IQC · {monthLabel}</div>
      <h2 style={{ marginTop: 0 }}>{item.analyteCode} · {item.analyteName}{item.unit ? ` (${item.unit})` : ''}</h2>
      <table className="info">
        <tbody>
          <tr><th>Control material</th><td>{item.materialName}{item.level ? ` · Level ${item.level}` : ''}</td></tr>
          <tr><th>Control lot</th><td>{item.lotNumber}{item.lotExpiry ? ` · EXP ${formatThaiDate(item.lotExpiry)}` : ''}</td></tr>
          <tr><th>เครื่อง</th><td>{item.instrumentLabel ?? (chart?.instrumentName ?? '—')}</td></tr>
          <tr><th>เกณฑ์ที่ใช้ตัดสิน</th><td>{limitLabel}{chart?.mean != null ? ` · Mean ${fmt(chart.mean)} · SD ${fmt(chart.sd)}${chart.cv != null && !isLog ? ` · CV ${fmt(chart.cv, 2)}%` : ''}` : ''}{isLog ? ' (สเกล log10)' : ''}</td></tr>
        </tbody>
      </table>

      <div className="charts" style={{ gridTemplateColumns: '1fr' }}>
        <figure>
          <figcaption>Levey-Jennings · {item.points.length} จุดในเดือนนี้{isLog ? ' · แกน Y เป็น log10' : ''}</figcaption>
          <PrintLjChart points={item.points} mean={chart?.mean ?? null} sd={chart?.sd ?? null} />
        </figure>
      </div>

      <table className="sheet-grid" style={{ marginTop: 8 }}>
        <tbody>
          <tr>
            <th>สถิติเดือนนี้ (ไม่รวม void)</th>
            <td className="num">n {month.n}</td>
            <td className="num">Mean {fmt(month.mean)}</td>
            <td className="num">SD {fmt(month.sd)}</td>
            <td className="num">CV {cv == null ? '—' : `${fmt(cv, 2)}%`}</td>
          </tr>
          <tr>
            <th>สรุปสถานะ</th>
            <td colSpan={4}>
              ผ่าน {counts.accepted ?? 0} · เตือน {counts.warning ?? 0} · ตรวจสอบ {counts.investigate ?? 0} · Reject {counts.rejected ?? 0}
              {counts.not_evaluated ? ` · ยังไม่ประเมิน ${counts.not_evaluated}` : ''} · Void {counts.voided ?? 0}
            </td>
          </tr>
        </tbody>
      </table>

      <h2>ผล QC รายจุด</h2>
      <table className="sheet-grid">
        <thead>
          <tr>
            <th>วันเวลา</th>
            <th className="num">ค่าที่รายงาน</th>
            {isLog ? <th className="num">log10</th> : null}
            <th className="num">Z</th>
            <th>สถานะ</th>
            <th>Westgard</th>
            <th>ผู้บันทึก / หมายเหตุ</th>
          </tr>
        </thead>
        <tbody>
          {item.points.map((point) => (
            <tr key={point.resultId}>
              <td>{shortDateTime(point.when)}</td>
              <td className="num">{fmt(point.value, 4)}</td>
              {isLog ? <td className="num">{fmt(point.stat)}</td> : null}
              <td className="num">{fmt(point.z, 2)}</td>
              <td className={point.voided ? 'muted' : point.status === 'rejected' ? 'bad' : point.status === 'accepted' ? 'ok' : ''}>{point.voided ? 'Void' : STATUS_LABEL[point.status]}</td>
              <td>{point.rules.join(', ')}</td>
              <td>{point.enteredBy ?? ''}{point.voidReason ? ` · void: ${point.voidReason}` : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Corrective action ในเดือนนี้</h2>
      {item.actions.length ? (
        <table className="sheet-grid">
          <thead><tr><th>วันที่</th><th>ปัญหา</th><th>สาเหตุ / การแก้ไข</th><th>สถานะ</th></tr></thead>
          <tbody>
            {item.actions.map((action) => (
              <tr key={asString(action.id)}>
                <td>{formatThaiDate(asString(action.created_at))}</td>
                <td>{asString(action.problem)}</td>
                <td>{[asString(action.root_cause), asString(action.action_taken)].filter(Boolean).join(' / ')}</td>
                <td>{asString(action.status)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <p className="muted">ไม่มี</p>}

      <div className="signatures" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
        <div><div className="line" />ผู้ทบทวนผล IQC ประจำเดือน · วันที่ ........</div>
        <div><div className="line" />ผู้จัดการวิชาการ · วันที่ ........</div>
      </div>
      <p className="footer-note">{REPORT_FOOTER}</p>
    </section>
  )
}

export default async function IqcMonthlyReportPage({ searchParams }: { searchParams: Promise<{ month?: string; chart?: string }> }) {
  const actor = await requireFullPageActor()
  const query = await searchParams
  const month = query.month && /^\d{4}-(0[1-9]|1[0-2])$/.test(query.month) ? query.month : currentYearMonth()
  const range = monthBounds(month)
  const [workspace, data] = await Promise.all([getIqcWorkspace(actor), loadIqcRangeData(range, actor)])

  const groups = new Map<string, MonthChart>()
  for (const row of data.results) {
    const analyte = data.analytes.get(asString(row.analyte_id))
    if (!analyte || asString(analyte.data_type) === 'qualitative') continue
    const run = data.runById.get(asString(row.run_id))
    const runInstrumentId = asString(run?.instrument_id) || null
    const lotId = asString(row.control_lot_id)
    const analyteId = asString(row.analyte_id)
    // Same scoping as the IQC workspace: CD4 charts are lot-level, VL charts are per instrument.
    const chart = workspace.charts.find((candidate) => candidate.controlLotId === lotId && candidate.analyteId === analyteId
      && (candidate.key.endsWith(':cd4-lot') || (runInstrumentId ? candidate.key.endsWith(`:${runInstrumentId}`) : candidate.key.endsWith(':unassigned')))) ?? null
    const key = chart?.key ?? `${lotId}:${analyteId}:${runInstrumentId ?? 'unassigned'}`
    if (query.chart && query.chart !== key) continue
    let group = groups.get(key)
    if (!group) {
      const lot = data.lots.get(lotId)
      const material = data.materials.get(asString(lot?.control_material_id))
      const instrument = runInstrumentId && !chart?.key.endsWith(':cd4-lot') ? data.instruments.get(runInstrumentId) : null
      group = {
        key,
        chart,
        analyteCode: asString(analyte.code),
        analyteName: asString(analyte.name),
        unit: asString(analyte.unit) || null,
        scale: asString(analyte.scale) || 'linear',
        materialName: asString(material?.name) || '—',
        level: asString(material?.level) || null,
        lotNumber: asString(lot?.lot_number) || '—',
        lotExpiry: asString(lot?.expiry_date) || null,
        instrumentLabel: instrument ? [asString(instrument.code), asString(instrument.name)].filter(Boolean).join(' · ') : null,
        points: [],
        actions: [],
      }
      groups.set(key, group)
    }
    const notEvaluated = chart?.policyProfile === 'vl-standard-v1' && !chart.baselineId
    group.points.push({
      resultId: asString(row.id),
      runId: asString(row.run_id),
      when: asString(run?.run_datetime),
      value: num(row.numeric_value),
      stat: num(row.stat_value ?? row.numeric_value),
      z: notEvaluated ? null : num(row.z_score),
      status: notEvaluated ? 'not_evaluated' : ((asString(row.status) || 'accepted') as QcStatus),
      rules: notEvaluated ? [] : Array.isArray(row.violated_rules) ? (row.violated_rules as string[]) : [],
      voided: Boolean(row.is_voided),
      voidReason: asString(row.void_reason) || null,
      enteredBy: data.users.get(asString(run?.entered_by)) ?? null,
    })
  }
  for (const group of groups.values()) {
    const runIds = new Set(group.points.map((point) => point.runId))
    group.actions = data.actions.filter((action) => runIds.has(asString(action.run_id)) && (!action.analyte_id || asString(action.analyte_id) === group.chart?.analyteId || asString(action.analyte_id) === group.key.split(':')[1]))
  }
  const items = [...groups.values()].sort((a, b) => a.analyteCode.localeCompare(b.analyteCode) || (a.level ?? '').localeCompare(b.level ?? '') || a.lotNumber.localeCompare(b.lotNumber))
  const totalPoints = items.reduce((sum, item) => sum + item.points.length, 0)
  const rejected = items.reduce((sum, item) => sum + item.points.filter((point) => !point.voided && point.status === 'rejected').length, 0)
  const warnings = items.reduce((sum, item) => sum + item.points.filter((point) => !point.voided && (point.status === 'warning' || point.status === 'investigate')).length, 0)

  return (
    <main className="report-page">
      <div className="toolbar print-hidden">
        <Link href="/iqc">กลับ IQC</Link>
        <form method="get" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input type="month" name="month" defaultValue={month} aria-label="เดือน" style={{ border: '1px solid #b8c8cc', borderRadius: 6, padding: '6px 8px', fontSize: 13 }} />
          {query.chart ? <input type="hidden" name="chart" value={query.chart} /> : null}
          <button type="submit" style={{ border: '1px solid #b8c8cc', background: 'white', borderRadius: 6, padding: '7px 12px', fontWeight: 700, fontSize: 13, color: '#173d50' }}>แสดง</button>
          {query.chart ? <Link href={`/iqc/report?month=${month}`}>ทุก chart</Link> : null}
          <a href={`/api/iqc/export?from=${range.from}&to=${range.to}`}>Excel เดือนนี้</a>
        </form>
        <PrintButton />
      </div>

      <section className="sheet">
        <h1>รายงานการควบคุมคุณภาพภายใน (IQC) ประจำเดือน</h1>
        <p className="subhead">{REPORT_SUBHEAD} · เดือน{thaiMonth(month)}</p>
        <table className="sheet-grid">
          <thead><tr><th>Analyte</th><th>Control / Lot</th><th>เครื่อง</th><th className="num">จุด</th><th className="num">Reject</th><th className="num">เตือน/ตรวจสอบ</th><th className="num">CA</th></tr></thead>
          <tbody>
            {items.length ? items.map((item) => (
              <tr key={item.key}>
                <td>{item.analyteCode}</td>
                <td>{item.materialName}{item.level ? ` L${item.level}` : ''} · {item.lotNumber}</td>
                <td>{item.instrumentLabel ?? item.chart?.instrumentName ?? '—'}</td>
                <td className="num">{item.points.length}</td>
                <td className="num">{item.points.filter((point) => !point.voided && point.status === 'rejected').length || ''}</td>
                <td className="num">{item.points.filter((point) => !point.voided && (point.status === 'warning' || point.status === 'investigate')).length || ''}</td>
                <td className="num">{item.actions.length || ''}</td>
              </tr>
            )) : <tr><td colSpan={7} className="center muted">ไม่มีผล IQC ในเดือนนี้{query.chart ? 'สำหรับ chart ที่เลือก' : ''}</td></tr>}
          </tbody>
        </table>
        <p className="muted" style={{ marginTop: 6 }}>รวม {items.length} chart · {totalPoints} จุด · Reject {rejected} · เตือน/ตรวจสอบ {warnings} · ค่า Z และสถานะเป็นค่าที่ระบบบันทึกไว้ ณ ตอนประเมิน</p>
        <p className="footer-note">{REPORT_FOOTER}</p>
      </section>

      {items.map((item) => <ChartSection key={item.key} item={item} monthLabel={thaiMonth(month)} />)}

      <style>{PRINT_SHEET_CSS}</style>
    </main>
  )
}
