import { PDFDocument } from 'pdf-lib'
import { describe, expect, it } from 'vitest'
import { generateVendorAnnualEvaluationPdf, type AnnualPdfRevision } from './annual-pdf'
import { finalizeReadiness, isOfficial, policyProposalError, VENDOR_EVALUATION_CRITERIA, type Frozen, type PolicyProposalInput } from './evaluation'
import { fiscalYearBE } from './fiscal-year'
import { ISSUE_TYPE_LABELS, VENDOR_ISSUE_TYPES } from './issues'

// 1x1 transparent PNG: a valid image for the three signature slots.
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

function frozen(overrides: { summary?: string; issues?: number; receipts?: number } = {}): Frozen {
  const receipts = Array.from({ length: overrides.receipts ?? 3 }, (_, i) => ({ eventNumber: `RC-2569-${String(i + 1).padStart(4, '0')}`, receivedDate: '2026-09-25', invoiceNumber: `INV-${i + 1}`, poNumber: null, assessmentState: 'completed' as const }))
  const assessments = receipts.map((r) => ({ eventNumber: r.eventNumber, receivedDate: r.receivedDate, invoiceNumber: r.invoiceNumber, productCondition: 'normal' as const, documentation: 'complete' as const, itemCorrectness: 'correct' as const, coldChainApplicable: false, coldChainCondition: null, hasComplaint: false, acceptanceDecision: 'accepted' as const, note: null, reasons: [], otherReasonDetail: null }))
  const issues = Array.from({ length: overrides.issues ?? 1 }, (_, i) => ({ id: `i${i}`, issueType: 'quantity_discrepancy', sourceKind: 'manual', status: 'open', openedAt: '2026-09-25T03:00:00Z', description: 'x', resolutionAction: null, resolutionNote: null, resolvedAt: null, invoiceNumber: 'INV-1', eventNumber: 'RC-2569-0001' }))
  const criteria = VENDOR_EVALUATION_CRITERIA.map((code, i) => ({ criterionCode: code, displayOrder: i + 1, numerator: 1, denominator: 1, applicable: true, percentage: 100, label: code, weight: 12.5, effectiveWeight: 12.5, weightedScore: 12.5, evidenceDefinition: 'หลักฐาน', calculationDefinition: 'คำนวณ', naDefinition: 'N/A' }))
  const signatory = { id: 'u1', name: 'ผู้ทดสอบ', position: 'หัวหน้ากลุ่มงาน' }
  return {
    evidence: {
      vendor: { id: 'v1', vendorCode: 'V-0001', name: 'ผู้ขายทดสอบ', legalName: null, taxId: null, taxBranchCode: '00000', address: null }, fiscalYear: 2569,
      coverage: { startDate: '2025-10-01', endDate: '2026-09-30', assessmentRequiredFrom: '2026-09-25', completed: receipts.length, pending: 0, percentage: 100 },
      activity: { invoices: 3, receipts: receipts.length, completedAssessments: receipts.length, pendingAssessments: 0, openIssues: issues.length, resolvedIssues: 0 },
      criteria, issues, receipts, assessments, capturedAt: '2026-09-25T00:00:00Z',
    },
    criteria, score: 100, result: 'pass',
    policy: { id: 'p1', version: 'VE-POLICY-V1', passThreshold: 80, minimumCoveragePercent: 70, approvedAt: '2026-09-25T00:00:00Z', approvedByName: 'ผู้อนุมัติ' },
    judgment: { summary: overrides.summary ?? 'สรุปผล', strengths: 'ส่งตรงเวลา', risksConcerns: 'ไม่มี', recommendations: 'ติดตามต่อ' },
    signatories: { evaluator: signatory, reviewer: signatory, approver: signatory }, reportNumber: 'VE-2569-0001', revision: 1, finalizedAt: '2026-09-25T00:00:00Z',
  }
}

const pdfInput = (f: Frozen, over: Partial<AnnualPdfRevision> = {}): AnnualPdfRevision => ({
  status: 'final', frozen: f, reportNumber: 'VE-2569-0001', finalizedAt: '2026-09-25T00:00:00Z', revisionNumber: 1, policyApproved: true,
  evaluatorSignature: PNG, reviewerSignature: PNG, approverSignature: PNG, ...over,
})
const pageCount = async (bytes: Uint8Array) => (await PDFDocument.load(bytes)).getPageCount()

describe('annual report PDF', () => {
  it('is the six standard pages for a normal report', async () => {
    const bytes = await generateVendorAnnualEvaluationPdf(pdfInput(frozen()))
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe('%PDF-')
    expect(await pageCount(bytes)).toBe(6)
  })

  it('continues onto more pages for long text and many receipts', async () => {
    const bytes = await generateVendorAnnualEvaluationPdf(pdfInput(frozen({ summary: 'ผู้ขายส่งของครบถ้วน '.repeat(400), issues: 40, receipts: 60 })))
    expect(await pageCount(bytes)).toBeGreaterThan(6)
  }, 30_000)

  it('refuses drafts, unapproved policy, mismatched references and missing signatures', async () => {
    await expect(generateVendorAnnualEvaluationPdf(pdfInput(frozen(), { status: 'draft' }))).rejects.toThrow(/เฉพาะรายงานที่สิ้นสุด/)
    await expect(generateVendorAnnualEvaluationPdf(pdfInput(frozen(), { policyApproved: false }))).rejects.toThrow(/นโยบายที่อนุมัติแล้ว/)
    await expect(generateVendorAnnualEvaluationPdf(pdfInput(frozen(), { reportNumber: 'VE-2569-0002' }))).rejects.toThrow(/ไม่ตรงกับ revision/)
    await expect(generateVendorAnnualEvaluationPdf(pdfInput(frozen(), { reviewerSignature: null }))).rejects.toThrow(/ไม่พบลายเซ็น/)
  })

  it('carries the LABCBH section titles, with the assessment result wording', async () => {
    const source = (await import('node:fs')).readFileSync('lib/vendors/annual-pdf.ts', 'utf8')
    expect(source).toContain('5. ผลการประเมินและข้อเสนอแนะ / Annual Evaluation Result & Recommendation')
    expect(source).not.toContain('วินิจฉัย')
  })
})

describe('vendor evaluation helpers', () => {
  it('turns the Buddhist-era fiscal year over on 1 October', () => {
    expect(fiscalYearBE('2026-09-30')).toBe(2569)
    expect(fiscalYearBE('2026-10-01')).toBe(2570)
    expect(fiscalYearBE('2027-01-15')).toBe(2570)
  })

  const proposal = (): PolicyProposalInput => ({
    policyId: null, version: 'QP-1', effectiveFromFiscalYear: 2569, effectiveToFiscalYear: null, passThreshold: 80, minimumCoveragePercent: 70, coverageStartDate: '2025-10-01', note: '',
    criteria: VENDOR_EVALUATION_CRITERIA.map((criterionCode, i) => ({ criterionCode, weight: i === 0 ? 30 : 10 })),
  })

  it('validates a policy proposal like the database does', () => {
    expect(policyProposalError(proposal())).toBeNull()
    expect(policyProposalError({ ...proposal(), version: ' ' })).toMatch(/เวอร์ชัน/)
    expect(policyProposalError({ ...proposal(), effectiveFromFiscalYear: 2026 })).toMatch(/พ\.ศ\./)
    expect(policyProposalError({ ...proposal(), passThreshold: 101 })).toMatch(/เกณฑ์ผ่าน/)
    expect(policyProposalError({ ...proposal(), criteria: proposal().criteria.slice(1) })).toMatch(/ให้ครบ/)
    expect(policyProposalError({ ...proposal(), criteria: proposal().criteria.map((c) => ({ ...c, weight: 10 })) })).toMatch(/เท่ากับ 100/)
  })

  it('shows a score only for a final report on an approved policy with a number', () => {
    const base = { status: 'final' as const, policyStatus: 'approved' as const, frozen: frozen(), reportNumber: 'VE-2569-0001' }
    expect(isOfficial(base)).toBe(true)
    expect(isOfficial({ ...base, status: 'draft' })).toBe(false)
    expect(isOfficial({ ...base, policyStatus: 'proposed' })).toBe(false)
    expect(isOfficial({ ...base, frozen: null })).toBe(false)
    const ready = { summary: 'a', strengths: 'b', risksConcerns: 'c', recommendations: 'd', evaluatorId: '1', reviewerId: '2', approverId: '3' }
    expect(finalizeReadiness(ready, true)).toEqual([])
    // Annual narratives are optional (7ba5690): only policy approval and the three signers are required.
    expect(finalizeReadiness({ ...ready, strengths: null, evaluatorId: null }, false)).toHaveLength(2)
    expect(finalizeReadiness({ ...ready, summary: null, strengths: null, risksConcerns: null, recommendations: null }, true)).toEqual([])
  })

  it('labels every issue type', () => {
    for (const type of VENDOR_ISSUE_TYPES) expect(ISSUE_TYPE_LABELS[type]).toBeTruthy()
  })
})
