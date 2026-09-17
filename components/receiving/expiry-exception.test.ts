import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(join(process.cwd(), 'components/receiving/expiry-exception.tsx'), 'utf8')

describe('expiry exception UI contract', () => {
  it('keeps the approved warning copy and enumerated reasons', () => {
    for (const copy of [
      '⚠ Expiry ไม่เป็นไปตามเงื่อนไข TOR',
      'อายุคงเหลือ ณ วันรับ:',
      'เกณฑ์ TOR: &gt; 6 เดือน',
      'มีความจำเป็นเร่งด่วนในการใช้งาน',
      'คาดว่าสามารถใช้หมดก่อนวันหมดอายุ',
      'ไม่มีสินค้าทดแทน / ผู้ขายไม่มี Lot ที่อายุยาวกว่า',
      'ได้รับการยืนยัน/อนุมัติให้รับสินค้า',
      'OPTIONAL — never blocks confirmation',
    ]) expect(source).toContain(copy)
  })

  it('does not introduce an evidence requirement', () => {
    expect(source).not.toMatch(/evidence.*required|required.*evidence/i)
  })
})
