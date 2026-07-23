export type HivDrtSampleStatus = 'stored' | 'checked_out' | 'result_received' | 'destroyed'
export type HivDrtTatState = 'waiting' | 'overdue' | 'complete'
export type HivDrtDestructionState = 'none' | 'due_soon' | 'due_now'

export interface HivDrtSample {
  id: string
  barcode: string
  status: HivDrtSampleStatus
  fromStorage: boolean
  currentRackId: string | null
  currentPosition: number | null
  storedRackCode: string | null
  storedPosition: number | null
  storedAt: string | null
  storedByName: string | null
  destroyDueOn: string | null
  checkedOutAt: string | null
  checkedOutByName: string | null
  checkoutDestination: string | null
  tatDueOn: string | null
  resultReceivedAt: string | null
  resultReceivedByName: string | null
  destroyedAt: string | null
  destroyedByName: string | null
  createdAt: string
}

export interface HivDrtRack {
  id: string
  rackCode: string
  rows: number
  columns: number
  capacity: number
  nextPosition: number
  createdAt: string
  createdByName: string | null
  samples: HivDrtSample[]
}

export interface HivDrtWorkspace {
  racks: HivDrtRack[]
  samples: HivDrtSample[]
}

export interface HivDrtDashboard {
  storedSamples: number
  awaitingResults: number
  overdueResults: number
  destructionDueSoon: number
  destructionDueNow: number
}
