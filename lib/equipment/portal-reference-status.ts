import type { PortalEquipmentStatus } from '@/lib/equipment/portal-reference-types'

/** Map Portal's display statuses into the small, client-safe reference vocabulary. */
export function normalizePortalEquipmentStatus(value: unknown): PortalEquipmentStatus {
  const raw = typeof value === 'string' ? value.trim().toLowerCase() : ''
  const status = raw.replace(/[\s-]+/g, '_')

  if (status === 'active') return 'active'
  if (status === 'inactive' || status === 'not_in_use') return 'inactive'
  if (status === 'maintenance' || status === 'repair') return 'maintenance'
  if (status === 'decommissioned' || status === 'retired' || raw === 'เลิกใช้งาน') return 'decommissioned'
  if (status === 'out_of_service' || status === 'damaged' || ['ชำรุด', 'ย้าย', 'สูญหาย'].includes(raw)) return 'out_of_service'

  // Portal can add localized statuses; unknown values must not become usable.
  return 'out_of_service'
}

export function canLinkPortalEquipmentStatus(status: PortalEquipmentStatus): boolean {
  return status === 'active'
}

export function canUsePortalEquipmentStatus(status: PortalEquipmentStatus): boolean {
  return status === 'active'
}
