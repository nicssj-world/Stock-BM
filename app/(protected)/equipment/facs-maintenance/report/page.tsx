import Link from 'next/link'
import { PrintButton } from '@/components/print-button'
import { FACS_DAILY_TASKS, FACS_MONTHLY_TASKS, type FacsMaintenanceFrequency, type FacsTaskState } from '@/lib/equipment/facs-maintenance'
import { formatDateTime, todayBangkok } from '@/lib/bm/rules'
import { requireFullPageActor } from '@/lib/server/auth'
import { getFacsMaintenanceWorkspace } from '@/lib/server/facs-maintenance'

function currentMonth() { return todayBangkok().slice(0, 7) }
function currentYear() { return todayBangkok().slice(0, 4) }
function stateMark(state: FacsTaskState | undefined) { return state === 'done' ? '✓' : state === 'not-applicable' ? 'N/A' : '' }
function thaiMonth(value: string) { return new Intl.DateTimeFormat('th-TH', { month: 'long', year: 'numeric', timeZone: 'Asia/Bangkok' }).format(new Date(`${value}-01T00:00:00+07:00`)) }

export default async function FacsMaintenanceReportPage({ searchParams }: { searchParams: Promise<{ frequency?: string; month?: string; year?: string }> }) {
  const actor = await requireFullPageActor()
  const data = await getFacsMaintenanceWorkspace(actor)
  const query = await searchParams
  const frequency: FacsMaintenanceFrequency = query.frequency === 'monthly' ? 'monthly' : 'daily'
  const month = /^\d{4}-\d{2}$/.test(query.month ?? '') ? query.month! : currentMonth()
  const year = /^\d{4}$/.test(query.year ?? '') ? query.year! : currentYear()
  const selected = data.entries.filter((entry) => frequency === 'daily' ? entry.frequency === 'daily' && entry.performedOn.startsWith(month) : entry.frequency === 'monthly' && entry.performedOn.startsWith(year))
  const review = data.reviews.find((item) => item.frequency === frequency && item.period === (frequency === 'daily' ? month : year))
  const bySlot = new Map(selected.map((entry) => [frequency === 'daily' ? Number(entry.performedOn.slice(8, 10)) : Number(entry.performedOn.slice(5, 7)), entry]))
  const slots = frequency === 'daily' ? Array.from({ length: 31 }, (_, index) => index + 1) : Array.from({ length: 12 }, (_, index) => index + 1)
  const tasks = frequency === 'daily' ? FACS_DAILY_TASKS : FACS_MONTHLY_TASKS
  const documentCode = frequency === 'daily' ? 'Fm-WI-E-BM01/01' : 'Fm-WI-E-BM01/02'
  return <main className="facs-report-page">
    <div className="toolbar print-hidden">
      <Link href={data.equipment ? `/equipment?view=registry&equipment=${data.equipment.id}` : '/equipment'}>กลับ Equipment</Link>
      <form method="get" className="report-filter">
        <select name="frequency" defaultValue={frequency}><option value="daily">Daily</option><option value="monthly">Monthly</option></select>
        {frequency === 'daily' ? <input type="month" name="month" defaultValue={month} /> : <input type="number" name="year" min="2000" max="2200" defaultValue={year} />}
        <button type="submit">แสดงรายงาน</button>
      </form>
      <PrintButton />
    </div>
    {!data.equipment ? <p>ไม่พบเครื่อง FACSLyric ในทะเบียน</p> : <section className="sheet">
      <h1>ตารางการดูแลรักษาเครื่อง BD FACSLyric ประจำ{frequency === 'daily' ? 'วัน' : 'เดือน'}</h1>
      <table className="maintenance-table"><thead><tr><th className="task-heading">{frequency === 'daily' ? 'Daily Maintenance' : 'Monthly Maintenance'}</th>{slots.map((slot) => <th key={slot}>{frequency === 'daily' ? slot : ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'July', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][slot - 1]}</th>)}</tr></thead><tbody>
        {tasks.map((task, index) => <tr key={task}><th>{index + 1}. {task}</th>{slots.map((slot) => <td key={slot}>{stateMark(bySlot.get(slot)?.taskResults[index]?.state)}</td>)}</tr>)}
        <tr><th>ผู้ปฏิบัติ</th>{slots.map((slot) => <td key={slot}>{bySlot.get(slot)?.operatorCode ?? ''}</td>)}</tr>
      </tbody></table>
      {frequency === 'daily' ? <p className="period">Month: {thaiMonth(month)}</p> : null}
      <div className="reviewer"><span>ผู้ตรวจสอบ : {review?.reviewedByName ?? '................................'}</span><span>วันที่ : {review ? formatDateTime(review.reviewedAt) : '........................'}</span><small>(ผู้จัดการวิชาการ)</small></div>
      <footer><span>{documentCode}</span><p>เอกสารนี้เป็นสมบัติของกลุ่มงานเทคนิคการแพทย์ โรงพยาบาลชลบุรี ห้ามนำออกไปใช้ภายนอกหรือทำซ้ำโดยไม่ได้รับอนุญาต</p></footer>
    </section>}
    <style>{`
      @page{size:A4 landscape;margin:10mm}body{background:#e9eef0;font-family:'Noto Sans Thai',sans-serif;color:#111}.facs-report-page{padding:20px}.toolbar{max-width:277mm;margin:0 auto 12px;display:flex;gap:8px;align-items:center;justify-content:space-between}.toolbar a,.toolbar button,.toolbar select,.toolbar input{border:1px solid #b8c8cc;background:white;border-radius:6px;padding:7px 10px;color:#173d50;font:inherit;font-size:13px}.report-filter{display:flex;gap:6px}.sheet{position:relative;box-sizing:border-box;width:277mm;min-height:190mm;margin:auto;background:white;padding:12mm 10mm;box-shadow:0 12px 40px #173d5020}.sheet h1{text-align:center;font-size:18px;margin:0 0 15px}.maintenance-table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:8px}.maintenance-table th,.maintenance-table td{border:1px solid #111;height:24px;text-align:center;vertical-align:middle;padding:1px}.maintenance-table tbody th{width:125px;text-align:left;font-size:9px;font-weight:400;padding:2px 5px}.maintenance-table .task-heading{width:125px;font-size:11px}.maintenance-table td{font-weight:700}.period{text-align:center;font-size:12px;margin:8px 0}.reviewer{margin:28px 15% 0 auto;width:46%;display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:10px}.reviewer small{grid-column:1/-1;text-align:center}.sheet footer{position:absolute;bottom:7mm;left:10mm;right:10mm;font-size:7px;text-align:center}.sheet footer span{position:absolute;right:0;bottom:16px}.sheet footer p{margin:0}@media print{body{background:white}.facs-report-page{padding:0}.print-hidden{display:none!important}.sheet{margin:0;box-shadow:none}}
    `}</style>
  </main>
}
