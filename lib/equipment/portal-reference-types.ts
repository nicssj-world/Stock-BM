/**
 * Public JSON shape shared between authenticated Stock-BM API routes and
 * client-side pickers. This module intentionally has no server-only imports.
 */
export type PortalEquipmentModule = 'iqc' | 'eqa' | 'stock'

export type PortalEquipmentStatus =
  | 'active'
  | 'maintenance'
  | 'out_of_service'
  | 'decommissioned'

export interface PortalEquipmentReference {
  id: string
  code: string
  name: string
  model: string | null
  serialNumber: string | null
  status: PortalEquipmentStatus
  portalUrl: string | null
}
