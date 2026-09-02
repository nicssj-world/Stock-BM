"use client";

import Link from "next/link";
import { useState } from "react";
import { Printer } from "lucide-react";
import type { Equipment } from "@/lib/equipment/types";
import { QrCode } from "@/components/qr-code";
import { Button, PageHeader } from "@/components/ui";

export function EquipmentQrSheet({
  equipment,
  origin,
}: {
  equipment: Equipment[];
  origin: string;
}) {
  const printable = equipment.filter(
    (item) => item.status !== "decommissioned",
  );
  const [selectedIds, setSelectedIds] = useState(
    () => new Set(printable.map((item) => item.id)),
  );
  function toggle(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="print:hidden">
        <PageHeader
          eyebrow="Equipment"
          title="พิมพ์ QR เครื่องมือ"
          description="พิมพ์ QR ช่างและ QR Routine Maintenance แยกตามเครื่องมือ"
          actions={
            <div className="flex gap-2">
              <Link href="/equipment">
                <Button variant="secondary">กลับ</Button>
              </Link>
              <Button
                disabled={!selectedIds.size}
                onClick={() => window.print()}
              >
                <Printer className="size-4" /> พิมพ์
              </Button>
            </div>
          }
        />
      </div>
      <div className="print:hidden flex flex-wrap items-center gap-2 rounded-xl border border-[#d5e4e4] bg-white p-3 text-sm text-[#315763]">
        <strong>
          เลือก QR ที่ต้องการพิมพ์ ({selectedIds.size}/{printable.length})
        </strong>
        <Button
          type="button"
          variant="ghost"
          onClick={() =>
            setSelectedIds(new Set(printable.map((item) => item.id)))
          }
        >
          เลือกทั้งหมด
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => setSelectedIds(new Set())}
        >
          ล้างทั้งหมด
        </Button>
        <div className="basis-full grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {printable.map((item) => (
            <label
              key={item.id}
              className="flex cursor-pointer items-center gap-2 rounded border border-[#e0eaea] px-2 py-1.5 text-xs"
            >
              <input
                type="checkbox"
                checked={selectedIds.has(item.id)}
                onChange={() => toggle(item.id)}
              />{" "}
              {item.code} · {item.name}
            </label>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 print:grid-cols-3 sm:grid-cols-2 lg:grid-cols-3">
        {printable
          .filter((item) => selectedIds.has(item.id))
          .map((item) => (
            <section
              key={item.id}
              className="break-inside-avoid rounded-xl border-2 border-[#173d50] bg-white p-4 text-center"
            >
              <p className="text-[10px] font-bold tracking-[.16em] text-[#0b7f76] uppercase">
                Chonburi Hospital
              </p>
              <h2 className="mt-2 text-lg font-bold text-[#173d50]">
                {item.name}
              </h2>
              <p className="mono mt-1 text-sm font-bold text-[#315763]">
                {item.code}
              </p>
              <div className="mx-auto mt-3 flex w-full max-w-[220px] flex-col gap-4">
                <div className="flex flex-col items-center rounded-lg border border-[#d7e3e5] bg-[#f8fbfa] p-3">
                  <p className="mb-1 text-[11px] font-bold text-[#0b7f76]">QR ช่าง</p>
                  {origin ? (
                    <a href={`/service/equipment/${item.qrToken}`} target="_blank" rel="noreferrer" title={`เปิด QR ช่างของ ${item.name}`}>
                      <QrCode value={`${origin}/service/equipment/${item.qrToken}`} size={180} />
                    </a>
                  ) : (
                    <div className="size-[180px]" />
                  )}
                  <p className="mt-1 text-[10px] leading-4 text-[#58747d]">ซ่อม / PM / Calibration</p>
                </div>
                <div className="flex flex-col items-center rounded-lg border border-[#d7e3e5] bg-[#f8fbfa] p-3">
                  <p className="mb-1 text-[11px] font-bold text-[#0b7f76]">QR Routine</p>
                  {origin ? (
                    <a href={`/equipment/routine/${item.qrToken}`} target="_blank" rel="noreferrer" title={`เปิด QR Routine ของ ${item.name}`}>
                      <QrCode value={`${origin}/equipment/routine/${item.qrToken}`} size={180} />
                    </a>
                  ) : (
                    <div className="size-[180px]" />
                  )}
                  <p className="mt-1 text-[10px] leading-4 text-[#58747d]">Checklist Routine</p>
                </div>
              </div>
              <p className="mt-1 text-[10px] text-[#8ba0a5]">
                {item.model ?? "-"} · S/N {item.serialNumber ?? "-"}
              </p>
            </section>
          ))}
      </div>
    </div>
  );
}
