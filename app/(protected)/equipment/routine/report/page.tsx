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
  routineUsesReviewLock,
  weekendDayLabel,
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

function equipmentPrimaryName(item: { name: string; manufacturer: string | null; model: string | null }) {
  const identity = [item.manufacturer, item.model].flatMap((value) => (value?.trim() ? [value.trim()] : [])).join(' · ')
  return identity || item.name
}

function latest(form: RoutineMaintenanceForm) {
  return [...form.versions].sort((a, b) => b.versionNumber - a.versionNumber || b.startsOn.localeCompare(a.startsOn))[0] ?? null
}

function stateMark(entry: RoutineMaintenanceEntry | undefined, label: string, form: RoutineMaintenanceForm) {
  const state = entry?.taskResults.find((item) => item.label === label)?.state
  if (!state) return ''
  const version = form.versions.find((item) => item.id === entry?.versionId)
  const item = version?.items.find((item) => item.label === label)
  return item?.responseSet.options.find((option) => option.value === state)?.mark ?? ''
}

function thaiPeriod(frequency: RoutineFrequency, period: string) {
  if (routinePeriodKind(frequency) === 'year') return `ปี ${Number(period) + 543}`
  return new Intl.DateTimeFormat('th-TH', { month: 'long', year: 'numeric', timeZone: 'Asia/Bangkok' }).format(new Date(`${period}-01T00:00:00+07:00`))
}

function occurrenceLabel(occurrence: RoutineMaintenanceOccurrence, isHoliday: boolean) {
  const weekday = weekendDayLabel(occurrence.plannedOn)
  return <>{formatDate(occurrence.plannedOn)}{occurrence.shifted ? <small>→ {formatDate(occurrence.scheduledOn)}</small> : null}{weekday ? <small>({weekday === 'เสาร์' ? 'ส' : 'อา'})</small> : isHoliday ? <small>(หยุด)</small> : null}</>
}

function calendarDateKeys(from: string, to: string) {
  if (to < from) return []
  const dates: string[] = []
  let date = from
  while (date <= to && dates.length < 3700) {
    dates.push(date)
    date = addRoutineDays(date, 1)
  }
  return dates
}

function versionForCalendarDate(form: RoutineMaintenanceForm, frequency: RoutineFrequency, date: string) {
  return form.versions
    .filter((version) => version.frequency === frequency && version.startsOn <= date)
    .sort((a, b) => a.startsOn.localeCompare(b.startsOn) || a.versionNumber - b.versionNumber)
    .pop()
}

function calendarOccurrenceForDate(form: RoutineMaintenanceForm, frequency: RoutineFrequency, date: string, occurrenceByDate: Map<string, RoutineMaintenanceOccurrence>) {
  const occurrence = occurrenceByDate.get(date)
  if (occurrence) return occurrence
  const version = versionForCalendarDate(form, frequency, date)
  return {
    key: `calendar:${form.id}:${frequency}:${date}`,
    formId: form.id,
    versionId: version?.id ?? '',
    frequency,
    plannedOn: date,
    scheduledOn: date,
    shifted: false,
  } satisfies RoutineMaintenanceOccurrence
}

function dayTone(date: string, holidays: ReadonlySet<string>) {
  if (weekendDayLabel(date)) return 'weekend'
  return holidays.has(date) ? 'holiday' : ''
}

function lockedFor(occurrence: RoutineMaintenanceOccurrence, formId: string, reviews: { formId: string; frequency: RoutineFrequency; period: string }[]) {
  if (!routineUsesReviewLock(occurrence.frequency)) return false
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
  const scheduledOccurrences = selectedForm
    ? generateFormOccurrences(selectedForm, addRoutineDays(from, -370), to, holidays).filter((occurrence) => occurrence.frequency === frequency && occurrence.plannedOn >= from && occurrence.plannedOn <= to)
    : []
  const occurrenceByDate = new Map(scheduledOccurrences.map((occurrence) => [occurrence.plannedOn, occurrence]))
  const occurrences = selectedForm && routinePeriodKind(frequency) === 'month'
    ? calendarDateKeys(from, to).map((date) => calendarOccurrenceForDate(selectedForm, frequency, date, occurrenceByDate))
    : scheduledOccurrences
  const entries = (data?.entries ?? []).filter((entry) => entry.formId === selectedForm?.id && entry.frequency === frequency && entry.plannedOn >= from && entry.plannedOn <= to)
  const entryByDate = new Map(entries.map((entry) => [entry.plannedOn, entry]))
  const relevantVersionIds = new Set([...occurrences.map((occurrence) => occurrence.versionId), ...entries.map((entry) => entry.versionId)])
  const relevantVersions = selectedForm?.versions.filter((version) => relevantVersionIds.has(version.id)) ?? []
  const labels = selectedForm ? [...new Set(relevantVersions.flatMap((version) => version.items.map((item) => item.label)).concat(entries.flatMap((entry) => entry.taskResults.map((item) => item.label))))] : []
  const selectedReviews = (data?.reviews ?? []).filter((review) => review.formId === selectedForm?.id)
  const reviewNames = [...new Set(selectedReviews.filter((review) => occurrences.some((occurrence) => lockedFor(occurrence, selectedForm?.id ?? '', [review]))).map((review) => review.reviewedByName).filter(Boolean))]
  const reviewerName = selectedForm && data ? data.users.find((user) => user.id === selectedForm.reviewerId)?.displayName ?? 'ยังไม่กำหนด' : '-'
  const documentCode = frequency === 'daily' ? 'Fm-WI-E-BM01/01' : frequency === 'monthly' ? 'Fm-WI-E-BM01/02' : 'Routine Maintenance'
  const calendarColumnStyles = occurrences.flatMap((occurrence, index) => {
    const tone = dayTone(occurrence.plannedOn, holidays)
    if (!tone) return []
    const column = index + 2
    return [
      `.maintenance-table tr > :nth-child(${column}){background:#38525b !important;color:#fff !important;}`,
      `.maintenance-table tr > :nth-child(${column}) small{color:#dce7e8 !important;}`,
    ]
  }).join('')

  return <main className="routine-report-page">
    <div className="toolbar print-hidden">
      <Link href={equipment ? `/equipment?view=registry&equipment=${equipment.id}` : '/equipment'} className="back-link">← กลับ Equipment</Link>
      <form method="get" className="report-filter">
        <label className="filter-field"><span>เครื่องมือ</span><select name="equipmentId" defaultValue={equipment?.id ?? ''}>{catalog.equipment.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select></label>
        <label className="filter-field"><span>ฟอร์ม</span><select name="formId" defaultValue={selectedForm?.id ?? ''}><option value="">— เลือกฟอร์ม —</option>{forms.map((form) => <option key={form.id} value={form.id}>{form.name}{form.active ? '' : ' (ปิดใช้งาน)'}</option>)}</select></label>
        <label className="filter-field"><span>รอบ</span><select name="frequency" defaultValue={frequency}>{frequencies.map((item) => <option key={item} value={item}>{item[0].toUpperCase() + item.slice(1)}</option>)}</select></label>
        <label className="filter-field"><span>งวด</span><input name="period" type={routinePeriodKind(frequency) === 'month' ? 'month' : 'number'} min={routinePeriodKind(frequency) === 'year' ? 2000 : undefined} max={routinePeriodKind(frequency) === 'year' ? 2200 : undefined} defaultValue={presetPeriod} /></label>
        <span className="range-label">หรือช่วง</span>
        <label className="filter-field"><span>ตั้งแต่วันที่</span><input name="from" type="date" defaultValue={query.from ?? ''} /></label>
        <label className="filter-field"><span>ถึงวันที่</span><input name="to" type="date" defaultValue={query.to ?? ''} /></label>
        <button type="submit">แสดงรายงาน</button>
      </form>
      <PrintButton />
    </div>

    {!equipment || !selectedForm ? <section className="empty-sheet"><h1>ยังไม่มี Routine Maintenance Form</h1><p>เลือกเครื่องมือที่มีฟอร์ม หรือให้ Admin เพิ่มฟอร์มจากหน้า Equipment</p></section> : <section className={`sheet frequency-${frequency}`}>
      <header className="report-head"><div><p className="eyebrow">MOLECULAR-CBH QMS · CONTROLLED RECORD</p><h1>Routine Maintenance Report</h1><p>{equipment.code} · {equipmentPrimaryName(equipment)} · {selectedForm.name}</p></div><div className="doc-meta"><strong>{documentCode}</strong><span>{frequency.toUpperCase()} · {thaiPeriod(frequency, presetPeriod)}</span></div></header>
      <div className="report-info"><span>ช่วงวันที่: {formatDate(from)} – {formatDate(to)}</span><span>Version ที่เกี่ยวข้อง: {new Set(occurrences.map((occurrence) => occurrence.versionId)).size || '-'}</span><span>ผู้ตรวจประจำฟอร์ม: {reviewerName}</span><span>พิมพ์เมื่อ: {formatDateTime(new Date().toISOString())}</span></div>
      <div className="table-wrap"><table className="maintenance-table"><thead><tr><th className="item-col">Checklist</th>{occurrences.map((occurrence) => { const isHoliday = holidays.has(occurrence.plannedOn); const isWeekend = Boolean(weekendDayLabel(occurrence.plannedOn)); return <th key={occurrence.key} className={`date-col${isWeekend ? ' weekend' : isHoliday ? ' holiday' : ''}`}>{occurrenceLabel(occurrence, isHoliday)}</th> })}</tr></thead><tbody>{labels.map((label, index) => <tr key={label}><th className="item-col">{index + 1}. {label}</th>{occurrences.map((occurrence) => <td key={`${label}-${occurrence.key}`}>{stateMark(entryByDate.get(occurrence.plannedOn), label, selectedForm)}</td>)}</tr>)}{!labels.length ? <tr><td colSpan={Math.max(occurrences.length + 1, 2)} className="empty-cell">ยังไม่มี Checklist ใน Version นี้</td></tr> : null}<tr className="meta-row"><th className="item-col">ผู้ปฏิบัติ</th>{occurrences.map((occurrence) => { const entry = entryByDate.get(occurrence.plannedOn); return <td key={occurrence.key}>{entry ? <><strong>{entry.operatorCode}</strong><small>{entry.operatorName}</small></> : ''}</td> })}</tr><tr className="meta-row"><th className="item-col">หมายเหตุ</th>{occurrences.map((occurrence) => <td key={occurrence.key}>{entryByDate.get(occurrence.plannedOn)?.note ?? ''}</td>)}</tr><tr className="meta-row"><th className="item-col">Review / Lock</th>{occurrences.map((occurrence) => <td key={occurrence.key}>{lockedFor(occurrence, selectedForm.id, selectedReviews) ? 'Lock' : ''}</td>)}</tr></tbody></table></div>
      {!occurrences.length ? <p className="report-note">ไม่พบวันที่ต้องทำในช่วงที่เลือก (วันหยุดสุดสัปดาห์จะไม่สร้างรอบ Daily)</p> : null}
      <div className="review-block"><div><span>ผู้ตรวจสอบ: </span><strong>{reviewNames.join(', ') || reviewerName || '................................'}</strong></div><div><span>สถานะ: </span><strong>{selectedReviews.length && occurrences.some((occurrence) => lockedFor(occurrence, selectedForm.id, selectedReviews)) ? 'มีงวดที่ Lock แล้ว' : 'ยังไม่ Lock'}</strong></div></div>
      <footer><span>{documentCode}</span><p>เอกสารนี้เป็นสมบัติของกลุ่มงานเทคนิคการแพทย์ โรงพยาบาลชลบุรี ห้ามนำออกไปใช้ภายนอกหรือทำซ้ำโดยไม่ได้รับอนุญาต</p></footer>
    </section>}
    <style>{`
      @page{size:A4 landscape;margin:8mm}body{background:#e9eef0;font-family:'Noto Sans Thai',sans-serif;color:#111}.routine-report-page{padding:18px}.toolbar{max-width:277mm;margin:0 auto 14px;display:flex;gap:10px;align-items:center;flex-wrap:wrap;background:#fff;border:1px solid #e1eaeb;border-radius:12px;padding:10px 12px;box-shadow:0 1px 2px rgba(23,61,80,.05)}.toolbar a,.toolbar button,.toolbar select,.toolbar input{border:1px solid #cddbde;background:white;border-radius:7px;padding:7px 10px;color:#173d50;font:inherit;font-size:12.5px;transition:border-color .15s,box-shadow .15s}.toolbar select:focus-visible,.toolbar input:focus-visible,.toolbar button:focus-visible,.toolbar a:focus-visible{outline:none;border-color:#0b7f76;box-shadow:0 0 0 3px rgba(11,127,118,.18)}.toolbar button[type=submit]{border-color:#0b7f76;background:#eef8f5;color:#08766e;font-weight:700;cursor:pointer}#print-report{background:#0b7f76;border-color:#0b7f76;color:#fff;font-weight:700;cursor:pointer}#print-report:disabled{opacity:.6;cursor:default}.toolbar .back-link{font-weight:700;display:inline-flex;align-items:center;gap:4px;text-decoration:none;white-space:nowrap}.report-filter{display:flex;gap:10px;align-items:end;flex-wrap:wrap;flex:1}.filter-field{display:flex;flex-direction:column;gap:3px;font-size:10px;font-weight:700;letter-spacing:.03em;color:#6d858b;text-transform:uppercase}.filter-field select,.filter-field input{font-size:12.5px;font-weight:400;color:#173d50;text-transform:none;letter-spacing:normal}.range-label{font-size:11.5px;color:#8a9ea3;padding-bottom:8px}.sheet,.empty-sheet{position:relative;box-sizing:border-box;width:277mm;min-height:190mm;margin:auto;background:white;padding:10mm 9mm;box-shadow:0 12px 40px #173d5020}.empty-sheet{text-align:center;display:flex;flex-direction:column;align-items:center;justify-content:center}.empty-sheet h1{margin:0 0 6px;font-size:19px;color:#173d50}.empty-sheet p{margin:0;color:#58747d;font-size:13px}.report-head{display:flex;justify-content:space-between;gap:16px;align-items:start;border-bottom:2px solid #173d50;padding-bottom:8px;margin-top:2px}.eyebrow{margin:0;color:#0b7f76;font-size:8px;font-weight:800;letter-spacing:.14em}.report-head h1{margin:3px 0;font-size:20px;font-weight:800;color:#0f2a38;letter-spacing:-.01em}.report-head p:last-child{margin:0;font-size:12px;color:#315763}.doc-meta{display:grid;gap:4px;text-align:right;font-size:10px;color:#58747d;padding-left:14px;border-left:1px solid #dbe6e6}.doc-meta strong{color:#173d50;font-size:12px;letter-spacing:.02em}.report-info{display:flex;flex-wrap:wrap;gap:0;margin:9px 0;font-size:9.5px;color:#4d6771;background:#f6faf9;border:1px solid #e3eeed;border-radius:6px;padding:6px 0}.report-info span{padding:0 12px;border-left:1px solid #dde9e8}.report-info span:first-child{border-left:none}.table-wrap{overflow:hidden}.maintenance-table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:8px;font-variant-numeric:tabular-nums}.maintenance-table th,.maintenance-table td{border:1px solid #24343c;min-height:24px;height:24px;text-align:center;vertical-align:middle;padding:2px}.maintenance-table th{font-weight:700;background:#eef7f6;color:#0f2a38}.maintenance-table .item-col{width:44mm;text-align:left;padding-left:6px;font-size:9px}.maintenance-table .date-col{font-size:7px;overflow-wrap:anywhere}.frequency-daily .maintenance-table .date-col{width:6.7mm}.frequency-weekly .maintenance-table .date-col{width:6.7mm}.frequency-monthly .maintenance-table .date-col{width:17mm}.frequency-yearly .maintenance-table .date-col{width:30mm}.maintenance-table .date-col small{display:block;font-size:5.5px;color:#9a641d}.maintenance-table .date-col.weekend,.maintenance-table .date-col.holiday{background:#fdf3df}.maintenance-table td{font-weight:800}.maintenance-table .meta-row th,.maintenance-table .meta-row td{font-weight:400;background:#fafcfc}.maintenance-table .meta-row td small{display:block;font-size:6px;font-weight:400}.empty-cell{height:50px;color:#789097}.report-note{text-align:center;color:#789097;font-size:10px}.review-block{display:flex;justify-content:space-between;gap:20px;margin:20px 8% 0;font-size:10.5px;color:#58747d}.review-block strong{display:inline-block;min-width:120px;border-bottom:1px dotted #9fb4ba;padding:0 4px 2px;color:#173d50}.sheet footer{position:absolute;bottom:5mm;left:9mm;right:9mm;text-align:center;font-size:7px;border-top:1px solid #e3eeed;padding-top:3px;color:#8a9ea3}.sheet footer span{float:right}.sheet footer p{margin:0}@media print{body{background:#fff}.routine-report-page{padding:0}.print-hidden{display:none!important}.sheet,.empty-sheet{margin:0;box-shadow:none}.table-wrap{overflow:visible}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
    `}</style>
    <style>{calendarColumnStyles}</style>
    <style>{`.frequency-monthly .maintenance-table .date-col{width:6.7mm}`}</style>
  </main>
}
