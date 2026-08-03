/** Lab-approved initials used consistently on controlled records. */
export const RESPONSIBLE_CODE_BY_NAME: Record<string, string> = {
  'Siriwat J': 'SJ',
  'Siritorn C': 'SC',
  'Somrat M': 'SM',
  'Umaporn R': 'UR',
  'Worrawut W': 'WW',
}

export function responsibleCodeForDisplayName(displayName: string | null | undefined) {
  const normalized = displayName?.trim().replace(/\.$/, '')
  return normalized ? RESPONSIBLE_CODE_BY_NAME[normalized] : undefined
}
