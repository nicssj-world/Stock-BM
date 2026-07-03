import type { StockWorkspace } from '@/lib/bm/types'
import type { HpvSiteSummary } from '@/lib/hpv/rules'

export type HpvBoxType = 'self_collected' | 'clinician_collected'
export type HpvBoxStatus = 'open' | 'full' | 'destroyed'
export type HpvSampleStatus = 'stored' | 'checked_out' | 'destroyed'

export interface HpvSite {
  id: string
  code: string | null
  name: string
  siteType: string
  selfSupplied: boolean
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface HpvKitDistribution {
  id: string
  siteId: string
  siteName: string
  distributedOn: string
  quantity: number
  stockLotId: string
  stockLocationId: string
  stockTransactionId: string
  itemCode: string | null
  itemName: string | null
  lotNumber: string | null
  locationCode: string | null
  note: string | null
  createdByName: string | null
  createdAt: string
}

export interface HpvSiteReceipt {
  id: string
  siteId: string
  siteName: string
  receivedOn: string
  sampleCount: number
  note: string | null
  createdByName: string | null
  createdAt: string
}

export interface HpvSample {
  id: string
  barcode: string
  boxId: string
  position: number
  status: HpvSampleStatus
  storedAt: string
  storedByName: string | null
  checkedOutAt: string | null
  checkedOutByName: string | null
  checkoutDestination: string | null
  checkoutNote: string | null
}

export interface HpvStorageBox {
  id: string
  boxCode: string
  boxType: HpvBoxType
  capacity: number
  status: HpvBoxStatus
  filledAt: string | null
  destroyDueAt: string | null
  destroyedAt: string | null
  createdAt: string
  updatedAt: string
  samples: HpvSample[]
}

export interface HpvWorkspace {
  sites: HpvSite[]
  summaries: HpvSiteSummary[]
  distributions: HpvKitDistribution[]
  receipts: HpvSiteReceipt[]
  boxes: HpvStorageBox[]
  stock: StockWorkspace
}

export interface HpvDashboard {
  storedSamples: number
  boxesDueDestruction: number
}
