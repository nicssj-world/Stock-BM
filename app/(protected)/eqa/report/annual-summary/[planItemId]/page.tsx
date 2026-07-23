import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { requireFullPageActor } from '@/lib/server/auth'
import { getEqaWorkspace } from '@/lib/server/eqa'
import { EQA_DOCUMENT_CODES } from '@/lib/eqa/types'
import { EqaApprovalGrid, EqaReportFrame } from '@/components/eqa-report-frame'

export async function generateMetadata({ params }: { params: Promise<{ planItemId: string }> }): Promise<Metadata> {
  return { title: `EQA-Annual-Summary-${(await params).planItemId}-Fm-QP-LAB-19-04` }
}
function Tick({ show }: { show: boolean }) { return show ? <span className="css-tick" aria-label="เลือก" /> : null }

export default async function EqaAnnualSummaryReportPage({ params }: { params: Promise<{ planItemId: string }> }) {
  const actor = await requireFullPageActor(); const workspace = await getEqaWorkspace(actor)
  const { planItemId } = await params
  const summary = workspace.annualSummaries.find((item) => item.planItem.id === planItemId); if (!summary) notFound()
  const item = summary.planItem
  return <EqaReportFrame backHref="/eqa" code={EQA_DOCUMENT_CODES['annual-summary']} orientation="portrait" draft={summary.documentState.status !== 'approved'}>
    <header className="summary-header"><h1>สรุปผลการเปรียบเทียบผลการทดสอบระหว่างห้องปฏิบัติการ&nbsp;&nbsp; ประจำปี {summary.plan.planYear + 543}</h1><h2>(EQAS/PT/Interlaboratory comparison)</h2></header>
    <section className="summary-meta"><div><strong>ชื่อโครงการ:</strong> {item.projectName}</div><div><strong>หน่วยงาน:</strong> {item.providerName}</div><div><strong>ชื่อชุดตัวอย่างทดสอบ:</strong> {item.sampleSetName}</div><div><strong>เครื่องมือ:</strong> {item.equipmentName ?? ''}</div><div className="wide"><strong>รหัสตัวอย่างทดสอบ:</strong> {summary.rounds.flatMap((round) => round.results.map((result) => result.sampleCode)).filter(Boolean).join(', ')}</div></section>
    <section className="criteria"><strong>เกณฑ์การประเมิน:</strong><div>{item.evaluationCriteria?.split('\n').map((line, index) => <p key={index}>{line || <>&nbsp;</>}</p>)}</div></section>
    <table className="summary-table"><thead><tr><th rowSpan={2} className="seq">ลำดับที่</th><th rowSpan={2} className="round">รายการทดสอบ</th><th colSpan={2}>ผลการประเมิน</th><th rowSpan={2} className="remark">หมายเหตุ/การปรับปรุงแก้ไข</th></tr><tr><th className="result-col">ผ่านเกณฑ์</th><th className="result-col">ไม่ผ่านเกณฑ์</th></tr></thead><tbody>{summary.rounds.map((round, index) => <tr key={round.id}><td>{index + 1}</td><td className="left">ครั้งที่ {index + 1}/{summary.plan.planYear + 543} {item.sampleSetName}<br />รหัสตัวอย่าง: {round.results.map((result) => result.sampleCode).filter(Boolean).join(', ') || '-'}</td><td className="mark"><Tick show={round.summaryOutcome === 'pass'} /></td><td className="mark"><Tick show={round.summaryOutcome === 'fail'} /></td><td>{round.summaryNote ?? '-'}</td></tr>)}</tbody></table>
    <EqaApprovalGrid roles={['technical-manager', 'quality-manager', 'section-head', 'department-head']} approvals={summary.approvals} />
    <style>{`
      .summary-header{text-align:center}.summary-header h1{margin:0;font-size:22px}.summary-header h2{margin:5px 0 18px;font-size:21px}.summary-meta{display:grid;grid-template-columns:1.7fr 1fr;gap:7px 24px;font-size:18px}.summary-meta .wide{grid-column:1/-1}.criteria{margin-top:18px;font-size:17px;white-space:pre-wrap}.criteria p{margin:3px 0}.summary-table{width:100%;table-layout:fixed;margin-top:18px;font-size:16px}.summary-table th,.summary-table td{border:1px solid #111;padding:5px;text-align:center;vertical-align:middle}.summary-table th{font-weight:700}.summary-table td{height:78px}.summary-table .left{text-align:left}.summary-table .seq{width:48px}.summary-table .round{width:250px}.summary-table .result-col{width:65px}.summary-table .remark{width:245px}.summary-table .mark{font-size:24px;font-weight:700}.css-tick{display:inline-block;width:10px;height:18px;border-right:3px solid #111;border-bottom:3px solid #111;transform:rotate(42deg)}
    `}</style>
  </EqaReportFrame>
}
