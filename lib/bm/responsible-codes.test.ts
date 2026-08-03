import { describe, expect, it } from 'vitest'
import { responsibleCodeForDisplayName } from './responsible-codes'

describe('responsibleCodeForDisplayName', () => {
  it('uses the same approved initials as EQA, including names with a trailing period', () => {
    expect(responsibleCodeForDisplayName('Somrat M')).toBe('SM')
    expect(responsibleCodeForDisplayName('Siriwat J.')).toBe('SJ')
  })

  it('does not invent initials for an unmapped user', () => {
    expect(responsibleCodeForDisplayName('Unknown User')).toBeUndefined()
  })
})
