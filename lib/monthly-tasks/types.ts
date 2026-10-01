import type { BmRole } from '@/lib/bm/types'

export interface MonthlyTaskUser {
  id: string
  ephisId: string
  displayName: string
  role: BmRole
}

export interface MonthlyTaskTemplate {
  id: string
  title: string
  assigneeId: string
  assigneeName: string
  dueDay: number
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface MonthlyTask {
  id: string
  templateId: string
  title: string
  assigneeId: string
  assigneeName: string
  deadline: string
  isCompleted: boolean
  completedAt: string | null
  completedByName: string | null
  createdAt: string
  updatedAt: string
}

export interface MonthlyTaskWorkspace {
  month: string
  monthLabel: string
  templates: MonthlyTaskTemplate[]
  tasks: MonthlyTask[]
  users: MonthlyTaskUser[]
  totalCount: number
  completedCount: number
  openCount: number
  overdueCount: number
}
