import { describe, expect, it } from 'vitest'
import fs from 'node:fs'

const source = fs.readFileSync(new URL('./eqa-view.tsx', import.meta.url), 'utf8')
const button = fs.readFileSync(new URL('./eqa/planned-rounds.tsx', import.meta.url), 'utf8')

describe('EQA round generation from the annual plan', () => {
  it('wires GeneratePlannedRoundsButton into the plans tab', () => {
    expect(source).toContain('GeneratePlannedRoundsButton')
    expect(source).toContain("from '@/components/eqa/planned-rounds'")
  })

  it('drops the duplicated sample-received-date field from manual round creation', () => {
    expect(source).not.toContain("sampleReceivedDate: '', resultDueDate: ''")
  })

  it('posts to the plan-item rounds endpoint', () => {
    expect(button).toContain('/api/eqa/plan-items/${item.id}/rounds')
  })

  it('matches manually-created rounds to their planned month before generating the remaining rounds', () => {
    const server = fs.readFileSync(new URL('../lib/server/eqa.ts', import.meta.url), 'utf8')
    expect(server).toContain("nullableString(round.sample_received_date) ?? nullableString(round.submission_date)")
    expect(server).toContain('occurrence.plannedMonth === eventMonth')
    expect(server).toContain('planned.filter((occurrence) => !usedSequences.has(occurrence.sequence))')
  })
})
