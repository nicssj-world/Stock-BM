import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('./eqa/rounds-tab.tsx', import.meta.url), 'utf8')

describe('EQA round progress flow', () => {
  it('connects each progress step with a right-facing arrow', () => {
    expect(source).toContain("import { CheckCircle2, ChevronRight")
    expect(source).toContain('steps.map((step, index) => <div key={step.key} className="flex items-center gap-1.5">')
    expect(source).toContain('index < steps.length - 1 ? <ChevronRight')
  })
})
