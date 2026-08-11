export type HivLabAlertLineStatus = 'pending' | 'sending' | 'sent'

export interface HivLabAlertRack {
  id: string
  rackCode: string
  capacity: number
  nextPosition: number
  nextAutoPosition: number | null
}

export interface HivLabAlert {
  id: string
  hn: string
  ln: string
  patientNameMasked: string
  hivDrtSampleId: string
  lineStatus: HivLabAlertLineStatus
  lineSentAt: string | null
  lineSentByName: string | null
  lineSendAttempts: number
  createdAt: string
  createdByName: string | null
  updatedAt: string
  storageStatus: string
  storageRackId: string | null
  storageRackCode: string | null
  storagePosition: number | null
}

export interface HivLabAlertWorkspace {
  alerts: HivLabAlert[]
  racks: HivLabAlertRack[]
}
