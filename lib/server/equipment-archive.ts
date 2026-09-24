import { respond } from '@/lib/server/route'
import { HttpError } from '@/lib/server/errors'

export function equipmentArchiveModeEnabled() {
  return process.env.EQUIPMENT_ARCHIVE_MODE === '1'
}

export function portalEquipmentUrl(equipmentId?: string | null) {
  const base = process.env.PORTAL_PUBLIC_BASE_URL?.trim()
  if (!base) return null
  try {
    const normalizedBase = `${base.replace(/\/+$/, '')}/`
    return new URL(equipmentId ? `e/${encodeURIComponent(equipmentId)}` : 'staff/equipment', normalizedBase).toString()
  } catch {
    return null
  }
}

export async function respondEquipmentWrite<T>(handler: () => Promise<T>) {
  if (equipmentArchiveModeEnabled()) {
    return Response.json({
      error: 'ส่วนเครื่องมือใน Stock-BM อยู่ในโหมดอ่านอย่างเดียว กรุณาดำเนินการต่อใน Portal',
      portalUrl: portalEquipmentUrl(),
    }, { status: 410 })
  }
  return respond(handler)
}

export function assertEquipmentWriteAllowed() {
  if (!equipmentArchiveModeEnabled()) return
  const portalUrl = portalEquipmentUrl()
  throw new HttpError(410, portalUrl
    ? `ส่วนเครื่องมือใน Stock-BM เป็นคลังอ่านอย่างเดียว กรุณาดำเนินการต่อที่ ${portalUrl}`
    : 'ส่วนเครื่องมือใน Stock-BM เป็นคลังอ่านอย่างเดียว กรุณาดำเนินการต่อใน Portal')
}
