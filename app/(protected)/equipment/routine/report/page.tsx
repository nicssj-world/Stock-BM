import Link from 'next/link'
import { PrintButton } from '@/components/print-button'
import { formatDate, formatDateTime, todayBangkok } from '@/lib/bm/rules'
import {
  addRoutineDays,
  currentRoutineVersion,
  generateFormOccurrences,
  routinePeriodBounds,
  routinePeriodFor,
  routinePeriodKind,
  type RoutineFrequency,
  type RoutineMaintenanceEntry,
  type RoutineMaintenanceForm,
  type RoutineMaintenanceOccurrence,
} from '@/lib/equipment/routine-maintenance'
import { requireFullPageActor } from '@/lib/server/auth'
import { getRoutineReportCatalog, getRoutineWorkspace } from '@/lib/server/routine-maintenance'

const frequencies: RoutineFrequency[] = ['daily', 'weekly', 'monthly', 'yearly']

function isFrequency(value: string | undefined): value is RoutineFrequency {
  return Boolean(value && frequencies.includes(value as RoutineFrequency))
}

function validDate(value: string | undefined) {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value))
}

function validMonthPeriod(value: string | undefined): value is string {
  return Boolean(value && /^\d{4}-\d{2}$/.test(value) && Number(value.slice(5, 7)) >= 1 && Number(value.slice(5, 7)) <= 12)
}

function validYearPeriod(value: string | undefined): value is string {
  return Boolean(value && /^\d{4}$/.test(value))
}

function latest(form: RoutineMaintenanceForm) {
  return [...form.versions].sort((a, b) => b.versionNumber - a.versionNumber || b.startsOn.localeCompare(a.startsOn))[0] ?? null
}

function stateMark(entry: RoutineMaintenanceEntry | undefined, label: string) {
  const state = entry?.taskResults.find((item) => item.label === label)?.state
  return state === 'done' ? '✓' : state === 'not-applicable' ? 'N/A' : state === 'not-done' ? '✕' : ''
}

function thaiPeriod(frequency: RoutineFrequency, period: string) {
  if (routinePeriodKind(frequency) === 'year') return `ปี ${Number(period) + 543}`
  return new Intl.DateTimeFormat('th-TH', { month: 'long', year: 'numeric', timeZone: 'Asia/Bangkok' }).format(new Date(`${period}-01T00:00:00+07:00`))
}

function occurrenceLabel(occurrence: RoutineMaintenanceOccurrence) {
  return occurrence.shifted ? <>{formatDate(occurrence.plannedOn)}<small>→ {formatDate(occurrence.scheduledOn)}</small></> : formatDate(occurrence.plannedOn)
}

function lockedFor(occurrence: RoutineMaintenanceOccurrence, formId: string, reviews: { formId: string; frequency: RoutineFrequency; period: string }[]) {
  return reviews.some((review) => review.formId === formId && review.frequency === occurrence.frequency && review.period === routinePeriodFor(occurrence.frequency, occurrence.plannedOn))
}

export default async function RoutineMaintenanceReportPage({ searchParams }: { searchParams: Promise<{ equipmentId?: string; formId?: string; frequency?: string; period?: string; month?: string; year?: string; from?: string; to?: string }> }) {
  const actor = await requireFullPageActor()
  const query = await searchParams
  const catalog = await getRoutineReportCatalog(actor)
  const equipment = catalog.equipment.find((item) => item.id === query.equipmentId)
    ?? catalog.equipment.find((item) => item.code.toUpperCase() === 'FACSLYRIC' || item.name.toLowerCase().includes('facslyric'))
    ?? catalog.equipment[0]
  const data = equipment ? await getRoutineWorkspace(actor, equipment.id) : null
  const forms = data?.forms ?? []
  const selectedForm = forms.find((form) => form.id === query.formId)
    ?? (isFrequency(query.frequency) ? forms.find((form) => latest(form)?.frequency === query.frequency) : undefined)
    ?? forms.find((form) => form.active)
    ?? forms[0]
  const currentVersion = selectedForm ? currentRoutineVersion(selectedForm, data?.today ?? todayBangkok()) : null
  const latestFrequency = selectedForm ? latest(selectedForm)?.frequency : undefined
  const frequency = isFrequency(query.frequency) ? query.frequency : currentVersion?.frequency ?? latestFrequency ?? 'daily'
  const presetPeriod = routinePeriodKind(frequency) === 'month'
    ? (validMonthPeriod(query.period) ? query.period : validMonthPeriod(query.month) ? query.month : routinePeriodFor(frequency, data?.today ?? todayBangkok()))
    : (validYearPeriod(query.period) ? query.period : validYearPeriod(query.year) ? query.year : routinePeriodFor(frequency, data?.today ?? todayBangkok()))
  const preset = routinePeriodBounds(frequency, presetPeriod)
  const from = validDate(query.from) ? query.from! : preset.from
  const to = validDate(query.to) ? query.to! : preset.to
  const holidays = new Set((data?.holidays ?? []).filter((holiday) => holiday.formId === selectedForm?.id).map((holiday) => holiday.date))
  const occurrences = selectedForm
    ? generateFormOccurrences(selectedForm, addRoutineDays(from, -370), to, holidays).filter((occurrence) => occurrence.frequency === frequency && occurrence.plannedOn >= from && occurrence.plannedOn <= to)
    : []
  const entries = (data?.entries ?? []).filter((entry) => entry.formId === selectedForm?.id && entry.frequency === frequency && entry.plannedOn >= from && entry.plannedOn <= to)
  const entryByDate = new Map(entries.map((entry) => [entry.plannedOn, entry]))
  const relevantVersionIds = new Set([...occurrences.map((occurrence) => occurrence.versionId), ...entries.map((entry) => entry.versionId)])
  const relevantVersions = selectedForm?.versions.filter((version) => relevantVersionIds.has(version.id)) ?? []
  const labels = selectedForm ? [...new Set(relevantVersions.flatMap((version) => version.items.map((item) => item.label)).concat(entries.flatMap((entry) => entry.taskResults.map((item) => item.label))))] : []
  const selectedReviews = (data?.reviews ?? []).filter((review) => review.formId === selectedForm?.id)
  const reviewNames = [...new Set(selectedReviews.filter((review) => occurrences.some((occurrence) => lockedFor(occurrence, selectedForm?.id ?? '', [review]))).map((review) => review.reviewedByName).filter(Boolean))]
  const reviewerName = selectedForm && data ? data.users.find((user) => user.id === selectedForm.reviewerId)?.displayName ?? 'ยังไม่กำหนด' : '-'
  const documentCode = frequency === 'daily' ? 'Fm-WI-E-BM01/01' : frequency === 'monthly' ? 'Fm-WI-E-BM01/02' : 'Routine Maintenance'

  return <main className="routine-report-page">
    <div className="toolbar print-hidden">
      <Link href={equipment ? `/equipment?view=registry&equipment=${equipment.id}` : '/equipment'} className="back-link">กลับ Equipment</Link>
      <form method="get" className="report-filter">
        <select name="equipmentId" defaultValue={equipment?.id ?? ''} aria-label="เครื่องมือ">{catalog.equipment.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select>
        <select name="formId" defaultValue={selectedForm?.id ?? ''} aria-label="ฟอร์ม"><option value="">— เลือกฟอร์ม —</option>{forms.map((form) => <option key={form.id} value={form.id}>{form.name}{form.active ? '' : ' (ปิดใช้งาน)'}</option>)}</select>
        <select name="frequency" defaultValue={frequency} aria-label="รอบ">{frequencies.map((item) => <option key={item} value={item}>{item[0].toUpperCase() + item.slice(1)}</option>)}</select>
        <input name="period" type={routinePeriodKind(frequency) === 'month' ? 'month' : 'number'} min={routinePeriodKind(frequency) === 'year' ? 2000 : undefined} max={routinePeriodKind(frequency) === 'year' ? 2200 : undefined} defaultValue={presetPeriod} aria-label="งวด" />
        <span className="range-label">หรือช่วง</span>
        <input name="from" type="date" defaultValue={query.from ?? ''} aria-label="ตั้งแต่วันที่" />
        <input name="to" type="date" defaultValue={query.to ?? ''} aria-label="ถึงวันที่" />
        <button type="submit">แสดงรายงาน</button>
      </form>
      <PrintButton />
    </div>

    {!equipment || !selectedForm ? <section className="empty-sheet"><h1>ยังไม่มี Routine Maintenance Form</h1><p>เลือกเครื่องมือที่มีฟอร์ม หรือให้ Admin เพิ่มฟอร์มจากหน้า Equipment</p></section> : <section className={`sheet frequency-${frequency}`}>
      <header className="report-head"><div><p className="eyebrow">MOLECULAR-CBH QMS · CONTROLLED RECORD</p><h1>Routine Maintenance Report</h1><p>{equipment.code} · {equipment.name} · {selectedForm.name}</p></div><div className="doc-meta"><strong>{documentCode}</strong><span>{frequency.toUpperCase()} · {thaiPeriod(frequency, presetPeriod)}</span></div></header>
      <div className="report-info"><span>ช่วงวันที่: {formatDate(from)} – {formatDate(to)}</span><span>Version ที่เกี่ยวข้อง: {new Set(occurrences.map((occurrence) => occurrence.versionId)).size || '-'}</span><span>ผู้ตรวจประจำฟอร์ม: {reviewerName}</span><span>พิมพ์เมื่อ: {formatDateTime(new Date().toISOString())}</span></div>
      <div className="table-wrap"><table className="maintenance-table"><thead><tr><th className="item-col">Checklist</th>{occurrences.map((occurrence) => <th key={occurrence.key} className="date-col">{occurrenceLabel(occurrence)}</th>)}</tr></thead><tbody>{labels.map((label, index) => <tr key={label}><th className="item-col">{index + 1}. {label}</th>{occurrences.map((occurrence) => <td key={`${label}-${occurrence.key}`}>{stateMark(entryByDate.get(occurrence.plannedOn), label)}</td>)}</tr>)}{!labels.length ? <tr><td colSpan={Math.max(occurrences.length + 1, 2)} className="empty-cell">ยังไม่มี Checklist ใน Version นี้</td></tr> : null}<tr className="meta-row"><th className="item-col">ผู้ปฏิบัติ</th>{occurrences.map((occurrence) => { const entry = entryByDate.get(occurrence.plannedOn); return <td key={occurrence.key}>{entry ? <><strong>{entry.operatorCode}</strong><small>{entry.operatorName}</small></> : ''}</td> })}</tr><tr className="meta-row"><th className="item-col">วันที่ทำจริง / เลื่อน</th>{occurrences.map((occurrence) => <td key={occurrence.key}>{occurrence.shifted ? formatDate(occurrence.scheduledOn) : ''}</td>)}</tr><tr className="meta-row"><th className="item-col">หมายเหตุ</th>{occurrences.map((occurrence) => <td key={occurrence.key}>{entryByDate.get(occurrence.plannedOn)?.note ?? ''}</td>)}</tr><tr className="meta-row"><th className="item-col">Review / Lock</th>{occurrences.map((occurrence) => <td key={occurrence.key}>{lockedFor(occurrence, selectedForm.id, selectedReviews) ? 'Lock' : ''}</td>)}</tr></tbody></table></div>
      {!occurrences.length ? <p className="report-note">ไม่พบวันที่ต้องทำในช่วงที่เลือก (วันหยุดสุดสัปดาห์จะไม่สร้างรอบ Daily)</p> : null}
      <div className="review-block"><div><span>ผู้ตรวจสอบ: </span><strong>{reviewNames.join(', ') || reviewerName || '................................'}</strong></div><div><span>สถานะ: </span><strong>{selectedReviews.length && occurrences.some((occurrence) => lockedFor(occurrence, selectedForm.id, selectedReviews)) ? 'มีงวดที่ Lock แล้ว' : 'ยังไม่ Lock'}</strong></div></div>
      <footer><span>{documentCode}</span><p>เอกสารนี้เป็นสมบัติของกลุ่มงานเทคนิคการแพทย์ โรงพยาบาลชลบุรี ห้ามนำออกไปใช้ภายนอกหรือทำซ้ำโดยไม่ได้รับอนุญาต</p></footer>
    </section>}
    <style>{`
      @page{size:A4 landscape;margin:8mm}body{background:#e9eef0;font-family:'Noto Sans Thai',sans-serif;color:#111}.routine-report-page{padding:18px}.toolbar{max-width:277mm;margin:0 auto 12px;display:flex;gap:8px;align-items:center;flex-wrap:wrap}.toolbar a,.toolbar button,.toolbar select,.toolbar input{border:1px solid #b8c8cc;background:white;border-radius:6px;padding:7px 9px;color:#173d50;font:inherit;font-size:12px}.toolbar .back-link{font-weight:700}.report-filter{display:flex;gap:6px;align-items:center;flex-wrap:wrap;flex:1}.range-label{font-size:12px;color:#789097}.sheet,.empty-sheet{position:relative;box-sizing:border-box;width:277mm;min-height:190mm;margin:auto;background:white;padding:10mm 9mm;box-shadow:0 12px 40px #173d5020}.empty-sheet{text-align:center}.empty-sheet h1{margin:30mm 0 4px;font-size:20px}.empty-sheet p{color:#58747d}.report-head{display:flex;justify-content:space-between;gap:16px;align-items:start;border-bottom:1px solid #cbd9da;padding-bottom:7px}.eyebrow{margin:0;color:#0b7f76;font-size:8px;font-weight:800;letter-spacing:.14em}.report-head h1{margin:4px 0;font-size:19px}.report-head p:last-child{margin:0;font-size:12px;color:#315763}.doc-meta{display:grid;gap:4px;text-align:right;font-size:10px;color:#58747d}.doc-meta strong{color:#173d50}.report-info{display:flex;flex-wrap:wrap;gap:12px;margin:8px 0;font-size:9px;color:#58747d}.table-wrap{overflow:hidden}.maintenance-table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:8px}.maintenance-table th,.maintenance-table td{border:1px solid #111;min-height:24px;height:24px;text-align:center;vertical-align:middle;padding:2px}.maintenance-table th{font-weight:700}.maintenance-table .item-col{width:44mm;text-align:left;padding-left:5px;font-size:9px}.maintenance-table .date-col{font-size:7px;overflow-wrap:anywhere}.frequency-daily .maintenance-table .date-col{width:6.7mm}.frequency-weekly .maintenance-table .date-col{width:17mm}.frequency-monthly .maintenance-table .date-col{width:17mm}.frequency-yearly .maintenance-table .date-col{width:30mm}.maintenance-table .date-col small{display:block;font-size:5.5px;color:#9a641d}.maintenance-table td{font-weight:800}.maintenance-table .meta-row th,.maintenance-table .meta-row td{font-weight:400}.maintenance-table .meta-row td small{display:block;font-size:6px;font-weight:400}.empty-cell{height:50px;color:#789097}.report-note{text-align:center;color:#789097;font-size:10px}.review-block{display:flex;justify-content:space-between;gap:20px;margin:18px 8% 0;font-size:10px}.sheet footer{position:absolute;bottom:5mm;left:9mm;right:9mm;text-align:center;font-size:7px}.sheet footer span{float:right}.sheet footer p{margin:0}@media print{body{background:#fff}.routine-report-page{padding:0}.print-hidden{display:none!important}.sheet,.empty-sheet{margin:0;box-shadow:none}.table-wrap{overflow:visible}}
    `}</style>
  </main>
}
