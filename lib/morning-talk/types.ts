import type { BmRole } from '@/lib/bm/types'

export type MorningTalkActionStatus = 'todo' | 'in-progress' | 'done'

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

export interface MorningTalkChecklistItem {
  id: string
  title: string
  sortOrder: number
  completedAt: string | null
  completedByName: string | null
}

export interface MorningTalkActionItem {
  id: string
  title: string
  ownerId: string | null
  ownerName: string | null
  dueDate: string | null
  status: MorningTalkActionStatus
  note: string | null
  completedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface MorningTalk {
  id: string
  talkDate: string
  title: string
  agenda: string | null
  createdByName: string | null
  createdAt: string
  attendees: MorningTalkAttendee[]
  checklistItems: MorningTalkChecklistItem[]
  actionItems: MorningTalkActionItem[]
}

export interface MorningTalkWorkspace {
  talks: MorningTalk[]
  users: MorningTalkUser[]
}
