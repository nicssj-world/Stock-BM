import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const issueCollection = readFileSync(join(process.cwd(), 'app/api/vendors/[id]/issues/route.ts'), 'utf8')
const issueItem = readFileSync(join(process.cwd(), 'app/api/vendors/[id]/issues/[issueId]/route.ts'), 'utf8')
const performance = readFileSync(join(process.cwd(), 'app/api/vendors/[id]/performance/route.ts'), 'utf8')
const exportRoute = readFileSync(join(process.cwd(), 'app/api/vendors/[id]/performance/export/route.ts'), 'utf8')

describe('vendor performance API access', () => {
  it('protects issue, metric, and CSV routes with the stock operator guard', () => {
    for (const source of [issueCollection, issueItem, performance, exportRoute]) {
      expect(source).toContain('requireStockOperator')
    }
  })

  it('keeps Phase 3 routes independent from receiving enablement and score policy', () => {
    for (const source of [issueCollection, issueItem, performance, exportRoute]) {
      expect(source).not.toContain('assertReceivingEnabled')
      expect(source).not.toMatch(/weight|score/i)
    }
  })
})
