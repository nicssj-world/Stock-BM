const thaiGraphemeSegmenter = new Intl.Segmenter('th', { granularity: 'grapheme' })

function graphemes(value: string) {
  return [...thaiGraphemeSegmenter.segment(value)].map(({ segment }) => segment)
}

function maskNameToken(token: string) {
  const parts = graphemes(token)
  if (parts.length <= 1) return token
  return `${parts[0]}xxx${parts[parts.length - 1]}`
}

export function maskPatientName(value: string) {
  return value.trim().split(/\s+/).filter(Boolean).map(maskNameToken).join(' ')
}

export function formatHivLabAlertDate(value: string) {
  return new Intl.DateTimeFormat('th-TH-u-ca-buddhist', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Asia/Bangkok',
  }).format(new Date(value))
}

export function buildHivLabAlertMessage(input: {
  hn: string
  ln: string
  patientNameMasked: string
  sentAt: string
}) {
  return [
    '🚨 แจ้งเตือน VL > 1,000 copies/mL',
    `HN : ${input.hn}`,
    `LN : ${input.ln}`,
    `👤 ${input.patientNameMasked}`,
    `📅 ${formatHivLabAlertDate(input.sentAt)}`,
  ].join('\n')
}
