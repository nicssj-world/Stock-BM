import { EquipmentPublicForm } from '@/components/equipment-public-form'
import { resolvePublicEquipment } from '@/lib/server/equipment'

export default async function PublicEquipmentServicePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const context = await resolvePublicEquipment(token)
  if (!context) return <main className="grid min-h-screen place-items-center bg-[#edf4f3] p-5"><section className="max-w-md rounded-2xl border border-[#efc7cc] bg-white p-7 text-center"><h1 className="text-xl font-bold text-[#a83541]">QR นี้ไม่พร้อมใช้งาน</h1><p className="mt-2 text-sm leading-6 text-[#68828a]">ไม่พบเครื่องมือ เครื่องมือถูกเลิกใช้งาน หรือ QR ถูกสร้างใหม่แล้ว กรุณาติดต่อห้องปฏิบัติการ</p></section></main>
  return <EquipmentPublicForm token={token} context={context} />
}
