import Link from 'next/link'
import { requireFullPageActor } from '@/lib/server/auth'
import { getEnvironmentWorkspace } from '@/lib/server/environment'
import type { EnvPeriodIndex, EnvReading, EnvUnit } from '@/lib/env/types'

function currentYearMonth() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function daysInYearMonth(ym: string) {
  const [year, month] = ym.split('-').map(Number)
  return new Date(year, month, 0).getDate()
}

function thaiMonthYear(ym: string) {
  const [year, month] = ym.split('-').map(Number)
  const date = new Date(year, month - 1, 1)
  return new Intl.DateTimeFormat('th-TH', { month: 'long', year: 'numeric', timeZone: 'Asia/Bangkok' }).format(date)
}

function formatDate(value: string | null) {
  if (!value) return ''
  return new Intl.DateTimeFormat('th-TH', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Asia/Bangkok' }).format(new Date(`${value}T00:00:00+07:00`))
}

function fmt(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return ''
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

function readingKey(day: number, period: EnvPeriodIndex) {
  return `${day}:${period}`
}

function recorderNames(readings: EnvReading[]) {
  return [...new Set(readings.map((reading) => reading.recordedByName).filter(Boolean))].join(', ')
}

function TableBlock({ days, readingsByKey, readingsByDay }: { days: number[]; readingsByKey: Map<string, EnvReading>; readingsByDay: Map<number, EnvReading[]> }) {
  const periods: EnvPeriodIndex[] = [1, 2, 3]
  return (
    <table className="temp-table">
      <thead>
        <tr>
          <th className="label-cell">วันที่</th>
          {days.map((day) => <th key={day} colSpan={3}>{day}</th>)}
        </tr>
        <tr>
          <th className="label-cell">อุณหภูมิ</th>
          {days.flatMap((day) => periods.map((period) => <th key={`${day}-${period}`} className="period-cell">{period}</th>))}
        </tr>
      </thead>
      <tbody>
        <tr>
          <th className="label-cell">ค่า</th>
          {days.flatMap((day) => periods.map((period) => {
            const reading = readingsByKey.get(readingKey(day, period))
            return <td key={`${day}-${period}`} className={reading?.status === 'out-of-range' ? 'oor' : ''}>{fmt(reading?.readingValue)}</td>
          }))}
        </tr>
        <tr>
          <th className="label-cell">mean</th>
          {days.map((day) => {
            const readings = readingsByDay.get(day) ?? []
            const mean = readings.length ? readings.reduce((sum, reading) => sum + reading.readingValue, 0) / readings.length : null
            return <td key={day} colSpan={3}>{fmt(mean)}</td>
          })}
        </tr>
        <tr>
          <th className="label-cell">ผู้บันทึก</th>
          {days.map((day) => <td key={day} colSpan={3} className="recorder-cell">{recorderNames(readingsByDay.get(day) ?? [])}</td>)}
        </tr>
      </tbody>
    </table>
  )
}

function EquipmentLine({ unit }: { unit: EnvUnit }) {
  const asset = [unit.thermometerId ? `Thermometer: ${unit.thermometerId}` : '', unit.dataloggerId ? `Datalogger: ${unit.dataloggerId}` : ''].filter(Boolean).join(' / ')
  return (
    <div className="field-row">
      <span className="check">□</span>
      <span>ชื่อเครื่องมือ / รุ่น :</span>
      <span className="fill">{unit.name}</span>
      <span>หมายเลขครุภัณฑ์ :</span>
      <span className="fill">{asset || '-'}</span>
    </div>
  )
}

export default async function EnvMonthlyReportPage({ searchParams }: { searchParams: Promise<{ unitId?: string; month?: string }> }) {
  const actor = await requireFullPageActor()
  const data = await getEnvironmentWorkspace(actor)
  const query = await searchParams
  const month = query.month && /^\d{4}-\d{2}$/.test(query.month) ? query.month : currentYearMonth()
  const unit = data.units.find((candidate) => candidate.id === query.unitId) ?? data.units[0]
  const readings = data.readings
    .filter((reading) => unit && reading.unitId === unit.id && reading.readingDate.startsWith(month) && !reading.isVoided)
    .sort((a, b) => a.readingDate.localeCompare(b.readingDate) || a.periodIndex - b.periodIndex)
  const monthlyReview = unit ? data.monthlyReviews.find((review) => review.unitId === unit.id && review.yearMonth === month) : null
  const correctiveActions = data.correctiveActions.filter((ca) => unit && ca.unitId === unit.id && ca.readingDate.startsWith(month))

  const readingsByKey = new Map<string, EnvReading>()
  const readingsByDay = new Map<number, EnvReading[]>()
  for (const reading of readings) {
    const day = Number(reading.readingDate.slice(8, 10))
    readingsByKey.set(readingKey(day, reading.periodIndex), reading)
    readingsByDay.set(day, [...(readingsByDay.get(day) ?? []), reading])
  }

  const allDays = Array.from({ length: daysInYearMonth(month) }, (_, index) => index + 1)
  const firstHalf = allDays.slice(0, 15)
  const secondHalf = allDays.slice(15)
  const minMax = unit ? `${unit.minLimit ?? ''} - ${unit.maxLimit ?? ''}` : ''

  return (
    <main className="report-page">
      <div className="toolbar print-hidden">
        <Link href="/environment" className="back-link">กลับ Temperature</Link>
        <button id="print-report" type="button">Print / Save PDF</button>
      </div>

      {!unit ? (
        <p>ไม่มีตู้สำหรับรายงาน</p>
      ) : (
        <section className="sheet">
          <div className="doc-code">Fm-WI-E-OV01/01</div>
          <h1>แบบฟอร์มบันทึกค่าอุณหภูมิ</h1>
          <p className="subhead">งานอณูชีววิทยา กลุ่มงานเทคนิคการแพทย์ โรงพยาบาลชลบุรี</p>

          <EquipmentLine unit={unit} />
          <div className="field-row">
            <span className="check">□</span>
            <span>บันทึกอุณหภูมิห้อง ช่วงค่าอุณหภูมิที่ยอมรับ :</span>
            <span className="short-fill">{minMax}</span>
            <span>องศา เดือน :</span>
            <span className="short-fill">{thaiMonthYear(month)}</span>
          </div>
          <div className="field-row small">
            <span>Calibration due date :</span>
            <span className="short-fill">{formatDate(unit.calibrationDueDate)}</span>
            <span>Location :</span>
            <span className="short-fill">{unit.locationCode ?? ''} {unit.locationName ?? ''}</span>
          </div>

          <TableBlock days={firstHalf} readingsByKey={readingsByKey} readingsByDay={readingsByDay} />
          <TableBlock days={secondHalf} readingsByKey={readingsByKey} readingsByDay={readingsByDay} />

          <div className="lower-grid">
            <div className="instructions">
              <p className="section-title">ข้อปฏิบัติ :</p>
              <p>1. ใส่ค่าอุณหภูมิในช่องรอบที่บันทึก</p>
              <p>2. ความถี่ของการบันทึกค่าอุณหภูมิ 3 ครั้งในรอบ 24 ชั่วโมง</p>
              <p>3. กรณีพบอุณหภูมิไม่อยู่ในช่วงค่าที่กำหนด ให้เฝ้าระวังและดำเนิน corrective action ตามระบบ</p>
            </div>
            <table className="ca-table">
              <thead>
                <tr>
                  <th>ว/ด/ป</th>
                  <th>ปัญหาที่พบ</th>
                  <th>corrective action</th>
                </tr>
              </thead>
              <tbody>
                {(correctiveActions.length ? correctiveActions : Array.from({ length: 4 }, () => null)).slice(0, 5).map((ca, index) => (
                  <tr key={ca?.id ?? index}>
                    <td>{ca ? formatDate(ca.readingDate) : ''}</td>
                    <td>{ca?.problem ?? ''}</td>
                    <td>{ca ? [ca.rootCause, ca.actionTaken].filter(Boolean).join(' / ') : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="review-row">
            <span>ผู้ตรวจสอบ :</span>
            <span className="signature">{monthlyReview?.reviewedByName ?? ''}</span>
            <span>วันที่</span>
            <span className="date-line">{monthlyReview ? formatDate(monthlyReview.reviewedAt.slice(0, 10)) : ''}</span>
            <span className="role">(ผู้จัดการวิชาการ)</span>
          </div>
          {monthlyReview?.note ? <p className="review-note">หมายเหตุการตรวจสอบ: {monthlyReview.note}</p> : null}
          <p className="footer-note">เอกสารนี้เป็นสมบัติของกลุ่มงานเทคนิคการแพทย์ โรงพยาบาลชลบุรี ห้ามนำออกไปใช้ภายนอกหรือทำซ้ำโดยไม่ได้รับอนุญาต</p>
        </section>
      )}

      <script dangerouslySetInnerHTML={{ __html: "document.getElementById('print-report')?.addEventListener('click',()=>window.print())" }} />
      <style>{`
        @page { size: A4 landscape; margin: 8mm; }
        body { background: #e9eef0; }
        .report-page { color: #111; font-family: "Noto Sans Thai", Arial, sans-serif; }
        .toolbar { display: flex; justify-content: space-between; align-items: center; margin: 0 auto 12px; max-width: 1120px; }
        .back-link, #print-report { border: 1px solid #b8c8cc; background: white; border-radius: 6px; padding: 8px 12px; color: #173d50; font-weight: 700; font-size: 13px; }
        .sheet { position: relative; width: 1120px; min-height: 780px; margin: 0 auto; background: white; padding: 22px 24px 16px; box-shadow: 0 10px 40px rgba(20, 64, 72, 0.16); }
        h1 { margin: 0; text-align: center; font-size: 18px; font-weight: 800; }
        .subhead { margin: 2px 0 8px; text-align: center; font-size: 12px; }
        .doc-code { position: absolute; right: 24px; top: 18px; font-size: 11px; font-weight: 700; }
        .field-row { display: flex; align-items: center; gap: 7px; margin-top: 5px; font-size: 11px; line-height: 1.35; }
        .field-row.small { font-size: 10.5px; }
        .check { font-size: 14px; line-height: 1; }
        .fill { flex: 1; border-bottom: 1px dotted #333; min-height: 16px; padding: 0 4px; }
        .short-fill { min-width: 150px; border-bottom: 1px dotted #333; min-height: 16px; padding: 0 4px; }
        .temp-table { width: 100%; table-layout: fixed; border-collapse: collapse; margin-top: 8px; font-size: 8px; }
        .temp-table th, .temp-table td { border: 1px solid #222; height: 22px; text-align: center; vertical-align: middle; padding: 1px; overflow: hidden; }
        .temp-table th { font-weight: 700; }
        .label-cell { width: 54px; font-size: 9px; }
        .period-cell { font-size: 7px; font-weight: 400; }
        .recorder-cell { font-size: 6.8px; line-height: 1.05; }
        .oor { background: #fff1f2; color: #a40012; font-weight: 800; }
        .lower-grid { display: grid; grid-template-columns: 1fr 1.15fr; gap: 12px; margin-top: 10px; align-items: start; }
        .instructions { font-size: 9.2px; line-height: 1.35; }
        .instructions p { margin: 1px 0; }
        .section-title { font-weight: 800; }
        .ca-table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 8.5px; }
        .ca-table th, .ca-table td { border: 1px solid #222; height: 21px; padding: 2px 4px; vertical-align: top; }
        .ca-table th:nth-child(1) { width: 64px; }
        .ca-table th:nth-child(2) { width: 42%; }
        .review-row { display: flex; align-items: end; gap: 8px; margin-top: 8px; font-size: 10.5px; }
        .signature, .date-line { min-width: 150px; border-bottom: 1px dotted #333; display: inline-block; min-height: 16px; padding: 0 4px; }
        .role { margin-left: 8px; }
        .review-note { margin: 4px 0 0; font-size: 9px; }
        .footer-note { position: absolute; bottom: 8px; left: 24px; right: 24px; margin: 0; text-align: center; font-size: 8.5px; }
        @media print {
          body { background: white; }
          .print-hidden { display: none !important; }
          .sheet { width: auto; min-height: auto; margin: 0; padding: 0; box-shadow: none; }
          .doc-code { right: 0; top: 0; }
          .footer-note { position: fixed; bottom: 0; left: 0; right: 0; }
        }
      `}</style>
    </main>
  )
}
