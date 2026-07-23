import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { requireFullPageActor } from '@/lib/server/auth'
import { getEqaWorkspace } from '@/lib/server/eqa'
import { EQA_DOCUMENT_CODES } from '@/lib/eqa/types'
import { EqaApprovalGrid, EqaReportFrame } from '@/components/eqa-report-frame'

export async function generateMetadata({ params }: { params: Promise<{ planId: string }> }): Promise<Metadata> {
  return { title: `EQA-Annual-Plan-${(await params).planId}-Fm-QP-LAB-19-01` }
}
const MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']
function Tick({ show }: { show: boolean }) { return show ? <span className="css-tick" aria-label="เลือก" /> : null }

export default async function EqaAnnualPlanReportPage({ params }: { params: Promise<{ planId: string }> }) {
  const actor = await requireFullPageActor()
  const workspace = await getEqaWorkspace(actor)
  const { planId } = await params
  const plan = workspace.annualPlans.find((item) => item.id === planId)
  if (!plan) notFound()
  return <EqaReportFrame backHref="/eqa" code={EQA_DOCUMENT_CODES['annual-plan']} orientation="landscape" draft={plan.documentState.status !== 'approved'}>
    <header className="plan-header"><h1>แผนการเปรียบเทียบผลการทดสอบระหว่างห้องปฏิบัติการ&nbsp;&nbsp; (EQAS/PT/Interlaboratory comparison) ประจำปี {plan.planYear + 543}</h1><div className="plan-org"><strong>{plan.workSection}</strong><strong>{plan.departmentName}&nbsp;&nbsp; {plan.organizationName}</strong></div></header>
    <table className="plan-table"><thead><tr><th className="no">ลำดับ<br />ที่</th><th className="program">ชื่อการควบคุมคุณภาพภายนอก</th><th className="provider">หน่วยงานผู้<br />จัดส่ง</th><th className="vertical">เงินบำรุง</th><th className="vertical">TOR</th><th className="price">ราคา<br />(บาท)</th><th className="test">รายการทดสอบ</th><th className="frequency">ความถี่</th>{MONTHS.map((month) => <th className="month" key={month}>{month}</th>)}<th className="note">หมายเหตุ</th></tr></thead><tbody>{plan.items.map((item, index) => {
      const responsibleNames = [...new Set(item.occurrences.map((occurrence) => occurrence.responsibleName).filter(Boolean))].join(', ')
      return <tr key={item.id}><td>{index + 1}</td><td className="left">{item.sampleSetName}{item.externalCode ? ` (${item.externalCode})` : ''}</td><td>{item.providerName}</td><td><Tick show={item.maintenanceBudget} /></td><td><Tick show={item.tor} /></td><td>{item.price == null ? '-' : new Intl.NumberFormat('th-TH', { maximumFractionDigits: 2 }).format(item.price)}</td><td>{item.testItem}</td><td>{item.expectedRounds ? `${item.expectedRounds} ครั้ง/ปี` : '-'}</td>{MONTHS.map((_, monthIndex) => <td key={monthIndex}>{item.occurrences.filter((occurrence) => occurrence.plannedMonth === monthIndex + 1).map((occurrence) => occurrence.responsibleCode).join(' ')}</td>)}<td>{[responsibleNames, item.note].filter(Boolean).join(' · ')}</td></tr>
    })}</tbody></table>
    <EqaApprovalGrid roles={['technical-manager', 'quality-manager', 'section-head', 'department-head']} approvals={plan.approvals} />
    <style>{`
      .plan-header h1{margin:0;text-align:center;font-size:22px;font-weight:700}.plan-org{display:grid;grid-template-columns:1fr 2fr;margin:12px 34px 14px;font-size:20px}.plan-org strong:last-child{text-align:left}.plan-table{width:100%;table-layout:fixed;font-size:15px}.plan-table th,.plan-table td{border:1px solid #111;padding:4px 3px;text-align:center;vertical-align:middle}.plan-table th{height:62px;font-weight:700}.plan-table td{height:46px}.plan-table .left{text-align:left}.no{width:34px}.program{width:190px}.provider{width:84px}.vertical{width:28px;writing-mode:vertical-rl;transform:rotate(180deg)}.price{width:50px}.test{width:136px}.frequency{width:50px}.month{width:27px;writing-mode:vertical-rl;transform:rotate(180deg)}.note{width:128px}.css-tick{display:inline-block;width:8px;height:15px;border-right:2px solid #111;border-bottom:2px solid #111;transform:rotate(42deg)}
    `}</style>
  </EqaReportFrame>
}
