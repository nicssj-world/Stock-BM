import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const inventory = readFileSync(join(process.cwd(), 'components/inventory-view.tsx'), 'utf8')
const lotActionSheet = inventory.split('function LotActionSheet(')[1]?.split('function LotEditDialog(')[0] ?? ''

describe('inventory lot actions', () => {
  it('opens a visible action dialog on desktop as well as mobile', () => {
    expect(inventory).toContain('onClick={onLotAction}')
    expect(lotActionSheet).toContain('role="dialog"')
    expect(lotActionSheet).toContain('aria-modal="true"')
    expect(lotActionSheet).toContain('sm:items-center')
    expect(lotActionSheet).not.toContain('xl:hidden')
  })

  it('closes the dialog with Escape and preserves the existing lot actions', () => {
    expect(lotActionSheet).toContain("event.key === 'Escape'")
    expect(lotActionSheet).toContain('window.removeEventListener')
    expect(lotActionSheet).toContain('mode=issue')
    expect(lotActionSheet).toContain('mode=move')
    expect(lotActionSheet).toContain('onClick={onEdit}')
  })
})
