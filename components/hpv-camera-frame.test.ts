import { describe, expect, it } from 'vitest'
import fs from 'node:fs'

const source = fs.readFileSync(new URL('./hpv-view.tsx', import.meta.url), 'utf8')

describe('HPV storage camera guide', () => {
  it('renders a barcode alignment frame over the camera preview', () => {
    expect(source).toContain('barcode-guide-frame')
    expect(source).toContain('จัดบาร์โค้ดให้อยู่ในกรอบ')
  })
})
