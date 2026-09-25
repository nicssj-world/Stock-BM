import Link from 'next/link'
import type { EquipmentWorkspace } from '@/lib/equipment/types'
import { formatDate } from '@/lib/bm/rules'
import { portalEquipmentUrl } from '@/lib/server/equipment-archive'

export function EquipmentArchiveView({ workspace }: { workspace: EquipmentWorkspace }) {
  const equipmentById = new Map(workspace.equipment.map((item) => [item.id, item]))
  const equipmentPortalUrls = new Map(workspace.equipment.map((item) => [item.id,
    item.portalEquipmentId ? portalEquipmentUrl(item.portalEquipmentId) : null]))
  const records = [...workspace.records].sort((a, b) => b.performedOn.localeCompare(a.performedOn))
  const portalUrl = portalEquipmentUrl()

  return <main className="mx-auto min-h-screen max-w-7xl space-y-6 bg-[#edf4f3] px-4 py-6 sm:px-6 lg:px-8">
    <header>
      <p className="text-sm font-bold text-[#0b7f76]">Molecular-CBH QMS</p>
      <h1 className="mt-1 text-2xl font-bold text-[#173d50] sm:text-3xl">ประวัติเครื่องมือ · คลังอ่านอย่างเดียว</h1>
    </header>

    <section role="status" className="rounded-2xl border border-[#dfc98c] bg-[#fff9e9] p-4 text-[#624b13] sm:p-5">
      <h2 className="font-bold">ส่วนเครื่องมือใน Stock-BM ปิดการบันทึกแล้ว</h2>
      <p className="mt-1 text-sm leading-6">ดูประวัติเดิมได้ที่หน้านี้ หากต้องการบันทึกงานหรือ Routine Maintenance ให้ดำเนินการใน Equipment Hub บน Portal</p>
      {portalUrl ? <Link className="mt-3 inline-flex min-h-11 items-center rounded-xl bg-[#0b7f76] px-4 font-bold text-white focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#173d50]" href={portalUrl}>เปิด Equipment Hub ใน Portal</Link> : <p className="mt-2 text-sm">ยังไม่มีลิงก์ Portal กรุณาติดต่อผู้ดูแลระบบ</p>}
      <nav aria-label="รายงานประวัติเครื่องมือ" className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm font-bold">
        <Link className="inline-flex min-h-11 items-center text-[#08766f] underline underline-offset-4 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#173d50]" href="/equipment/report">รายงานประวัติงานช่าง</Link>
        <Link className="inline-flex min-h-11 items-center text-[#08766f] underline underline-offset-4 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#173d50]" href="/equipment/routine/report">รายงาน Routine Maintenance</Link>
      </nav>
    </section>

    <section className="space-y-3" aria-labelledby="equipment-archive-list">
      <h2 id="equipment-archive-list" className="text-lg font-bold text-[#173d50]">ทะเบียนเครื่องมือ ({workspace.equipment.length})</h2>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {workspace.equipment.map((item) => <article key={item.id} className="rounded-2xl border border-[#d7e4e4] bg-white p-4 shadow-sm">
          <p className="text-xs font-bold text-[#0b7f76]">{item.code}</p>
          <h3 className="mt-1 font-bold text-[#173d50]">{item.name}</h3>
          <p className="mt-1 text-sm text-[#55717a]">{[item.manufacturer, item.model, item.serialNumber].filter(Boolean).join(' · ') || 'ไม่มีรายละเอียดรุ่น'}</p>
          <p className="mt-2 text-xs text-[#718a91]">{item.location || 'ไม่ระบุสถานที่'} · {item.status === 'active' ? 'ใช้งาน' : item.status === 'maintenance' ? 'ซ่อมบำรุง' : item.status === 'out_of_service' ? 'งดใช้งาน' : 'เลิกใช้งาน'}</p>
          {equipmentPortalUrls.get(item.id)
            ? <a className="mt-3 inline-flex min-h-11 items-center font-bold text-[#08766f] underline underline-offset-4 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#173d50]" href={equipmentPortalUrls.get(item.id) ?? undefined}>เปิดเครื่องมือนี้ใน Portal</a>
            : <p className="mt-3 text-xs text-[#8b6d29]">{item.portalEquipmentId ? 'ไม่พบ URL สำหรับเปิด Portal' : 'ยังไม่ได้เชื่อมกับรายการเครื่องมือใน Portal'}</p>}
        </article>)}
        {!workspace.equipment.length ? <p className="rounded-xl border border-[#d7e4e4] bg-white p-5 text-sm text-[#55717a]">ไม่มีรายการเครื่องมือ</p> : null}
      </div>
    </section>

    <section className="space-y-3" aria-labelledby="equipment-archive-history">
      <h2 id="equipment-archive-history" className="text-lg font-bold text-[#173d50]">ประวัติงานช่าง ({records.length})</h2>
      <div className="space-y-3">
        {records.map((record) => {
          const item = equipmentById.get(record.equipmentId)
          return <article key={record.id} className="rounded-2xl border border-[#d7e4e4] bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div><p className="text-xs font-bold text-[#0b7f76]">{item?.code ?? record.equipmentSnapshot?.code ?? 'เครื่องมือ'}</p><h3 className="mt-1 font-bold text-[#173d50]">{item?.name ?? record.equipmentSnapshot?.name ?? 'งานบริการ'}</h3></div>
              <span className="rounded-full bg-[#eef4f4] px-3 py-1 text-xs font-bold text-[#496970]">{record.status === 'approved' ? 'ตรวจรับแล้ว' : record.status === 'pending' ? 'รอตรวจรับ' : record.status === 'rejected' ? 'ถูกส่งกลับ' : 'ยกเลิก'}</span>
            </div>
            <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
              <div><dt className="text-xs text-[#718a91]">วันที่ทำงาน · ประเภท</dt><dd className="font-medium text-[#315763]">{formatDate(record.performedOn)} · {record.eventType}</dd></div>
              <div><dt className="text-xs text-[#718a91]">ช่าง</dt><dd className="font-medium text-[#315763]">{record.technicianName}{record.company ? ` · ${record.company}` : ''}</dd></div>
              <div className="sm:col-span-2"><dt className="text-xs text-[#718a91]">ผลการตรวจและการดำเนินการ</dt><dd className="whitespace-pre-wrap font-medium text-[#315763]">{record.findings || record.actionTaken}</dd></div>
            </dl>
          </article>
        })}
        {!records.length ? <p className="rounded-xl border border-[#d7e4e4] bg-white p-5 text-sm text-[#55717a]">ไม่มีประวัติงานช่าง</p> : null}
      </div>
    </section>
  </main>
}
