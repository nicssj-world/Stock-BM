export interface Vendor {
  id: string
  code: string
  name: string
  taxId: string | null
  address: string | null
  phone: string | null
  email: string | null
  contactPerson: string | null
  isActive: boolean
  note: string | null
  createdBy: string
  createdAt: string
  updatedAt: string
  itemCount: number
}

export interface SupplierCandidate {
  supplier: string
  itemCount: number
  itemCodes: string[]
}

export const VENDOR_ISSUE_TYPES = [
  'complaint',
  'documentation_discrepancy',
  'packaging_damage',
  'temperature_out_of_range',
  'quantity_discrepancy',
  'expiry_non_compliant',
  'other',
] as const
export type VendorIssueType = (typeof VENDOR_ISSUE_TYPES)[number]
export type VendorIssueResolutionStatus = 'open' | 'resolved' | 'cancelled'

export interface VendorIssue {
  id: string
  vendorId: string
  receiptId: string | null
  receiptLineId: string | null
  issueType: VendorIssueType
  description: string
  resolutionStatus: VendorIssueResolutionStatus
  resolutionNote: string | null
  openedBy: string
  openedAt: string
  resolvedBy: string | null
  resolvedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface VendorSignificantEvent {
  id: string
  vendorId: string
  eventType: string
  severity: 'significant' | 'critical'
  eventDate: string
  description: string
  receiptId: string | null
  issueId: string | null
  createdBy: string
  createdAt: string
}

export type InvoiceStatus = 'draft' | 'open' | 'closed' | 'cancelled'
export type InvoiceSource = 'manual' | 'ocr'
export type ReceiptStatus = 'draft' | 'confirmed' | 'cancelled'
export type ReceiptSource = 'manual' | 'ocr' | 'scan'
export type MatchMethod = 'exact_unique' | 'exact_ambiguous' | 'similar' | 'manual' | 'unmatched'
export type ClosureState = 'open' | 'complete' | 'short_closed' | 'cancelled'
export type LotMode = 'existing' | 'new' | 'not_tracked'
export type TorCompliance = 'compliant' | 'not_compliant' | 'not_applicable'
export type ReceiptDecision = 'accepted' | 'accepted_with_justification'
export type AcceptanceReasonCode = 'urgent_need' | 'consume_before_expiry' | 'no_alternative' | 'approved_by_authority' | 'other'
export type PackagingStatus = 'acceptable' | 'damaged' | 'not_applicable'
export type TemperatureStatus = 'acceptable' | 'out_of_range' | 'not_applicable'

export interface InvoiceLine {
  id: string
  invoiceId: string
  lineNo: number
  stockItemId: string | null
  catalogNoText: string | null
  descriptionText: string | null
  expectedQty: number
  lotText: string | null
  expiryText: string | null
  matchMethod: MatchMethod | null
  matchConfidence: number | null
  closureState: ClosureState
  shortReasonCode: string | null
  shortReasonNote: string | null
  sortOrder: number
  createdAt: string
}

export interface Invoice {
  id: string
  vendorId: string
  invoiceNo: string | null
  invoiceDate: string | null
  status: InvoiceStatus
  source: InvoiceSource
  ocrJobId: string | null
  note: string | null
  createdBy: string
  createdAt: string
  updatedAt: string
  lines: InvoiceLine[]
}

export interface ReceiptLine {
  id: string
  receiptId: string
  lineNo: number
  invoiceLineId: string | null
  stockItemId: string
  stockLotId: string | null
  lotNumber: string | null
  expiryDate: string | null
  lotMode: LotMode
  locationId: string
  expectedQty: number | null
  receivedQty: number
  barcodeRaw: string | null
  barcodeSymbology: string | null
  barcodeStandard: string | null
  barcodeGtin: string | null
  barcodeLot: string | null
  barcodeExpiry: string | null
  torThresholdMonths: number
  torExpiryCompliance: TorCompliance
  remainingShelfLifeDays: number | null
  receiptDecision: ReceiptDecision
  acceptanceReasonCode: AcceptanceReasonCode | null
  acceptanceReasonNote: string | null
  acceptedBy: string | null
  acceptedAt: string | null
  conflicts: Record<string, unknown>[]
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export interface Receipt {
  id: string
  receiptNo: string | null
  invoiceId: string | null
  vendorId: string
  receivedAt: string
  receivedDate: string
  receivedBy: string
  packagingStatus: PackagingStatus | null
  packagingNote: string | null
  temperatureStatus: TemperatureStatus | null
  temperatureValueC: number | null
  temperatureNote: string | null
  coldChainApplicable: boolean
  status: ReceiptStatus
  stockTransactionId: string | null
  confirmedAt: string | null
  confirmedBy: string | null
  source: ReceiptSource
  note: string | null
  createdBy: string
  createdAt: string
  updatedAt: string
  lines: ReceiptLine[]
}

export interface ReceiptConflict {
  code: string
  message: string
  target: string
}

export interface ReceivingPolicy {
  id: string
  version: number
  isEnabled: boolean
  expiryExceptionEnabled: boolean
  expiryExceptionMinRole: string | null
  expiryExceptionRequiresSecondApproval: boolean | null
  isApproved: boolean
}

export interface ReceivingWorkspace {
  vendors: Vendor[]
  invoices: Invoice[]
  receipts: Receipt[]
  items: { id: string; itemCode: string; name: string; unit: string; trackLot: boolean; trackExpiry: boolean; catalogNo?: string | null; manufacturer?: string | null; supplier?: string | null }[]
  locations: { id: string; code: string; name: string; isActive: boolean }[]
  policy: ReceivingPolicy
}

export type ReceivingIssue = { message: string; target: string }
