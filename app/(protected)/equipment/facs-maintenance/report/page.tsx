import { redirect } from 'next/navigation'
import { requireFullPageActor } from '@/lib/server/auth'

export default async function FacsMaintenanceReportCompatibilityPage({ searchParams }: { searchParams: Promise<{ frequency?: string; month?: string; year?: string }> }) {
  await requireFullPageActor()
  const query = await searchParams
  const params = new URLSearchParams()
  if (query.frequency) params.set('frequency', query.frequency)
  if (query.frequency === 'daily' && query.month) params.set('period', query.month)
  if (query.frequency === 'monthly' && query.year) params.set('period', query.year)
  redirect(`/equipment/routine/report?${params.toString()}`)
}
