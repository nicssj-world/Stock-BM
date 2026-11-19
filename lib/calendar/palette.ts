import type { CalendarIconKey } from '@/lib/calendar/icon-keys'
import type { CalendarColor } from '@/lib/calendar/types'

/** Ink color per type color; used by the web UI (tints via color-mix) and by LINE Flex messages. */
export const COLOR_HEX: Record<CalendarColor, string> = {
  teal: '#0f8a7e',
  rose: '#c93a62',
  amber: '#b5760a',
  sky: '#2672b0',
  violet: '#6f4cbd',
  green: '#3a8638',
  orange: '#c45722',
  slate: '#55677a',
}

/** LINE renders emoji natively; they stand in for the Phosphor icon inside chat messages. */
export const ICON_EMOJI: Record<CalendarIconKey, string> = {
  drop: '🩸',
  syringe: '💉',
  briefcase: '💼',
  thermometer: '🤒',
  umbrella: '🏖️',
  airplane: '✈️',
  graduation: '🎓',
  users: '👥',
  buildings: '🏢',
  house: '🏠',
  moon: '🌙',
  sun: '☀️',
  heart: '❤️',
  baby: '👶',
  'first-aid': '🩹',
  flask: '🧪',
  'test-tube': '🧪',
  microscope: '🔬',
  clock: '⏰',
  calendar: '📅',
  bell: '🔔',
  package: '📦',
  truck: '🚚',
  car: '🚗',
  star: '⭐',
  flag: '🚩',
  chalkboard: '🧑‍🏫',
  presentation: '📊',
  'hand-heart': '🤝',
  coffee: '☕',
  broom: '🧹',
  wrench: '🔧',
  clipboard: '📋',
  certificate: '📜',
}

export function emojiFor(iconKey: string) {
  return ICON_EMOJI[iconKey as CalendarIconKey] ?? '📌'
}
