import { describe, expect, it } from 'vitest'
import { buildHivLabAlertMessage, formatHivLabAlertDate, maskPatientName } from './rules'

describe('HIV LAB Alert privacy rules', () => {
  it('masks each Thai name token while preserving the first and last grapheme', () => {
    expect(maskPatientName('ศิริวัฒน์ จำปีรัตน์')).toBe('ศิxxxน์ จำxxxน์')
  })

  it('does not invent a middle name when a token has one grapheme', () => {
    expect(maskPatientName('ก')).toBe('ก')
  })
})

describe('HIV LAB Alert LINE message', () => {
  it('uses the masked name and Bangkok Buddhist date in the approved format', () => {
    const sentAt = '2026-08-11T04:30:00.000Z'
    expect(formatHivLabAlertDate(sentAt)).toBe('11/08/2569')
    expect(buildHivLabAlertMessage({
      hn: 'HN-001',
      ln: 'LN-001',
      patientNameMasked: 'ศิxxxน์ จำxxxน์',
      sentAt,
    })).toBe([
      'แจ้งเตือน VL > 1,000 copies/mL',
      'HN : HN-001',
      'LN : LN-001',
      'ชื่อปกปิด : ศิxxxน์ จำxxxน์',
      'ประทับวันที่ : 11/08/2569',
    ].join('\n'))
  })
})
