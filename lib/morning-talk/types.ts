import type { BmRole } from '@/lib/bm/types'

export interface MorningTalkUser {
  id: string
  displayName: string
  ephisId: string
  role: BmRole
}

export interface MorningTalkAttendee {
  userId: string
  displayName: string
  ephisId: string
  role: BmRole
  acknowledgedAt: string | null
}

export interface MorningTalk {
  id: string
  talkDate: string
  title: string
  agenda: string | null
  createdByName: string | null
  createdAt: string
  attendees: MorningTalkAttendee[]
}

export interface MorningTalkWorkspace {
  talks: MorningTalk[]
  users: MorningTalkUser[]
}
