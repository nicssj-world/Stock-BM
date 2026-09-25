import { requireStockOperator } from '@/lib/server/auth'
import { getAnnualRevision, getRevisionSignatures } from '@/lib/server/vendor-evaluation'
import { HttpError } from '@/lib/server/errors'
import { generateVendorAnnualEvaluationPdf } from '@/lib/vendors/annual-pdf'

export const runtime = 'nodejs'

const noStore = { 'Cache-Control': 'private, no-store' }
const fail = (message: string, status: number) => new Response(message, { status, headers: { ...noStore, 'Content-Type': 'text/plain; charset=utf-8' } })

// Official annual report as PDF (LABCBH-Stock route parity: 401 / 403 / 404 / 409 / 422). Stock Staff and Admin can download; Assistant cannot.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string; revisionId: string }> }) {
  const { id, revisionId } = await params
  try {
    await requireStockOperator()
  } catch (error) {
    if (error instanceof HttpError) return fail(error.message, error.status)
    throw error
  }
  let revision
  try {
    revision = await getAnnualRevision(revisionId)
  } catch (error) {
    if (error instanceof HttpError) return fail('ไม่พบรายงานประเมิน', error.status === 404 ? 404 : 500)
    throw error
  }
  if (revision.vendorId !== id) return fail('ไม่พบรายงานประเมิน', 404)
  if (revision.status !== 'final' || !revision.frozen || !revision.reportNumber || !revision.finalizedAt) return fail('ดาวน์โหลด PDF ได้เฉพาะรายงานที่สิ้นสุดและตรึงข้อมูลแล้ว', 409)
  if (revision.policyStatus !== 'approved') return fail('รายงานอย่างเป็นทางการต้องใช้นโยบายที่อนุมัติแล้ว', 422)
  try {
    const signatures = await getRevisionSignatures(revisionId)
    const pdf = await generateVendorAnnualEvaluationPdf({
      status: revision.status, frozen: revision.frozen, reportNumber: revision.reportNumber, finalizedAt: revision.finalizedAt, revisionNumber: revision.revisionNumber,
      policyApproved: true, evaluatorSignature: signatures.evaluator, reviewerSignature: signatures.reviewer, approverSignature: signatures.approver,
    })
    const filename = `รายงานประเมินผู้ขาย-${revision.reportNumber}-R${revision.revisionNumber}.pdf`
    return new Response(Buffer.from(pdf), { status: 200, headers: {
      ...noStore, 'Content-Type': 'application/pdf', 'Content-Length': String(pdf.byteLength),
      'Content-Disposition': `inline; filename="vendor-evaluation-${revision.reportNumber}-R${revision.revisionNumber}.pdf"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    } })
  } catch (cause) {
    console.error('vendor evaluation pdf failed', cause instanceof Error ? cause.message : cause)
    return fail('สร้าง PDF ไม่สำเร็จ', 422)
  }
}
