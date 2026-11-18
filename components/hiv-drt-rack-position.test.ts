import { describe, expect, it } from 'vitest'
import fs from 'node:fs'

const source = fs.readFileSync(new URL('./hiv-drt-view.tsx', import.meta.url), 'utf8')

describe('HIV DRT rack position safety', () => {
  it('keeps tube selection on mobile and desktop without click-to-move', () => {
    expect(source.match(/onClick=\{\(\) => onSelect\(sample\?\.id \?\? null\)\}/g)).toHaveLength(2)
    expect(source).not.toContain('onMove=')
    expect(source).not.toContain('selectOrMove')
    expect(source).not.toContain('moveSample(')
  })

  it('does not support dragging or dropping rack tubes', () => {
    expect(source).not.toMatch(/draggable=|onDragStart=|onDragOver=|onDrop=/)
  })

  it('does not send rack position changes from the HIV DRT view', () => {
    expect(source).not.toContain('targetPosition')
    expect(source).not.toContain('แตะช่องปลายทางเพื่อย้ายหรือสลับ')
    expect(source).not.toContain('Drag & Drop เพื่อย้าย/สลับ')
  })
})
