import Link from "next/link";
import { requireFullPageActor } from "@/lib/server/auth";
import { signedUrl } from "@/lib/server/attachments";
import { getEquipmentWorkspace } from "@/lib/server/equipment";
import {
  EQUIPMENT_EVENT_LABELS,
  equipmentStatusLabel,
} from "@/lib/equipment/rules";
import { formatDate, formatDateTime } from "@/lib/bm/rules";

export default async function EquipmentReportPage({
  searchParams,
}: {
  searchParams: Promise<{
    equipmentId?: string;
    eventType?: string;
    from?: string;
    to?: string;
  }>;
}) {
  const actor = await requireFullPageActor();
  const data = await getEquipmentWorkspace(actor);
  const query = await searchParams;
  const equipmentMap = new Map(data.equipment.map((item) => [item.id, item]));
  const records = data.records
    .filter((record) => record.status === "approved")
    .filter(
      (record) =>
        !query.equipmentId || record.equipmentId === query.equipmentId,
    )
    .filter(
      (record) => !query.eventType || record.eventType === query.eventType,
    )
    .filter((record) => !query.from || record.performedOn >= query.from)
    .filter((record) => !query.to || record.performedOn <= query.to);
  const signatureUrls = new Map<string, string>();
  await Promise.all([
    ...records.flatMap((record) =>
      record.attachments
        .filter((item) => item.kind.includes("signature"))
        .map(async (item) => {
          try {
            signatureUrls.set(item.id, await signedUrl(item.id));
          } catch {
            /* keep report available */
          }
        }),
    ),
    ...[
      ...new Set(
        records
          .map((record) => equipmentMap.get(record.equipmentId)?.photos[0]?.id)
          .filter((id): id is string => Boolean(id)),
      ),
    ].map(async (id) => {
      try {
        signatureUrls.set(id, await signedUrl(id));
      } catch {
        /* keep report available */
      }
    }),
  ]);
  return (
    <main className="equipment-report-page">
      <div className="toolbar print-hidden">
        <Link href="/equipment">กลับ Equipment</Link>
        <form method="get" className="report-filter-form">
          <select
            name="equipmentId"
            defaultValue={query.equipmentId ?? ""}
            aria-label="เครื่องมือ"
          >
            <option value="">ทุกเครื่อง</option>
            {data.equipment.map((item) => (
              <option key={item.id} value={item.id}>
                {item.code} · {item.name}
              </option>
            ))}
          </select>
          <select
            name="eventType"
            defaultValue={query.eventType ?? ""}
            aria-label="ประเภทงาน"
          >
            <option value="">ทุกประเภทงาน</option>
            {Object.entries(EQUIPMENT_EVENT_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <input
            type="date"
            name="from"
            defaultValue={query.from ?? ""}
            aria-label="ตั้งแต่วันที่"
          />
          <input
            type="date"
            name="to"
            defaultValue={query.to ?? ""}
            aria-label="ถึงวันที่"
          />
          <button type="submit">กรอง</button>
        </form>
        <button id="print-report" type="button">
          Print / Save PDF
        </button>
      </div>
      <section className="sheet">
        <header className="report-head">
          <div>
            <p className="eyebrow">MOLECULAR-CBH QMS</p>
            <h1>รายงานประวัติเครื่องมือ</h1>
            <p>กลุ่มงานเทคนิคการแพทย์ โรงพยาบาลชลบุรี</p>
          </div>
          <div className="meta">
            <strong>{records.length}</strong>
            <span>รายการ</span>
          </div>
        </header>
        <div className="filters">
          <span>
            เครื่องมือ:{" "}
            {query.equipmentId
              ? (equipmentMap.get(query.equipmentId)?.code ?? "-")
              : "ทั้งหมด"}
          </span>
          <span>
            ประเภท:{" "}
            {query.eventType
              ? (EQUIPMENT_EVENT_LABELS[
                  query.eventType as keyof typeof EQUIPMENT_EVENT_LABELS
                ] ?? query.eventType)
              : "ทั้งหมด"}
          </span>
          <span>
            ช่วงวันที่: {query.from ? formatDate(query.from) : "เริ่มต้น"} –{" "}
            {query.to ? formatDate(query.to) : "ปัจจุบัน"}
          </span>
          <span>พิมพ์เมื่อ: {formatDateTime(new Date().toISOString())}</span>
        </div>
        {records.map((record, index) => {
          const equipment = equipmentMap.get(record.equipmentId);
          const equipmentPhoto = equipment?.photos[0];
          const signatures = record.attachments.filter((item) =>
            item.kind.includes("signature"),
          );
          return (
            <article key={record.id} className="record">
              <div className="record-title">
                {equipmentPhoto && signatureUrls.get(equipmentPhoto.id) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    className="equipment-photo"
                    src={signatureUrls.get(equipmentPhoto.id)}
                    alt={`รูป ${equipment?.name ?? "เครื่องมือ"}`}
                  />
                ) : null}
                <span className="number">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div>
                  <h2>
                    {equipment?.code} · {equipment?.name}
                  </h2>
                  <p>
                    {EQUIPMENT_EVENT_LABELS[record.eventType]} ·{" "}
                    {formatDate(record.performedOn)} · {record.company ?? "-"} /{" "}
                    {record.technicianName}
                  </p>
                  <p>
                    ไฟล์แนบ:{" "}
                    {record.attachments
                      .filter((item) => !item.kind.includes("signature"))
                      .map((item) => item.fileName)
                      .join(", ") || "-"}
                  </p>
                </div>
                <span className={`outcome ${record.outcome}`}>
                  {record.outcome.toUpperCase()}
                </span>
              </div>
              <div className="equipment-line">
                <span>รุ่น: {equipment?.model ?? "-"}</span>
                <span>S/N: {equipment?.serialNumber ?? "-"}</span>
                <span>
                  สถานะหลังงาน: {equipmentStatusLabel(record.returnStatus)}
                </span>
              </div>
              <div className="detail-grid">
                <Detail label="อาการ/ปัญหา" value={record.reportedProblem} />
                <Detail label="ผลตรวจสอบ" value={record.findings} />
                <Detail label="งานที่ดำเนินการ" value={record.actionTaken} />
                <Detail label="อะไหล่ที่เปลี่ยน" value={record.partsReplaced} />
              </div>
              <div className="record-foot">
                <div>
                  <p>เลขที่ใบงาน: {record.jobNumber ?? "-"}</p>
                  <p>ผู้รับงาน: {record.receiverName ?? "-"}</p>
                  <p>
                    ตรวจรับเมื่อ:{" "}
                    {record.reviewedAt
                      ? formatDateTime(record.reviewedAt)
                      : "-"}
                  </p>
                </div>
                <div className="signatures">
                  {signatures.map((item) => (
                    <figure key={item.id}>
                      {signatureUrls.get(item.id) ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={signatureUrls.get(item.id)} alt="ลายเซ็น" />
                      ) : (
                        <div className="signature-missing">ไม่พบภาพ</div>
                      )}
                      <figcaption>
                        {item.kind === "technician-signature"
                          ? "ลายเซ็นช่าง"
                          : "ลายเซ็นผู้รับงาน"}
                      </figcaption>
                    </figure>
                  ))}
                </div>
              </div>
            </article>
          );
        })}
        {!records.length ? (
          <p className="empty">ไม่มีประวัติที่ตรงกับตัวกรอง</p>
        ) : null}
        <footer>
          เอกสารจากระบบ Molecular-CBH QMS · ประวัติที่ Voided หรือ Rejected
          ไม่รวมในรายงานทางการ
        </footer>
      </section>
      <script
        dangerouslySetInnerHTML={{
          __html:
            "document.getElementById('print-report')?.addEventListener('click',()=>window.print())",
        }}
      />
      <style>{`
    @page { size: A4 portrait; margin: 10mm; }
    body { background:#e9eef0; font-family:'Noto Sans Thai',sans-serif; color:#173d50; }
    .equipment-report-page { padding:24px; }
    .toolbar { max-width:210mm; margin:0 auto 14px; display:flex; flex-wrap:wrap; gap:8px; justify-content:space-between; align-items:center; }
    .report-filter-form { display:flex; flex:1; flex-wrap:wrap; justify-content:center; gap:6px; }
    .report-filter-form select,.report-filter-form input { min-height:34px; border:1px solid #bfd0d2; background:white; color:#17434d; padding:5px 7px; border-radius:6px; }
    .toolbar a,.toolbar button { border:1px solid #bfd0d2; background:white; color:#17434d; padding:8px 12px; border-radius:6px; font-weight:700; }
    .sheet { box-sizing:border-box; max-width:210mm; min-height:297mm; margin:auto; background:white; padding:14mm; box-shadow:0 18px 50px #173d5020; }
    .report-head { display:flex; justify-content:space-between; border-bottom:3px solid #0b7f76; padding-bottom:12px; }
    .eyebrow { color:#0b7f76; font-weight:800; letter-spacing:.16em; font-size:10px; }
    h1 { font-size:26px; margin:4px 0; } .report-head p { margin:0; font-size:12px; color:#68828a; }
    .meta { width:64px;height:64px;border-radius:12px;background:#e8f7f5;display:grid;place-content:center;text-align:center;color:#0b7f76; }.meta strong{font-size:22px}.meta span{font-size:9px}
    .filters { margin:12px 0; display:grid;grid-template-columns:1fr 1fr;gap:5px 16px;padding:10px;background:#f5f9f9;font-size:10px;color:#55727c; }
    .record { break-inside:avoid; border:1px solid #cfdee0; border-radius:8px; margin:10px 0; overflow:hidden; }
    .record-title { display:flex;gap:10px;align-items:center;padding:10px;background:#f8fbfb; }.record-title h2{font-size:14px;margin:0}.record-title p{font-size:10px;color:#68828a;margin:2px 0 0}.number{font:700 11px monospace;color:#0b7f76}.outcome{margin-left:auto;font-size:9px;font-weight:800;padding:3px 6px;border-radius:999px;background:#edf3f3}.outcome.fail{background:#fff1f2;color:#b33b46}.outcome.conditional{background:#fff8e8;color:#a76511}.outcome.pass{background:#eef9f1;color:#2f7d44}
    .equipment-photo{width:54px;height:42px;object-fit:cover;border-radius:5px;border:1px solid #cfdee0}
    .equipment-line{display:flex;gap:18px;padding:7px 10px;border-top:1px solid #e7eeee;border-bottom:1px solid #e7eeee;font-size:9px;color:#58747d}.detail-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:10px}.detail label{display:block;font-size:8px;font-weight:800;letter-spacing:.08em;color:#789097;text-transform:uppercase}.detail p{font-size:10px;white-space:pre-wrap;margin:2px 0}.record-foot{display:flex;justify-content:space-between;gap:15px;padding:10px;border-top:1px solid #e7eeee;font-size:9px}.record-foot p{margin:2px 0}.signatures{display:flex;gap:8px}.signatures figure{margin:0;text-align:center}.signatures img,.signature-missing{width:90px;height:42px;object-fit:contain;border-bottom:1px solid #789097}.signatures figcaption{font-size:8px;margin-top:2px}.empty{text-align:center;padding:60px;color:#789097}footer{margin-top:16px;border-top:1px solid #cfdee0;padding-top:8px;font-size:8px;color:#789097;text-align:center}
    @media print { body{background:white}.equipment-report-page{padding:0}.print-hidden{display:none!important}.sheet{box-shadow:none;margin:0;max-width:none;min-height:auto;padding:0} }
  `}</style>
    </main>
  );
}

function Detail({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="detail">
      <label>{label}</label>
      <p>{value || "-"}</p>
    </div>
  );
}
