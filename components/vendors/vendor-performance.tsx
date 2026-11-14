import Link from 'next/link'
import { Card, StatCard } from '@/components/ui'
import { formatThaiDate } from '@/lib/bm/thai-date'
import { criterionLabel } from '@/lib/vendors/evaluation'
import type { PerformanceSnapshot } from '@/lib/server/vendors'

const number = new Intl.NumberFormat('th-TH', { maximumFractionDigits: 1 })
const pct = (v: number | null | undefined) => (v === null || v === undefined ? 'N/A' : `${number.format(Number(v))}%`)

export type TrendPoint = { fiscalYear: number; receipts: number; issues: number; officialScore: number | null }

/** Live performance for one vendor and fiscal year (LABCBH-Stock VendorPerformance): KPI tiles, criteria table, coverage donut, trend. */
export function VendorPerformance({ snapshot, trend, hrefForYear, officialScore }: { snapshot: PerformanceSnapshot; trend: TrendPoint[]; hrefForYear: (fiscalYear: number) => string; officialScore: { score: number; result: 'pass' | 'fail' } | null }) {
  const cov = snapshot.coverage
  const total = cov.completed + cov.pending
  return <div className="space-y-5">
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
      <StatCard label="Invoice" value={snapshot.activity.invoices} />
      <StatCard label="การรับของ" value={snapshot.activity.receipts} />
      <StatCard label="ตรวจรับแล้ว" value={snapshot.activity.completedAssessments} hint={total ? `ความครอบคลุม ${pct(cov.percentage)}` : undefined} />
      <StatCard label="ปัญหาที่เปิดอยู่" value={snapshot.activity.openIssues} tone={snapshot.activity.openIssues > 0 ? 'warning' : 'neutral'} />
      <StatCard label="ปัญหาที่แก้ไขแล้ว" value={snapshot.activity.resolvedIssues} />
      <StatCard label="คะแนนประจำปี" value={officialScore ? number.format(officialScore.score) : '—'} tone={officialScore?.result === 'fail' ? 'rejected' : 'neutral'} hint={officialScore ? (officialScore.result === 'pass' ? 'ผ่าน' : 'ไม่ผ่าน') : 'ยังไม่มีรายงานอย่างเป็นทางการ'} />
    </div>

    <div className="grid gap-4 lg:grid-cols-[1fr_260px]">
      <Card className="overflow-hidden">
        <div className="px-4 py-3"><h3 className="font-bold text-[#173d50]">ผลตามเกณฑ์ 8 ข้อ (ข้อมูลสด)</h3><p className="mt-1 text-xs text-[#81979c]">ช่วงข้อมูล {formatThaiDate(cov.startDate)} – {formatThaiDate(cov.endDate)} · ตัวเลขนี้ยังไม่ใช่คะแนนอย่างเป็นทางการ</p></div>
        <div className="relative overflow-x-auto"><table className="w-full min-w-[520px] text-left text-sm"><thead className="bg-[#f1f6f6] text-xs text-[#58747d]"><tr><th className="p-2 pl-4">เกณฑ์</th><th className="p-2">หลักฐาน</th><th className="p-2">ผล</th><th className="p-2 pr-4"><span className="sr-only">แถบสัดส่วน</span></th></tr></thead>
          <tbody>{snapshot.criteria.map((c) => <tr key={c.criterionCode} className="border-t border-[#e5eeee]">
            <th scope="row" className="p-2 pl-4 font-semibold text-[#315763]">{criterionLabel(c.criterionCode)}{c.criterionCode === 'complaint_performance' && !!c.supplementaryCount && <small className="block font-normal text-[#81979c]">ข้อร้องเรียนบันทึกด้วยมือ {c.supplementaryCount} รายการ (หลักฐานเพิ่มเติม แสดงแยกจากอัตราผลตรวจรับตามนโยบายที่อนุมัติ)</small>}</th>
            <td className="p-2 tabular-nums">{c.applicable ? `${c.numerator}/${c.denominator}` : 'N/A'}</td>
            <td className="p-2 font-bold tabular-nums">{pct(c.percentage)}</td>
            <td className="w-40 p-2 pr-4">{c.applicable && <progress className="w-full" max={100} value={Number(c.percentage)} aria-hidden />}</td></tr>)}</tbody></table></div>
      </Card>
      <Card className="grid content-start justify-items-center gap-3 p-5 text-center"><h3 className="font-bold text-[#173d50]">ความครอบคลุมผลตรวจรับ</h3>
        <Donut value={cov.percentage} />
        <p className="text-sm text-[#6a838c]">{total ? `ตรวจรับแล้ว ${cov.completed} จาก ${total} ครั้งที่ต้องประเมิน` : 'ยังไม่มีการรับของที่ต้องประเมินในปีนี้'}</p></Card>
    </div>

    <Card className="space-y-3 p-4"><h3 className="font-bold text-[#173d50]">แนวโน้ม 5 ปีงบประมาณ</h3>
      <TrendChart points={trend} />
      <div className="relative overflow-x-auto"><table className="w-full min-w-[420px] text-left text-sm"><thead className="bg-[#f1f6f6] text-xs text-[#58747d]"><tr><th className="p-2">ปีงบประมาณ (พ.ศ.)</th><th className="p-2">การรับของ</th><th className="p-2">ปัญหา</th><th className="p-2">คะแนนอย่างเป็นทางการ</th></tr></thead>
        <tbody>{trend.map((t) => <tr key={t.fiscalYear} className="border-t border-[#e5eeee]"><td className="p-2"><Link href={hrefForYear(t.fiscalYear)} className={t.fiscalYear === snapshot.fiscalYear ? 'font-bold text-[#0b7f76]' : 'text-[#0b7f76]'} aria-current={t.fiscalYear === snapshot.fiscalYear ? 'true' : undefined}>{t.fiscalYear}</Link></td><td className="p-2 tabular-nums">{t.receipts}</td><td className="p-2 tabular-nums">{t.issues}</td><td className="p-2 tabular-nums">{t.officialScore === null ? '—' : number.format(t.officialScore)}</td></tr>)}</tbody></table></div>
    </Card>
  </div>
}

function Donut({ value }: { value: number | null }) {
  const radius = 44
  const circumference = 2 * Math.PI * radius
  const filled = value === null ? 0 : Math.max(0, Math.min(100, Number(value)))
  return <svg viewBox="0 0 120 120" className="size-32" role="img" aria-label={value === null ? 'ไม่มีข้อมูลความครอบคลุม' : `ความครอบคลุม ${value}%`}>
    <circle cx="60" cy="60" r={radius} fill="none" stroke="#e5eff1" strokeWidth="14" />
    <circle cx="60" cy="60" r={radius} fill="none" stroke="#087d78" strokeWidth="14" strokeLinecap="round" strokeDasharray={`${(filled / 100) * circumference} ${circumference}`} transform="rotate(-90 60 60)" />
    <text x="60" y="66" textAnchor="middle" fontSize="20" fontWeight="700" fill="#153044">{value === null ? 'N/A' : `${number.format(filled)}%`}</text>
  </svg>
}

// Receipt and issue bars per fiscal year, with the official score as a line on a 0-100 axis, drawn as inline SVG like LABCBH.
function TrendChart({ points }: { points: TrendPoint[] }) {
  const width = 640
  const height = 200
  const pad = { l: 36, r: 36, t: 12, b: 28 }
  const max = Math.max(1, ...points.flatMap((p) => [p.receipts, p.issues]))
  const slot = (width - pad.l - pad.r) / points.length
  const y = (v: number) => height - pad.b - (v / max) * (height - pad.t - pad.b)
  const yScore = (v: number) => height - pad.b - (v / 100) * (height - pad.t - pad.b)
  const scored = points.filter((p) => p.officialScore !== null)
  const line = scored.map((p) => `${pad.l + slot * points.indexOf(p) + slot / 2},${yScore(p.officialScore!)}`).join(' ')
  return <svg viewBox={`0 0 ${width} ${height}`} className="w-full max-w-[720px]" role="img" aria-label="กราฟแนวโน้มการรับของ ปัญหา และคะแนนรายปี">
    <line x1={pad.l} x2={width - pad.r} y1={height - pad.b} y2={height - pad.b} stroke="#bfd0d8" />
    {points.map((p, i) => { const x = pad.l + slot * i; const bar = slot * 0.28; return <g key={p.fiscalYear}>
      <rect x={x + slot / 2 - bar - 2} y={y(p.receipts)} width={bar} height={height - pad.b - y(p.receipts)} fill="#155e99" rx="2" />
      <rect x={x + slot / 2 + 2} y={y(p.issues)} width={bar} height={height - pad.b - y(p.issues)} fill="#c0392b" rx="2" />
      <text x={x + slot / 2} y={height - 8} textAnchor="middle" fontSize="11" fill="#526a79">{p.fiscalYear}</text></g> })}
    {line && <polyline points={line} fill="none" stroke="#2f855a" strokeWidth="2.5" />}
    {scored.map((p) => <circle key={p.fiscalYear} cx={pad.l + slot * points.indexOf(p) + slot / 2} cy={yScore(p.officialScore!)} r="4" fill="#2f855a"><title>{`ปี ${p.fiscalYear}: ${p.officialScore}`}</title></circle>)}
    <text x={pad.l - 6} y={y(max) + 4} textAnchor="end" fontSize="10" fill="#526a79">{max}</text><text x={width - pad.r + 6} y={yScore(100) + 4} fontSize="10" fill="#2f855a">100</text>
    <g fontSize="11" fill="#526a79"><rect x={pad.l} y="0" width="10" height="10" fill="#155e99" /><text x={pad.l + 14} y="9">การรับของ</text><rect x={pad.l + 90} y="0" width="10" height="10" fill="#c0392b" /><text x={pad.l + 104} y="9">ปัญหา</text><rect x={pad.l + 160} y="0" width="10" height="10" fill="#2f855a" /><text x={pad.l + 174} y="9">คะแนนทางการ</text></g>
  </svg>
}
