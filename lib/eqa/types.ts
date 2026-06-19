export type EqaRoundStatus = 'scheduled' | 'received' | 'submitted' | 'evaluated' | 'closed'
export type EqaOutcome = 'acceptable' | 'warning' | 'unacceptable' | 'not-evaluated'

export interface EqaProvider {
  id: string
  name: string
  isActive: boolean
}

export interface EqaScheme {
  id: string
  providerId: string
  providerName: string
  name: string
  code: string | null
  analyteScope: string | null
  roundsPerYear: number | null
  isActive: boolean
}

export interface EqaResult {
  id: string
  roundId: string
  analyte: string
  submittedValue: string | null
  evaluationScore: number | null
  outcome: EqaOutcome
}

export interface EqaRound {
  id: string
  schemeId: string
  schemeName: string
  providerName: string
  roundLabel: string
  sampleReceivedDate: string | null
  resultDueDate: string | null
  submissionDate: string | null
  status: EqaRoundStatus
  note: string | null
  results: EqaResult[]
  dueInDays: number | null
  reminder: 'overdue' | 'due-soon' | null
}

export interface EqaCorrectiveAction {
  id: string
  roundId: string
  roundLabel: string
  problem: string
  rootCause: string | null
  actionTaken: string | null
  status: 'open' | 'closed'
  createdByName: string | null
  createdAt: string
  closedByName: string | null
  closedAt: string | null
}

export interface EqaWorkspace {
  providers: EqaProvider[]
  schemes: EqaScheme[]
  rounds: EqaRound[]
  correctiveActions: EqaCorrectiveAction[]
  summary: {
    schemeCount: number
    overdue: number
    dueSoon: number
    unacceptable: number
    openCorrectiveActions: number
  }
}

// Days-out threshold for the "due soon" reminder.
export const EQA_DUE_SOON_DAYS = 30
