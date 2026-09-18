/* eslint-disable @next/next/no-img-element -- signed attachment URLs must remain direct for browser print output. */
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PrintButton } from '@/components/print-button'
import { formatQuantity } from '@/lib/bm/rules'
import { formatThaiDate, formatThaiDateTime } from '@/lib/bm/thai-date'
import { deliveryCompleteness, cumulativeReceived } from '@/lib/receiving/rules'
import { requireFullPageActor } from '@/lib/server/auth'
import { listAttachments, signedUrl, type AttachmentRecord } from '@/lib/server/attachments'
import { HttpError } from '@/lib/server/errors'
import { getReceivingWorkspace } from '@/lib/server/receiving'
import type { ReceiptLine, ReceivingWorkspace } from '@/lib/receiving/types'
import { ASSESSMENT_LABELS, hasAbnormalAnswer, type ReceiptAssessment } from '@/lib/receiving/assessment'

type PrintableAttachment = AttachmentRecord & { url: string | null }

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  return { title: `Stock-Receipt-${(await params).id}-Report` }
}

async function loadWorkspace(actor: Awaited<ReturnType<typeof requireFullPageActor>>) {
  try {
    return await getReceivingWorkspace(actor)
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) notFound()
    throw error
  }
}

async function printableAttachments(items: AttachmentRecord[]): Promise<PrintableAttachment[]> {
  return Promise.all(items.map(async (item) => {
    try {
      return { ...item, url: await signedUrl(item.id) }
    } catch {
      return { ...item, url: null }
    }
  }))
}

function statusLabel(status: string) {
  if (status === 'confirmed') return 'ยืนยันแล้ว'
  if (status === 'cancelled') return 'ยกเลิก'
  return 'ร่าง'
}

function torLabel(value: ReceiptLine['torExpiryCompliance']) {
  if (value === 'compliant') return 'ผ่านเกณฑ์ TOR'
  if (value === 'not_compliant') return 'ไม่ผ่าน TOR'
  return 'ไม่เกี่ยวข้อง'
}

function reasonLabel(line: ReceiptLine) {
  if (line.torExpiryCompliance !== 'not_compliant') return '-'
  const labels: Record<string, string> = {
    urgent_need: 'จำเป็นเร่งด่วน',
    consume_before_expiry: 'ใช้หมดก่อนหมดอายุ',
    no_alternative: 'ไม่มีสินค้าทดแทน',
    approved_by_authority: 'ได้รับอนุมัติ',
    other: 'อื่น ๆ',
  }
  return [labels[line.acceptanceReasonCode ?? ''] ?? line.acceptanceReasonCode ?? 'ไม่ระบุ', line.acceptanceReasonNote].filter(Boolean).join(' · ')
}

function itemLabel(workspace: ReceivingWorkspace, line: ReceiptLine) {
  const item = workspace.items.find((candidate) => candidate.id === line.stockItemId)
  return item ? `${item.itemCode} · ${item.name}` : line.stockItemId
}

function locationLabel(workspace: ReceivingWorkspace, line: ReceiptLine) {
  const location = workspace.locations.find((candidate) => candidate.id === line.locationId)
  return location ? `${location.code} · ${location.name}` : line.locationId
}

function assessmentAnswer(assessment: ReceiptAssessment, key: 'productCondition' | 'documentation' | 'itemCorrectness' | 'coldChainCondition') {
  const value = assessment[key]
  if (!value) return '-'
  return (ASSESSMENT_LABELS[key].options as Record<string, string>)[value] ?? value
}

function AssessmentBlock({ assessment }: { assessment: ReceiptAssessment | undefined }) {
  if (!assessment) return <section className="evidence-block"><h2>การประเมินการรับสินค้า / Receipt Assessment</h2><p className="muted">ยังไม่มีการประเมิน (ใบรับเข้ายังไม่ยืนยัน)</p></section>
  if (assessment.status === 'pending') return <section className="evidence-block"><h2>การประเมินการรับสินค้า / Receipt Assessment</h2><p className="muted">สถานะ: รอประเมิน (Pending)</p></section>
  const L = ASSESSMENT_LABELS
  return <section className="evidence-block"><h2>การประเมินการรับสินค้า / Receipt Assessment</h2><table className="assessment-table"><tbody>
    <tr><th>{L.productCondition.title}</th><td>{assessmentAnswer(assessment, 'productCondition')}</td></tr>
    <tr><th>{L.documentation.title}</th><td>{assessmentAnswer(assessment, 'documentation')}</td></tr>
    <tr><th>{L.itemCorrectness.title}</th><td>{assessmentAnswer(assessment, 'itemCorrectness')}</td></tr>
    <tr><th>{L.coldChainApplicable.title}</th><td>{assessment.coldChainApplicable ? L.coldChainApplicable.options.true : L.coldChainApplicable.options.false}{assessment.coldChainApplicable ? ` · ${L.coldChainCondition.title}: ${assessmentAnswer(assessment, 'coldChainCondition')}` : ''}</td></tr>
    <tr><th>{L.hasComplaint.title}</th><td>{assessment.hasComplaint ? L.hasComplaint.options.true : L.hasComplaint.options.false}</td></tr>
    <tr><th>{L.note.title}</th><td>{assessment.note ?? '-'}</td></tr>
  </tbody></table><p className="muted">ประเมินเมื่อ {assessment.assessedAt ? formatThaiDateTime(assessment.assessedAt) : '-'}{hasAbnormalAnswer(assessment) ? ' · มีรายการผิดปกติ' : ' · ปกติทุกข้อ'} · จำนวนรับดูจากตารางรายการด้านบน</p></section>
}

function AttachmentBlock({ title, items }: { title: string; items: PrintableAttachment[] }) {
  if (!items.length) return null
  return <section className="evidence-block"><h2>{title}</h2><ul>{items.map((item) => <li key={item.id}>{item.url ? <a href={item.url}>{item.fileName}</a> : item.fileName}{item.sizeBytes ? ` · ${Math.ceil(item.sizeBytes / 1024)} KB` : ''}</li>)}</ul><div className="evidence-images">{items.filter((item) => item.url && item.contentType?.startsWith('image/')).map((item) => <figure key={item.id}><img src={item.url ?? ''} alt={item.fileName} /><figcaption>{item.fileName}</figcaption></figure>)}</div></section>
}

export default async function ReceivingReceiptReportPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireFullPageActor()
  const workspace = await loadWorkspace(actor)
  const { id } = await params
  const receipt = workspace.receipts.find((candidate) => candidate.id === id)
  if (!receipt) notFound()
  const invoice = receipt.invoiceId ? workspace.invoices.find((candidate) => candidate.id === receipt.invoiceId) : null
  const vendor = workspace.vendors.find((candidate) => candidate.id === receipt.vendorId)
  const allReceiptAttachments = await printableAttachments(await listAttachments('stock', 'stock-receipt', receipt.id))
  const invoiceImages = allReceiptAttachments.filter((item) => item.kind === 'invoice-image')
  const receiptAttachments = allReceiptAttachments.filter((item) => item.kind !== 'invoice-image')
  const assessment = workspace.assessments.find((item) => item.receiptId === receipt.id)
  const lineAttachmentEntries = await Promise.all(receipt.lines.map(async (line) => [line.id, await printableAttachments(await listAttachments('stock', 'stock-receipt-line', line.id))] as const))
  const lineAttachments = new Map(lineAttachmentEntries)
  const confirmedLinkedLines = workspace.receipts.filter((candidate) => candidate.status === 'confirmed').flatMap((candidate) => candidate.lines)

  return <main className="receiving-report-page"><div className="toolbar print-hidden"><Link href="/receiving" className="back-link">กลับ Receiving</Link><PrintButton /></div><section className="sheet"><header className="report-header"><div><p className="eyebrow">MOLECULAR-CBH QMS · STOCK1</p><h1>ใบรับเข้าสินค้า</h1><p>กลุ่มงานเทคนิคการแพทย์ โรงพยาบาลชลบุรี</p></div><div className="report-code"><span>เลขที่ใบรับเข้า</span><strong>{receipt.receiptNo ?? receipt.id.slice(0, 8)}</strong><small>{statusLabel(receipt.status)}</small></div></header>
    <section className="meta-grid"><div><dt>Vendor</dt><dd>{vendor ? `${vendor.code} · ${vendor.name}` : receipt.vendorId}</dd></div><div><dt>Invoice / ใบส่งของ</dt><dd>{invoice?.invoiceNo ?? (invoice ? invoice.id.slice(0, 8) : '-')}</dd></div><div><dt>วันที่รับเข้า</dt><dd>{formatThaiDate(receipt.receivedDate)}</dd></div><div><dt>วันเวลาบันทึก</dt><dd>{formatThaiDateTime(receipt.receivedAt)}</dd></div><div><dt>Receipt Assessment</dt><dd>{assessment ? (assessment.status === 'completed' ? 'ประเมินแล้ว' : 'รอประเมิน') : '-'}</dd></div><div><dt>รูปใบส่งของ</dt><dd>{invoiceImages.length ? `${invoiceImages.length} รูป` : 'ไม่มี'}</dd></div></section>
    {invoice ? <section className="expected-box"><div><p className="section-kicker">Expected receipt</p><h2>{invoice.invoiceNo ?? 'ใบส่งของไม่มีเลขที่'}</h2></div><div><p>รายการคาดหมาย</p><strong>{invoice.lines.length}</strong></div><div><p>สถานะใบส่งของ</p><strong>{statusLabel(invoice.status)}</strong></div></section> : null}
    <section className="section"><div className="section-heading"><p className="section-kicker">Receipt lines</p><h2>รายการรับเข้าและผลตรวจสอบ</h2></div><table className="receipt-table"><thead><tr><th>#</th><th>รายการ / Location</th><th>Lot / Expiry</th><th>Expected / Received</th><th>TOR / อายุคงเหลือ</th><th>เหตุผลยกเว้น</th><th>หลักฐาน</th></tr></thead><tbody>{receipt.lines.map((line) => { const invoiceLine = invoice?.lines.find((candidate) => candidate.id === line.invoiceLineId); const cumulative = line.invoiceLineId ? cumulativeReceived(confirmedLinkedLines.filter((candidate) => candidate.invoiceLineId === line.invoiceLineId).map((candidate) => ({ receivedQty: candidate.receivedQty }))) : null; const state = invoiceLine && cumulative != null ? deliveryCompleteness(invoiceLine.expectedQty, cumulative) : null; const attachments = lineAttachments.get(line.id) ?? []; return <tr key={line.id}><td>{line.lineNo}</td><td><b>{itemLabel(workspace, line)}</b><span>{locationLabel(workspace, line)}</span>{invoiceLine ? <small>Invoice line #{invoiceLine.lineNo} · {state === 'complete' ? 'ครบตามคาดหมาย' : 'ยังเปิดอยู่'}</small> : null}</td><td><b>{line.lotNumber ?? '-'}</b><span>หมดอายุ {formatThaiDate(line.expiryDate)}</span>{line.barcodeGtin || line.barcodeAdditionalProductId ? <small>{[line.barcodeGtin ? `GTIN ${line.barcodeGtin}` : null, line.barcodeAdditionalProductId ? `AI240 ${line.barcodeAdditionalProductId}` : null].filter(Boolean).join(' · ')}</small> : null}</td><td><b>{line.expectedQty == null ? (invoiceLine?.expectedQty == null ? '-' : formatQuantity(invoiceLine.expectedQty)) : formatQuantity(line.expectedQty)} / {formatQuantity(line.receivedQty)}</b>{cumulative != null ? <span>สะสม {formatQuantity(cumulative)}{invoiceLine ? ` / ${formatQuantity(invoiceLine.expectedQty)}` : ''}</span> : null}</td><td><b className={line.torExpiryCompliance === 'not_compliant' ? 'danger' : ''}>{torLabel(line.torExpiryCompliance)}</b><span>{line.remainingShelfLifeDays == null ? '-' : `${line.remainingShelfLifeDays} วัน`}</span></td><td>{reasonLabel(line)}</td><td>{attachments.length ? attachments.map((item) => <div key={item.id}>{item.fileName}</div>) : '-'}</td></tr> })}{!receipt.lines.length ? <tr><td colSpan={7} className="empty">ไม่มีรายการรับเข้า</td></tr> : null}</tbody></table></section>
    <AssessmentBlock assessment={assessment} />
    <AttachmentBlock title="รูปใบส่งของ / Invoice evidence" items={invoiceImages} />
    <AttachmentBlock title="หลักฐานใบรับเข้า / Receipt evidence" items={receiptAttachments} />
    {receipt.lines.map((line) => <AttachmentBlock key={line.id} title={`หลักฐานรายการ #${line.lineNo} / Line evidence`} items={lineAttachments.get(line.id) ?? []} />)}
    <footer className="report-footer"><span>พิมพ์เมื่อ {formatThaiDateTime(new Date())} · โดย {actor.displayName}</span><span>ระบบเขียน stock ผ่าน ledger เดิมเท่านั้น · เอกสารนี้ไม่เปลี่ยนแปลงรายการรับเข้า</span></footer>
  </section><style>{`@page{size:A4 portrait;margin:12mm}body{background:#e9eef0}.receiving-report-page{color:#173d50;font-family:"Noto Sans Thai",Arial,sans-serif}.toolbar{display:flex;justify-content:space-between;align-items:center;max-width:794px;margin:0 auto 12px}.back-link,#print-report{border:1px solid #b8c8cc;border-radius:7px;background:#fff;color:#173d50;padding:8px 12px;font-size:13px;font-weight:700;text-decoration:none}.sheet{width:794px;min-height:1123px;margin:0 auto;padding:28px 32px 36px;background:#fff;box-shadow:0 10px 40px rgba(20,64,72,.16);-webkit-print-color-adjust:exact;print-color-adjust:exact}.report-header{display:flex;justify-content:space-between;gap:24px;padding-bottom:16px;border-bottom:2px solid #173d50}.eyebrow,.section-kicker{margin:0;color:#0b7f76;font-size:10px;font-weight:800;letter-spacing:.14em;text-transform:uppercase}.report-header h1{margin:5px 0 2px;font-size:24px}.report-header p:not(.eyebrow){margin:0;color:#55727c;font-size:12px}.report-code{text-align:right}.report-code span,.report-code small{display:block;color:#789097;font-size:10px}.report-code strong{display:block;margin:4px 0;font-family:"IBM Plex Mono",monospace;font-size:16px}.meta-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:0;margin:16px 0;border:1px solid #d8e4e5;border-radius:7px;background:#f7fafa}.meta-grid div{padding:9px 12px;border-bottom:1px solid #e4edee}.meta-grid div:nth-child(odd){border-right:1px solid #e4edee}.meta-grid div:nth-last-child(-n+2){border-bottom:0}.meta-grid dt{color:#789097;font-size:9px;font-weight:700;letter-spacing:.08em}.meta-grid dd{margin:3px 0 0;font-size:12px;font-weight:700}.expected-box{display:grid;grid-template-columns:2fr 1fr 1fr;gap:12px;margin:0 0 18px;padding:12px 14px;border:1px solid #cfe1dc;border-radius:7px;background:#eff9f5}.expected-box h2{margin:3px 0 0;font-size:15px}.expected-box p{margin:0;color:#55727c;font-size:10px}.expected-box strong{display:block;margin-top:3px;font-size:15px}.section{margin-top:12px}.section-heading{display:flex;align-items:end;justify-content:space-between;gap:12px;margin-bottom:7px}.section-heading h2,.evidence-block h2{margin:3px 0 0;font-size:15px}.receipt-table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:10px}.receipt-table th,.receipt-table td{border:1px solid #cfdde0;padding:6px 5px;vertical-align:top}.receipt-table th{background:#eef4f4;color:#45636b;font-size:9px;text-align:left}.receipt-table th:first-child,.receipt-table td:first-child{width:25px;text-align:center}.receipt-table th:nth-child(2){width:22%}.receipt-table th:nth-child(3){width:16%}.receipt-table th:nth-child(4){width:17%}.receipt-table th:nth-child(5){width:15%}.receipt-table th:nth-child(6){width:17%}.receipt-table th:nth-child(7){width:14%}.receipt-table td b,.receipt-table td span,.receipt-table td small{display:block}.receipt-table td span,.receipt-table td small{margin-top:3px;color:#6b858c;font-size:9px;line-height:1.35}.receipt-table .danger{color:#b12e3b}.empty{text-align:center;color:#789097;padding:20px}.muted{margin:6px 0 0;color:#6b858c;font-size:10px}.assessment-table{width:100%;margin-top:6px;border-collapse:collapse;font-size:10px}.assessment-table th,.assessment-table td{border:1px solid #d8e4e5;padding:5px 7px;text-align:left;vertical-align:top}.assessment-table th{width:38%;background:#eef4f4;color:#45636b}.evidence-block{margin-top:16px;padding:10px 12px;border:1px solid #d8e4e5;border-radius:7px;background:#fbfdfd;break-inside:avoid}.evidence-block ul{margin:6px 0;padding-left:18px;font-size:10px}.evidence-block a{color:#0b7f76}.evidence-images{display:flex;flex-wrap:wrap;gap:10px;margin-top:8px}.evidence-images figure{width:46%;margin:0}.evidence-images img{display:block;max-width:100%;max-height:170px;margin:auto;object-fit:contain}.evidence-images figcaption{margin-top:3px;text-align:center;color:#789097;font-size:8px}.report-footer{display:flex;justify-content:space-between;gap:14px;margin-top:22px;padding-top:10px;border-top:1px solid #cfdde0;color:#789097;font-size:8px;line-height:1.5}@media(max-width:820px){.sheet{width:auto;min-height:0;margin:0;padding:18px}.report-header,.report-footer{flex-direction:column}.receipt-table{min-width:720px}.section{overflow-x:auto}}@media print{body{background:#fff}.print-hidden{display:none!important}.sheet{width:auto;min-height:0;margin:0;padding:0;box-shadow:none}.receipt-table{font-size:9px}.evidence-block{break-inside:avoid}.report-footer{position:fixed;bottom:0;left:0;right:0}}`}</style></main>
}
