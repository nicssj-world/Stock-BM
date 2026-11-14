import { describe, expect, it } from 'vitest'
import {
  canLinkPortalEquipmentStatus,
  canUsePortalEquipmentStatus,
  normalizePortalEquipmentStatus,
} from '@/lib/equipment/portal-reference-status'

describe('Portal equipment status policy', () => {
  it('recognizes active and inactive Portal statuses without treating inactive as active', () => {
    expect(normalizePortalEquipmentStatus('Active')).toBe('active')
    expect(normalizePortalEquipmentStatus('Inactive')).toBe('inactive')
  })

  it('fails closed for unknown statuses and keeps terminal statuses distinct', () => {
    expect(normalizePortalEquipmentStatus('ชำรุด')).toBe('out_of_service')
    expect(normalizePortalEquipmentStatus('retired')).toBe('decommissioned')
    expect(normalizePortalEquipmentStatus('new Portal status')).toBe('out_of_service')
  })

  it('allows new links and IQC use only while Portal status is active', () => {
    for (const status of ['inactive', 'maintenance', 'out_of_service', 'decommissioned'] as const) {
      expect(canLinkPortalEquipmentStatus(status)).toBe(false)
      expect(canUsePortalEquipmentStatus(status)).toBe(false)
    }
    expect(canLinkPortalEquipmentStatus('active')).toBe(true)
    expect(canUsePortalEquipmentStatus('active')).toBe(true)
  })
})
