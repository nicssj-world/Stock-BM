import { deliveryClosureMetric, deliveryLeadTimeDays } from '@/lib/receiving/rules'

export type VendorMetricKey =
  | 'complete_delivery'
  | 'shelf_life_compliance'
  | 'packaging_compliance'
  | 'temperature_compliance'
  | 'documentation_discrepancies'
  | 'complaint_resolution'

export type MetricExcluded = { reason: string; count: number }

export type VendorMetric = {
  key: VendorMetricKey
  numerator: number
  denominator: number | null
  applicablePopulation: string
  excluded: MetricExcluded[]
  percent: number | null
  provisional: boolean
  display: 'ratio' | 'count'
}

export type DeliveryLeadTime = {
  sampleSize: number
  meanDays: number | null
  medianDays: number | null
  informational: true
  label: 'ข้อมูลประกอบ ไม่ใช้คิดคะแนน'
}

export type VendorMetricsInput = {
  completeDelivery: Array<{ closureState: 'open' | 'complete' | 'short_closed' | 'cancelled' }>
  shelfLife: Array<{ compliance: 'compliant' | 'not_compliant' | 'not_applicable' }>
  receipts: Array<{
    status: 'draft' | 'confirmed' | 'cancelled'
    packagingStatus: 'acceptable' | 'damaged' | 'not_applicable' | null
    temperatureStatus: 'acceptable' | 'out_of_range' | 'not_applicable' | null
    coldChainApplicable: boolean
  }>
  issues: Array<{
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
  excluded: MetricExcluded[] = [],
  provisional = false,
): VendorMetric {
  return {
    key,
    numerator,
    denominator,
    applicablePopulation,
    excluded,
    percent: denominator ? (numerator / denominator) * 100 : null,
    provisional,
    display: 'ratio',
  }
}

function countMetric(key: VendorMetricKey, count: number, applicablePopulation: string): VendorMetric {
  return {
    key,
    numerator: count,
    denominator: null,
    applicablePopulation,
    excluded: [],
    percent: null,
    provisional: false,
    display: 'count',
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

export function buildVendorMetrics(input: VendorMetricsInput) {
  const complete = deliveryClosureMetric(input.completeDelivery)
  const shelfApplicable = input.shelfLife.filter((row) => row.compliance !== 'not_applicable')
  const shelfCompliant = shelfApplicable.filter((row) => row.compliance === 'compliant').length
  const confirmedReceipts = input.receipts.filter((row) => row.status === 'confirmed')
  const packagingApplicable = confirmedReceipts.filter((row) => row.packagingStatus !== null && row.packagingStatus !== 'not_applicable')
  const packagingAcceptable = packagingApplicable.filter((row) => row.packagingStatus === 'acceptable').length
  const coldChainReceipts = confirmedReceipts.filter((row) => row.coldChainApplicable)
  const temperatureApplicable = coldChainReceipts.filter((row) => row.temperatureStatus !== null && row.temperatureStatus !== 'not_applicable')
  const temperatureAcceptable = temperatureApplicable.filter((row) => row.temperatureStatus === 'acceptable').length
  const fiscalIssues = input.issues.filter((row) => row.openedAt.slice(0, 10) >= `${Number(input.fiscalYear) - 1}-10-01` && row.openedAt.slice(0, 10) <= `${input.fiscalYear}-09-30`)
  const documentationCount = fiscalIssues.filter((row) => row.issueType === 'documentation_discrepancy').length
  const complaints = fiscalIssues.filter((row) => row.issueType === 'complaint')
  const resolvedComplaints = complaints.filter((row) => row.resolutionStatus === 'resolved').length

  return {
    fiscalYear: input.fiscalYear,
    metrics: {
      completeDelivery: {
        ...ratioMetric('complete_delivery', complete.numerator, complete.denominator, 'ใบรายการที่ complete + short_closed', complete.excluded, input.completeDeliveryPolicyApproved !== true),
        excluded: complete.excluded,
      },
      shelfLifeCompliance: ratioMetric('shelf_life_compliance', shelfCompliant, shelfApplicable.length, 'รายการรับเข้าที่มีการตรวจอายุคงเหลือ'),
      packagingCompliance: ratioMetric('packaging_compliance', packagingAcceptable, packagingApplicable.length, 'ใบรับเข้าที่ยืนยันแล้วและมีผล packaging', [
        { reason: 'not_applicable', count: confirmedReceipts.filter((row) => row.packagingStatus === 'not_applicable').length },
        { reason: 'not_recorded', count: confirmedReceipts.filter((row) => row.packagingStatus === null).length },
      ]),
      temperatureCompliance: ratioMetric('temperature_compliance', temperatureAcceptable, temperatureApplicable.length, 'ใบรับเข้าที่ยืนยันแล้วและมี cold-chain applicability', [
        { reason: 'not_applicable', count: coldChainReceipts.filter((row) => row.temperatureStatus === 'not_applicable').length },
        { reason: 'not_recorded', count: coldChainReceipts.filter((row) => row.temperatureStatus === null).length },
      ], !input.coldChainMappingApproved),
      documentationDiscrepancies: countMetric('documentation_discrepancies', documentationCount, 'documentation discrepancy ที่เปิดในปีงบประมาณ'),
      complaintResolution: ratioMetric('complaint_resolution', resolvedComplaints, complaints.length, 'complaints ที่เปิดในปีงบประมาณ'),
    },
    deliveryLeadTime: deliveryLeadTime(input.deliveryDates),
    source: {
      completeDeliveryLines: input.completeDelivery.length,
      shelfLifeLines: input.shelfLife.length,
      confirmedReceipts: confirmedReceipts.length,
      issuesInFiscalYear: fiscalIssues.length,
      coldChainMappingApproved: input.coldChainMappingApproved,
    },
  }
}
