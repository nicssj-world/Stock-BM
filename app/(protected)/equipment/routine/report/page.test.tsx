import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

vi.mock('@/lib/server/auth', () => ({
  requireFullPageActor: vi.fn(async () => ({
    id: 'actor-id',
    ephisId: 'test',
    displayName: 'Test User',
    genomicRole: 'CBH-Staff',
    role: 'Staff',
  })),
}))

const { getRoutineReportCatalog, getRoutineWorkspace } = vi.hoisted(() => ({
  getRoutineReportCatalog: vi.fn(),
  getRoutineWorkspace: vi.fn(),
}))

vi.mock('@/lib/server/routine-maintenance', () => ({
  getRoutineReportCatalog,
  getRoutineWorkspace,
}))

import RoutineMaintenanceReportPage from './page'

describe('routine maintenance report page', () => {
  it('renders a Monthly report with month labels', async () => {
    const equipment = {
      id: 'equipment-id',
      code: 'LAB-BM-15-001',
      name: 'Flow cytometer',
      manufacturer: null,
      model: null,
      status: 'active',
    }
    const form = {
      id: 'form-id',
      equipmentId: equipment.id,
      name: 'Monthly Maintenance',
      active: true,
      reviewerId: null,
      versions: [{
        id: 'version-id',
        formId: 'form-id',
        versionNumber: 1,
        frequency: 'monthly' as const,
        startsOn: '2026-07-01',
        effectiveOn: '2026-07-01',
        items: [{
          id: 'item-id',
          position: 1,
          label: 'Monthly clean',
          responseSetId: 'response-set-id',
          responseSet: {
            id: 'response-set-id',
            name: 'Done',
            active: true,
            options: [{ id: 'option-id', value: 'done', label: 'Done', mark: '✓', position: 1 }],
          },
        }],
      }],
    }

    getRoutineReportCatalog.mockResolvedValue({
      equipment: [equipment],
      forms: [{ id: form.id, equipmentId: equipment.id, name: form.name, active: true }],
    })
    getRoutineWorkspace.mockResolvedValue({
      equipment: { id: equipment.id, code: equipment.code, name: equipment.name, qrToken: 'token' },
      forms: [form],
      entries: [],
      holidays: [],
      reviews: [],
      users: [],
      responseSets: [form.versions[0].items[0].responseSet],
      defaultResponseSetId: 'response-set-id',
      today: '2026-09-15',
    })

    const element = await RoutineMaintenanceReportPage({
      searchParams: Promise.resolve({
        equipmentId: equipment.id,
        formId: form.id,
        frequency: 'monthly',
        period: '2026',
      }),
    })

    const html = renderToStaticMarkup(element)
    expect(html).toContain('ต.ค. 2568')
    expect(html).toContain('ก.ย. 2569')
  })

  it.each(['daily', 'weekly', 'monthly', 'yearly'] as const)('renders the %s report branch without a server render error', async (frequency) => {
    const equipment = {
      id: `equipment-${frequency}`,
      code: 'LAB-BM-15-001',
      name: 'Flow cytometer',
      manufacturer: null,
      model: null,
      status: 'active',
    }
    const form = {
      id: `form-${frequency}`,
      equipmentId: equipment.id,
      name: `${frequency} Maintenance`,
      active: true,
      reviewerId: null,
      versions: [{
        id: `version-${frequency}`,
        formId: `form-${frequency}`,
        versionNumber: 1,
        frequency,
        startsOn: frequency === 'monthly' ? '2026-07-01' : '2026-01-01',
        effectiveOn: frequency === 'monthly' ? '2026-07-01' : '2026-01-01',
        items: [{
          id: `item-${frequency}`,
          position: 1,
          label: `${frequency} checklist`,
          responseSetId: `response-set-${frequency}`,
          responseSet: {
            id: `response-set-${frequency}`,
            name: 'Done',
            active: true,
            options: [{ id: `option-${frequency}`, value: 'done', label: 'Done', mark: '✓', position: 1 }],
          },
        }],
      }],
    }

    getRoutineReportCatalog.mockResolvedValue({
      equipment: [equipment],
      forms: [{ id: form.id, equipmentId: equipment.id, name: form.name, active: true }],
    })
    getRoutineWorkspace.mockResolvedValue({
      equipment: { id: equipment.id, code: equipment.code, name: equipment.name, qrToken: 'token' },
      forms: [form],
      entries: [],
      holidays: [],
      reviews: [],
      users: [],
      responseSets: [form.versions[0].items[0].responseSet],
      defaultResponseSetId: `response-set-${frequency}`,
      today: '2026-09-15',
    })

    const period = frequency === 'daily' || frequency === 'weekly' ? '2026-09' : '2026'
    const element = await RoutineMaintenanceReportPage({
      searchParams: Promise.resolve({ equipmentId: equipment.id, formId: form.id, frequency, period }),
    })

    const html = renderToStaticMarkup(element)
    expect(html).toContain(`frequency-${frequency}`)
    expect(html).toContain(frequency.toUpperCase())
  })
})
