import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { requireFullPageActor } from '@/lib/server/auth'
import { getEqaWorkspace } from '@/lib/server/eqa'
import { EQA_DOCUMENT_CODES } from '@/lib/eqa/types'
import { EqaApprovalGrid, EqaReportFrame } from '@/components/eqa-report-frame'

export async function generateMetadata({ params }: { params: Promise<{ roundId: string }> }): Promise<Metadata> {
  return { title: `EQA-Round-${(await params).roundId}-Fm-QP-LAB-19-02` }
}
function date(value: string | null) { return value ? new Intl.DateTimeFormat('th-TH-u-ca-buddhist', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Bangkok' }).format(new Date(`${value}T00:00:00+07:00`)) : '' }
function approvalDate(value: string | undefined) { return value ? new Intl.DateTimeFormat('th-TH-u-ca-buddhist', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Bangkok' }).format(new Date(value)) : '' }
function Box({ checked }: { checked: boolean }) { return <span className={`choice-box ${checked ? 'checked' : ''}`} aria-hidden="true" /> }

export default async function EqaRoundReceiptReportPage({ params }: { params: Promise<{ roundId: string }> }) {
  const actor = await requireFullPageActor(); const workspace = await getEqaWorkspace(actor)
  const { roundId } = await params
  const round = workspace.rounds.find((item) => item.id === roundId); if (!round) notFound()
  const summary = round.planItemId ? workspace.annualSummaries.find((item) => item.planItem.id === round.planItemId) : null
  const sampleSet = summary?.planItem.sampleSetName ?? round.planItemName ?? round.schemeName
  const analystApproval = round.approvals.find((item) => item.approvalRole === 'analyst')
  const managerApproval = round.approvals.find((item) => item.approvalRole === 'technical-manager')
  return <EqaReportFrame backHref="/eqa" code={EQA_DOCUMENT_CODES['round-receipt']} orientation="portrait" draft={round.documentState.status !== 'approved'}>
    <h1 className="receipt-title">แบบบันทึกการดำเนินการทดสอบตัวอย่างโครงการ EQAS/PT/Interlaboratory comparison</h1>
    <table className="receipt-table"><tbody>
      <tr><th>ชื่อชุดตัวอย่างทดสอบ</th><td colSpan={3}>{sampleSet}</td></tr><tr><th>ชื่อองค์กรภายนอกที่ส่งตัวอย่าง</th><td colSpan={3}>{round.providerName}</td></tr><tr><th>วันที่ส่งตัวอย่างจากองค์กรภายนอก</th><td colSpan={3}>{date(round.externalSentDate)}</td></tr><tr><th>วันที่รับตัวอย่าง</th><td colSpan={3}>{date(round.sampleReceivedDate)}</td></tr>
      <tr><th>สภาพความเรียบร้อยของ<br />ห่อตัวอย่างที่ได้รับ</th><td><Box checked={round.packageCondition === 'acceptable'} /> เรียบร้อย</td><td colSpan={2}><Box checked={round.packageCondition === 'unacceptable'} /> ไม่เรียบร้อย ระบุ {round.packageNote ?? '........................................'}</td></tr>
      <tr><th>อุณหภูมิของตัวอย่างที่ได้รับ</th><td><Box checked={round.receivedTemperature === 'refrigerated'} /> แช่เย็น</td><td><Box checked={round.receivedTemperature === 'room'} /> อุณหภูมิห้อง</td><td><Box checked={round.receivedTemperature === 'other'} /> อื่นๆ {round.receivedTemperatureNote ?? '........................'}</td></tr>
      <tr><th>สภาพของตัวอย่าง</th><td><Box checked={round.sampleCondition === 'acceptable'} /> เรียบร้อย</td><td colSpan={2}><Box checked={round.sampleCondition === 'unacceptable'} /> ไม่เรียบร้อย ระบุ {round.sampleConditionNote ?? '........................................'}</td></tr>
      <tr><th>ระบุการเก็บตัวอย่าง</th><td colSpan={2}><Box checked={round.storageCondition === 'refrigerated'} /> แช่เย็นที่อุณหภูมิ {round.storageTemperatureC ?? '.......'} °C</td><td><Box checked={round.storageCondition === 'room'} /> เก็บที่อุณหภูมิห้อง {round.storageCondition === 'other' ? round.storageNote : ''}</td></tr>
      <tr><th>ชนิดของตัวอย่าง</th><td colSpan={3}>{round.specimenType ?? ''}</td></tr><tr><th>รหัสตัวอย่าง</th><td colSpan={3}>{round.results.map((result) => result.sampleCode).filter(Boolean).join(', ')}</td></tr><tr><th>ผู้บันทึกการรับตัวอย่าง</th><td colSpan={3}>{round.receiverName ?? ''}</td></tr><tr><th>ผู้ทำการตรวจวิเคราะห์</th><td colSpan={3}>{round.analystName ?? ''}</td></tr><tr><th>วันที่ตรวจวิเคราะห์</th><td colSpan={3}>{date(round.analysisDate)}</td></tr><tr><th>วันที่ส่งผลการตรวจวิเคราะห์</th><td colSpan={3}>{date(round.submissionDate)}</td></tr><tr><th>วิธีส่งผลการตรวจวิเคราะห์</th><td colSpan={3}>{round.submissionMethod ?? ''}</td></tr><tr className="details"><th>รายละเอียดอื่นๆ (ถ้ามี)</th><td colSpan={3}>{round.otherDetails ?? '-'}</td></tr>
    </tbody></table>
    <section className="analyst-review"><h2>บันทึกการตรวจสอบโดยผู้ทำการตรวจวิเคราะห์</h2><div className="review-grid"><div className="result-lines">{round.results.map((result) => <p key={result.id}>{result.sampleCode ?? result.analyte}&nbsp;&nbsp;-&nbsp;&nbsp;{result.submittedValue ?? '-'} {result.unit ?? ''}{result.ctValue == null ? '' : `  - Ct ${result.ctValue}`}</p>)}{!round.results.length ? <p>&nbsp;</p> : null}</div><div className="review-sign"><div className="mini-line">{analystApproval?.approvedByName ?? ''}</div><p>({round.analystName ?? 'ผู้ทำการตรวจวิเคราะห์'})</p><p>วันที่ {approvalDate(analystApproval?.approvedAt) || '........................'}</p></div></div></section>
    <section className="manager-review"><h2>การตรวจสอบและทบทวนโดยผู้จัดการวิชาการ</h2><div className="review-grid"><div className="reviewed-text">{managerApproval ? 'ตรวจสอบแล้ว' : ''}</div><div className="review-sign"><div className="mini-line">{managerApproval?.approvedByName ?? ''}</div><p>(ผู้จัดการวิชาการ)</p><p>วันที่ {approvalDate(managerApproval?.approvedAt) || '........................'}</p></div></div></section>
    <EqaApprovalGrid roles={['analyst', 'technical-manager']} approvals={round.approvals} />
    <style>{`
      .receipt-title{margin:0 0 10px;text-align:center;font-size:23px}.receipt-table{width:100%;table-layout:fixed;font-size:18px}.receipt-table th,.receipt-table td{border:1px solid #111;padding:5px 7px;vertical-align:middle}.receipt-table th{width:33%;text-align:center;font-weight:700}.receipt-table td{height:34px}.receipt-table .details td,.receipt-table .details th{height:65px}.choice-box{position:relative;display:inline-block;width:15px;height:15px;margin:0 5px 0 0;border:1.4px solid #111;vertical-align:-1px}.choice-box.checked:after{content:"";position:absolute;left:3px;top:-1px;width:6px;height:11px;border-right:2px solid #111;border-bottom:2px solid #111;transform:rotate(42deg)}.analyst-review,.manager-review{border:1px solid #111;border-top:0}.analyst-review h2,.manager-review h2{margin:0;padding:4px 6px;font-size:19px}.review-grid{display:grid;grid-template-columns:2fr 1fr;min-height:120px}.result-lines,.reviewed-text{padding:8px 20px;text-align:center}.result-lines p{margin:6px}.review-sign{display:flex;flex-direction:column;justify-content:center;border-left:1px solid #111;padding:10px;text-align:center}.review-sign p{margin:4px}.mini-line{min-height:27px;border-bottom:1px dotted #111}.manager-review .review-grid{min-height:105px}.reviewed-text{display:flex;align-items:center;justify-content:center;font-size:20px}.receipt-table+.analyst-review{margin-top:0}.eqa-report-page .approval-grid{display:none}
    `}</style>
  </EqaReportFrame>
}
