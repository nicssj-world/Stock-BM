import type { Vendor, VendorIssue, VendorSignificantEvent } from '@/lib/receiving/types'
import type { VendorMetricKey } from './metrics'

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
    invoiceId: string | null
    receivedDate: string
    status: string
    packagingStatus: string | null
    temperatureStatus: string | null
    coldChainApplicable: boolean
  }>
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
