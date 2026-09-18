import type { Vendor, VendorIssue, VendorSignificantEvent } from '@/lib/receiving/types'
import type { AssessmentEvidence, VendorMetricKey } from './metrics'

export type VendorMetrics = ReturnType<typeof import('./metrics').buildVendorMetrics>

export type VendorPerformance = {
  vendor: Vendor
  fiscalYear: string
  from: string
  to: string
  metrics: VendorMetrics
  issues: VendorIssue[]
  significantEvents: VendorSignificantEvent[]
  receiptSources: Array<{
    id: string
    receiptNo: string | null
    invoiceId: string | null
    receivedDate: string
    status: string
    assessmentStatus: 'pending' | 'completed' | null
  }>
  assessmentSources: Array<AssessmentEvidence & { note: string | null; assessedAt: string | null }>
  receiptLineSources: Array<{
    id: string
    receiptId: string
    invoiceLineId: string | null
    compliance: string
  }>
  invoiceLineSources: Array<{
    id: string
    invoiceId: string
    lineNo: number
    closureState: 'open' | 'complete' | 'short_closed' | 'cancelled'
  }>
  metricKeys: VendorMetricKey[]
}
