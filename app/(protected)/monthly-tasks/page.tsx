import { MonthlyTasksView } from '@/components/monthly-tasks-view'
import { todayBangkok } from '@/lib/bm/rules'
import { requireFullPageActor } from '@/lib/server/auth'
import { getMonthlyTaskWorkspace } from '@/lib/server/monthly-tasks'

export default async function MonthlyTasksPage() {
  const actor = await requireFullPageActor()
  const month = todayBangkok().slice(0, 7)
  return <MonthlyTasksView actor={actor} initialData={await getMonthlyTaskWorkspace(month)} />
}
