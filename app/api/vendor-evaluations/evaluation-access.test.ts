import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const collection = readFileSync(join(process.cwd(), 'app/api/vendor-evaluations/route.ts'), 'utf8')
const item = readFileSync(join(process.cwd(), 'app/api/vendor-evaluations/[id]/route.ts'), 'utf8')
const approvals = readFileSync(join(process.cwd(), 'app/api/vendor-evaluations/[id]/approvals/route.ts'), 'utf8')
const server = readFileSync(join(process.cwd(), 'lib/server/vendor-evaluation.ts'), 'utf8')

describe('vendor evaluation API policy boundary', () => {
  it('protects every evaluation route and accepts signatures as multipart input', () => {
    for (const source of [collection, item, approvals]) expect(source).toContain('requireStockOperator')
    expect(approvals).toContain('formData')
    expect(approvals).toContain('signature')
  })

  it('keeps the document independent from receiving enablement and fail-closed for scoring', () => {
    for (const source of [collection, item, approvals, server]) expect(source).not.toContain('assertReceivingEnabled')
    expect(server).toContain('policy_id: null')
    expect(server).toContain('result: null')
    expect(server).toContain('result_label: null')
    expect(server).toContain('P-16')
  })
})
