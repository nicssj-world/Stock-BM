import { describe, expect, it } from 'vitest'
import fs from 'node:fs'

const source = fs.readFileSync(new URL('./eqa-view.tsx', import.meta.url), 'utf8')

describe('EQA management actions', () => {
  it('provides edit and delete actions for schemes and rounds', () => {
    expect(source).toContain('แก้ไข scheme')
    expect(source).toContain('ลบ scheme')
    expect(source).toContain('แก้ไข round')
    expect(source).toContain('ลบ round')
  })
})
