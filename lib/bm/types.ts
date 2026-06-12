export type BmRole = 'Admin' | 'Staff'
export type GenomicRole = 'Admin' | 'CBH-Staff'
export type StockTransactionType = 'receive' | 'issue' | 'move' | 'adjustment' | 'reversal'
export type ExpiryState = 'ok' | 'expiring' | 'expired' | 'none'

export interface BmActor {
  id: string
  ephisId: string
  displayName: string
  genomicRole: GenomicRole
  role: BmRole
}

export interface StockCategory {
  id: string
  name: string
  isActive: boolean
}

export interface StockLocation {
  id: string
  code: string
  name: string
  storageCondition: string | null
  isActive: boolean
}

export interface StockBalance {
  lotId: string
  locationId: string
  locationCode: string
  locationName: string
  onHand: number
}

export interface StockLot {
  id: string
  itemId: string
  lotNumber: string
  expiryDate: string | null
  expiryState: ExpiryState
  internalQrToken: string
  manufacturerBarcode: string | null
  createdAt: string
  totalOnHand: number
  usableOnHand: number
  balances: StockBalance[]
}

export interface StockItem {
  id: string
  itemCode: string
  name: string
  categoryId: string
  categoryName: string
  unit: string
  minimumStock: number
  expiryWarningDays: number
  storageCondition: string | null
  supplier: string | null
  catalogNo: string | null
  manufacturer: string | null
  manufacturerBarcode: string | null
  trackLot: boolean
  trackExpiry: boolean
  isActive: boolean
  totalOnHand: number
  usableOnHand: number
  isLowStock: boolean
  lots: StockLot[]
}

export interface StockTransactionLine {
  lotId: string
  lotNumber: string
  itemId: string
  itemCode: string
  itemName: string
  unit: string
  locationId: string
  locationCode: string
  locationName: string
  quantity: number
}

export interface StockTransaction {
  id: string
  transactionType: StockTransactionType
  reference: string | null
  purpose: string | null
  note: string | null
  overrideReason: string | null
  sourceTransactionId: string | null
  reversedByTransactionId: string | null
  createdBy: string
  createdByName: string | null
  createdAt: string
  canReverse: boolean
  lines: StockTransactionLine[]
}

export interface StockWorkspace {
  categories: StockCategory[]
  locations: StockLocation[]
  items: StockItem[]
  transactions: StockTransaction[]
  activeItemCount: number
  lowStockItemCount: number
  expiringLotCount: number
  expiredLotCount: number
  locationCount: number
}

export interface ScanResolution {
  kind: 'internal-lot' | 'manufacturer-barcode' | 'unknown'
  code: string
  itemId?: string
  itemCode?: string
  itemName?: string
  lotId?: string
  lotNumber?: string
  locationId?: string
  locationCode?: string
  href?: string
}

export interface AdminUserRow {
  id: string
  ephisId: string
  displayName: string
  genomicRole: GenomicRole
  genomicActive: boolean
  stockRole: BmRole | null
  stockActive: boolean
  createdAt: string
}

