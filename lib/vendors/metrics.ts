import { deliveryClosureMetric, deliveryLeadTimeDays } from '@/lib/receiving/rules'

export type VendorMetricKey =
  | 'complete_delivery'
  | 'shelf_life_compliance'
  | 'product_condition'
  | 'documentation_compliance'
  | 'item_correctness'
  | 'cold_chain_condition'
  | 'assessment_complaints'
  | 'documentation_discrepancies'
  | 'complaint_resolution'

export type MetricExcluded = { reason: string; count: number }

/** A row that a metric counted; `flagged` marks the non-conforming ones for drill-down. */
export type MetricSource = {
  kind: 'invoice_line' | 'receipt_line' | 'assessment' | 'issue'
  id: string
  receiptId: string | null
  flagged: boolean
}

export type VendorMetric = {
  key: VendorMetricKey
  numerator: number
  denominator: number | null
  applicablePopulation: string
  excluded: MetricExcluded[]
  percent: number | null
  provisional: boolean
  display: 'ratio' | 'count'
  sources: MetricSource[]
}

export type DeliveryLeadTime = {
  sampleSize: number
  meanDays: number | null
  medianDays: number | null
  informational: true
  label: 'ข้อมูลประกอบ ไม่ใช้คิดคะแนน'
}

/** Received vs expected quantity, read from receipts. Informational only: open lines never enter a ratio. */
export type QuantityVsExpected = {
  linesWithExpected: number
  reachedExpected: number
  partiallyReceived: number
  notYetReceived: number
  overExpected: number
  informational: true
  label: 'ข้อมูลประกอบจากจำนวนรับจริง — ไม่ใช่ Complete Delivery'
  sources: MetricSource[]
}

export type AssessmentEvidence = {
  id: string
  receiptId: string
  status: 'pending' | 'completed'
  productCondition: 'normal' | 'abnormal' | null
  documentation: 'complete' | 'incomplete' | null
  itemCorrectness: 'correct' | 'problem' | null
  coldChainApplicable: boolean | null
  coldChainCondition: 'appropriate' | 'inappropriate' | null
  hasComplaint: boolean | null
}

export type VendorMetricsInput = {
  completeDelivery: Array<{ id?: string; closureState: 'open' | 'complete' | 'short_closed' | 'cancelled' }>
  shelfLife: Array<{ id?: string; receiptId?: string | null; compliance: 'compliant' | 'not_compliant' | 'not_applicable' }>
  assessments: AssessmentEvidence[]
  quantityLines?: Array<{ id: string; expectedQty: number; receivedQty: number }>
  issues: Array<{
    id?: string
    receiptId?: string | null
    issueType: string
    resolutionStatus: 'open' | 'resolved' | 'cancelled'
    openedAt: string
  }>
  deliveryDates: Array<{ invoiceDate: string | null; receivedDate: string | null }>
  fiscalYear: string
  coldChainMappingApproved: boolean
  completeDeliveryPolicyApproved?: boolean
}

function ratioMetric(
  key: VendorMetricKey,
  numerator: number,
  denominator: number,
  applicablePopulation: string,
  sources: MetricSource[],
  excluded: MetricExcluded[] = [],
  provisional = false,
): VendorMetric {
  return {
    key,
    numerator,
    denominator,
    applicablePopulation,
    excluded: excluded.filter((item) => item.count > 0),
    percent: denominator ? (numerator / denominator) * 100 : null,
    provisional,
    display: 'ratio',
    sources,
  }
}

function countMetric(key: VendorMetricKey, count: number, applicablePopulation: string, sources: MetricSource[], excluded: MetricExcluded[] = []): VendorMetric {
  return {
    key,
    numerator: count,
    denominator: null,
    applicablePopulation,
    excluded: excluded.filter((item) => item.count > 0),
    percent: null,
    provisional: false,
    display: 'count',
    sources,
  }
}

function deliveryLeadTime(input: VendorMetricsInput['deliveryDates']): DeliveryLeadTime {
  const days = input
    .map((row) => deliveryLeadTimeDays(row.invoiceDate, row.receivedDate))
    .filter((value): value is number => value !== null && value >= 0)
    .sort((a, b) => a - b)
  const middle = Math.floor(days.length / 2)
  const medianDays = days.length ? (days.length % 2 ? days[middle] : (days[middle - 1] + days[middle]) / 2) : null
  return {
    sampleSize: days.length,
    meanDays: days.length ? days.reduce((sum, value) => sum + value, 0) / days.length : null,
    medianDays,
    informational: true,
    label: 'ข้อมูลประกอบ ไม่ใช้คิดคะแนน',
  }
}

function quantityVsExpected(lines: NonNullable<VendorMetricsInput['quantityLines']>): QuantityVsExpected {
  const withExpected = lines.filter((line) => line.expectedQty > 0)
  return {
    linesWithExpected: withExpected.length,
    reachedExpected: withExpected.filter((line) => line.receivedQty >= line.expectedQty).length,
    partiallyReceived: withExpected.filter((line) => line.receivedQty > 0 && line.receivedQty < line.expectedQty).length,
    notYetReceived: withExpected.filter((line) => line.receivedQty <= 0).length,
    overExpected: withExpected.filter((line) => line.receivedQty > line.expectedQty).length,
    informational: true,
    label: 'ข้อมูลประกอบจากจำนวนรับจริง — ไม่ใช่ Complete Delivery',
    sources: withExpected.map((line) => ({ kind: 'invoice_line', id: line.id, receiptId: null, flagged: line.receivedQty < line.expectedQty })),
  }
}

function assessmentSource(row: AssessmentEvidence, flagged: boolean): MetricSource {
  return { kind: 'assessment', id: row.id, receiptId: row.receiptId, flagged }
}

export function buildVendorMetrics(input: VendorMetricsInput) {
  const complete = deliveryClosureMetric(input.completeDelivery)
  const shelfApplicable = input.shelfLife.filter((row) => row.compliance !== 'not_applicable')
  const shelfCompliant = shelfApplicable.filter((row) => row.compliance === 'compliant').length
  const completed = input.assessments.filter((row) => row.status === 'completed')
  const pendingCount = input.assessments.length - completed.length
  const pendingExcluded = { reason: 'assessment_pending', count: pendingCount }
  const coldChainRows = completed.filter((row) => row.coldChainApplicable === true)
  const productNormal = completed.filter((row) => row.productCondition === 'normal').length
  const documentsComplete = completed.filter((row) => row.documentation === 'complete').length
  const itemsCorrect = completed.filter((row) => row.itemCorrectness === 'correct').length
  const coldChainAppropriate = coldChainRows.filter((row) => row.coldChainCondition === 'appropriate').length
  const assessmentComplaints = completed.filter((row) => row.hasComplaint === true)
  const fiscalIssues = input.issues.filter((row) => row.openedAt.slice(0, 10) >= `${Number(input.fiscalYear) - 1}-10-01` && row.openedAt.slice(0, 10) <= `${input.fiscalYear}-09-30`)
  const documentationIssues = fiscalIssues.filter((row) => row.issueType === 'documentation_discrepancy')
  const complaints = fiscalIssues.filter((row) => row.issueType === 'complaint')
  const resolvedComplaints = complaints.filter((row) => row.resolutionStatus === 'resolved').length
  const issueSource = (row: VendorMetricsInput['issues'][number], flagged: boolean): MetricSource => ({ kind: 'issue', id: row.id ?? '', receiptId: row.receiptId ?? null, flagged })

  return {
    fiscalYear: input.fiscalYear,
    metrics: {
      completeDelivery: ratioMetric(
        'complete_delivery', complete.numerator, complete.denominator, 'ใบรายการที่ complete + short_closed (P-06/P-09)',
        input.completeDelivery.filter((row) => row.closureState === 'complete' || row.closureState === 'short_closed').map((row) => ({ kind: 'invoice_line', id: row.id ?? '', receiptId: null, flagged: row.closureState === 'short_closed' })),
        complete.excluded, input.completeDeliveryPolicyApproved !== true,
      ),
      shelfLifeCompliance: ratioMetric(
        'shelf_life_compliance', shelfCompliant, shelfApplicable.length, 'รายการรับเข้าที่มีการตรวจอายุคงเหลือ',
        shelfApplicable.map((row) => ({ kind: 'receipt_line', id: row.id ?? '', receiptId: row.receiptId ?? null, flagged: row.compliance === 'not_compliant' })),
      ),
      productCondition: ratioMetric(
        'product_condition', productNormal, completed.length, 'Receipt Assessment ที่ประเมินแล้ว',
        completed.map((row) => assessmentSource(row, row.productCondition === 'abnormal')), [pendingExcluded],
      ),
      documentationCompliance: ratioMetric(
        'documentation_compliance', documentsComplete, completed.length, 'Receipt Assessment ที่ประเมินแล้ว',
        completed.map((row) => assessmentSource(row, row.documentation === 'incomplete')), [pendingExcluded],
      ),
      itemCorrectness: ratioMetric(
        'item_correctness', itemsCorrect, completed.length, 'Receipt Assessment ที่ประเมินแล้ว',
        completed.map((row) => assessmentSource(row, row.itemCorrectness === 'problem')), [pendingExcluded],
      ),
      coldChainCondition: ratioMetric(
        'cold_chain_condition', coldChainAppropriate, coldChainRows.length, 'Receipt Assessment ที่ระบุว่าเกี่ยวข้องกับ cold chain',
        coldChainRows.map((row) => assessmentSource(row, row.coldChainCondition === 'inappropriate')),
        [{ reason: 'cold_chain_not_applicable', count: completed.length - coldChainRows.length }, pendingExcluded],
        !input.coldChainMappingApproved,
      ),
      assessmentComplaints: countMetric(
        'assessment_complaints', assessmentComplaints.length, 'Receipt Assessment ที่ตอบว่า “มีปัญหา/ข้อร้องเรียน”',
        assessmentComplaints.map((row) => assessmentSource(row, true)), [pendingExcluded],
      ),
      documentationDiscrepancies: countMetric(
        'documentation_discrepancies', documentationIssues.length, 'documentation discrepancy issue ที่เปิดในปีงบประมาณ',
        documentationIssues.map((row) => issueSource(row, true)),
      ),
      complaintResolution: ratioMetric(
        'complaint_resolution', resolvedComplaints, complaints.length, 'complaint issue ที่เปิดในปีงบประมาณ',
        complaints.map((row) => issueSource(row, row.resolutionStatus !== 'resolved')),
      ),
    },
    quantityVsExpected: quantityVsExpected(input.quantityLines ?? []),
    deliveryLeadTime: deliveryLeadTime(input.deliveryDates),
    source: {
      completeDeliveryLines: input.completeDelivery.length,
      shelfLifeLines: input.shelfLife.length,
      assessmentsCompleted: completed.length,
      assessmentsPending: pendingCount,
      issuesInFiscalYear: fiscalIssues.length,
      coldChainMappingApproved: input.coldChainMappingApproved,
    },
  }
}
