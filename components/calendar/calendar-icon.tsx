'use client'

import type { Icon } from '@phosphor-icons/react'
// Per-icon imports keep the bundle to the curated set only.
import { Airplane } from '@phosphor-icons/react/dist/csr/Airplane'
import { Baby } from '@phosphor-icons/react/dist/csr/Baby'
import { Bell } from '@phosphor-icons/react/dist/csr/Bell'
import { Briefcase } from '@phosphor-icons/react/dist/csr/Briefcase'
import { Broom } from '@phosphor-icons/react/dist/csr/Broom'
import { Buildings } from '@phosphor-icons/react/dist/csr/Buildings'
import { CalendarBlank } from '@phosphor-icons/react/dist/csr/CalendarBlank'
import { Car } from '@phosphor-icons/react/dist/csr/Car'
import { Certificate } from '@phosphor-icons/react/dist/csr/Certificate'
import { Chalkboard } from '@phosphor-icons/react/dist/csr/Chalkboard'
import { Clipboard } from '@phosphor-icons/react/dist/csr/Clipboard'
import { Clock } from '@phosphor-icons/react/dist/csr/Clock'
import { Coffee } from '@phosphor-icons/react/dist/csr/Coffee'
import { Drop } from '@phosphor-icons/react/dist/csr/Drop'
import { FirstAid } from '@phosphor-icons/react/dist/csr/FirstAid'
import { Flag } from '@phosphor-icons/react/dist/csr/Flag'
import { Flask } from '@phosphor-icons/react/dist/csr/Flask'
import { GraduationCap } from '@phosphor-icons/react/dist/csr/GraduationCap'
import { HandHeart } from '@phosphor-icons/react/dist/csr/HandHeart'
import { Heart } from '@phosphor-icons/react/dist/csr/Heart'
import { House } from '@phosphor-icons/react/dist/csr/House'
import { Microscope } from '@phosphor-icons/react/dist/csr/Microscope'
import { Moon } from '@phosphor-icons/react/dist/csr/Moon'
import { Package } from '@phosphor-icons/react/dist/csr/Package'
import { PresentationChart } from '@phosphor-icons/react/dist/csr/PresentationChart'
import { Star } from '@phosphor-icons/react/dist/csr/Star'
import { Sun } from '@phosphor-icons/react/dist/csr/Sun'
import { Syringe } from '@phosphor-icons/react/dist/csr/Syringe'
import { TestTube } from '@phosphor-icons/react/dist/csr/TestTube'
import { Thermometer } from '@phosphor-icons/react/dist/csr/Thermometer'
import { Truck } from '@phosphor-icons/react/dist/csr/Truck'
import { Umbrella } from '@phosphor-icons/react/dist/csr/Umbrella'
import { Users } from '@phosphor-icons/react/dist/csr/Users'
import { Wrench } from '@phosphor-icons/react/dist/csr/Wrench'
import { CALENDAR_ICON_KEYS, type CalendarIconKey } from '@/lib/calendar/icon-keys'
import type { CalendarColor } from '@/lib/calendar/types'

const ICONS: Record<CalendarIconKey, Icon> = {
  drop: Drop,
  syringe: Syringe,
  briefcase: Briefcase,
  thermometer: Thermometer,
  umbrella: Umbrella,
  airplane: Airplane,
  graduation: GraduationCap,
  users: Users,
  buildings: Buildings,
  house: House,
  moon: Moon,
  sun: Sun,
  heart: Heart,
  baby: Baby,
  'first-aid': FirstAid,
  flask: Flask,
  'test-tube': TestTube,
  microscope: Microscope,
  clock: Clock,
  calendar: CalendarBlank,
  bell: Bell,
  package: Package,
  truck: Truck,
  car: Car,
  star: Star,
  flag: Flag,
  chalkboard: Chalkboard,
  presentation: PresentationChart,
  'hand-heart': HandHeart,
  coffee: Coffee,
  broom: Broom,
  wrench: Wrench,
  clipboard: Clipboard,
  certificate: Certificate,
}

export const ICON_LABELS: Record<CalendarIconKey, string> = {
  drop: 'หยดเลือด',
  syringe: 'เข็มฉีดยา',
  briefcase: 'กระเป๋าทำงาน',
  thermometer: 'ปรอทวัดไข้',
  umbrella: 'ร่ม',
  airplane: 'เครื่องบิน',
  graduation: 'หมวกรับปริญญา',
  users: 'กลุ่มคน',
  buildings: 'อาคาร',
  house: 'บ้าน',
  moon: 'พระจันทร์',
  sun: 'พระอาทิตย์',
  heart: 'หัวใจ',
  baby: 'เด็กอ่อน',
  'first-aid': 'ปฐมพยาบาล',
  flask: 'ขวดทดลอง',
  'test-tube': 'หลอดทดลอง',
  microscope: 'กล้องจุลทรรศน์',
  clock: 'นาฬิกา',
  calendar: 'ปฏิทิน',
  bell: 'กระดิ่ง',
  package: 'กล่องพัสดุ',
  truck: 'รถขนส่ง',
  car: 'รถยนต์',
  star: 'ดาว',
  flag: 'ธง',
  chalkboard: 'กระดาน',
  presentation: 'นำเสนอ',
  'hand-heart': 'จิตอาสา',
  coffee: 'กาแฟ',
  broom: 'ไม้กวาด',
  wrench: 'ประแจ',
  clipboard: 'คลิปบอร์ด',
  certificate: 'ใบประกาศ',
}

export const ICON_KEYS = CALENDAR_ICON_KEYS

/** Text color per type color; tints are derived with color-mix in calendar.css. */
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

export const COLOR_LABELS: Record<CalendarColor, string> = {
  teal: 'เขียวน้ำทะเล',
  rose: 'ชมพูแดง',
  amber: 'เหลืองอำพัน',
  sky: 'ฟ้า',
  violet: 'ม่วง',
  green: 'เขียว',
  orange: 'ส้ม',
  slate: 'เทา',
}

export function CalendarIcon({ iconKey, size = 16, className = '' }: { iconKey: string; size?: number; className?: string }) {
  const Glyph = ICONS[iconKey as CalendarIconKey] ?? Star
  return <Glyph size={size} weight="duotone" className={className} aria-hidden="true" />
}
