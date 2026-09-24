import { RoutineMaintenance } from '@/components/routine-maintenance'
import { requireFullPageActor } from '@/lib/server/auth'
import { resolveRoutineEquipmentToken } from '@/lib/server/routine-maintenance'
import { equipmentArchiveModeEnabled, portalEquipmentUrl } from '@/lib/server/equipment-archive'
import { redirect } from 'next/navigation'

export default async function RoutineMaintenanceQrPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const equipment = await resolveRoutineEquipmentToken(token)
  if (equipmentArchiveModeEnabled()) {
    const portalUrl = equipment?.portalEquipmentId ? portalEquipmentUrl(equipment.portalEquipmentId) : null
    if (portalUrl) redirect(portalUrl)
    return <main className="grid min-h-screen place-items-center bg-[#edf4f3] p-5"><section className="max-w-md rounded-2xl border border-[#dfc98c] bg-white p-7 text-center"><h1 className="text-xl font-bold text-[#173d50]">ย้ายการบันทึก Routine ไปที่ Portal</h1><p className="mt-2 text-sm leading-6 text-[#55717a]">รายการนี้ยังไม่มีรหัสเชื่อมโยงกับ Portal กรุณาติดต่อผู้ดูแลระบบ</p></section></main>
  }
  const actor = await requireFullPageActor()
  if (!equipment) {
    return <main className="grid min-h-screen place-items-center bg-[#edf4f3] p-5"><section className="max-w-md rounded-2xl border border-[#efc7cc] bg-white p-7 text-center"><h1 className="text-xl font-bold text-[#a83541]">QR นี้ไม่พร้อมใช้งาน</h1><p className="mt-2 text-sm leading-6 text-[#68828a]">ไม่พบเครื่องมือ เครื่องมือถูกเลิกใช้งาน หรือ QR ถูกสร้างใหม่แล้ว</p></section></main>
  }
  return <main className="min-h-screen bg-[#edf4f3] px-3 py-5 sm:px-5"><div className="mx-auto max-w-5xl"><RoutineMaintenance actor={actor} token={token} /></div></main>
}
