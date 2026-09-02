import { RoutineQrSheet } from '@/components/routine-qr-sheet'
import { requireFullPageActor } from '@/lib/server/auth'
import { resolveRoutineEquipmentToken } from '@/lib/server/routine-maintenance'
import { headers } from 'next/headers'

export default async function RoutineQrPage({ params }: { params: Promise<{ token: string }> }) {
  await requireFullPageActor()
  const { token } = await params
  const equipment = await resolveRoutineEquipmentToken(token)
  if (!equipment) {
    return <main className="grid min-h-screen place-items-center bg-[#edf4f3] p-5"><section className="max-w-md rounded-2xl border border-[#efc7cc] bg-white p-7 text-center"><h1 className="text-xl font-bold text-[#a83541]">QR นี้ไม่พร้อมใช้งาน</h1><p className="mt-2 text-sm leading-6 text-[#68828a]">ไม่พบเครื่องมือ เครื่องมือถูกเลิกใช้งาน หรือ QR ถูกสร้างใหม่แล้ว</p></section></main>
  }
  const requestHeaders = await headers()
  const host = requestHeaders.get('x-forwarded-host') ?? requestHeaders.get('host') ?? 'localhost:3000'
  const protocol = requestHeaders.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')
  return <main className="min-h-screen bg-[#edf4f3] px-3 py-5 sm:px-5"><RoutineQrSheet equipment={equipment} origin={`${protocol}://${host}`} /></main>
}
