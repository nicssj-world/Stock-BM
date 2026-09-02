"use client";

import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import NextImage from "next/image";
import { useSearchParams } from "next/navigation";
import {
  Activity,
  Building2,
  CalendarClock,
  ClipboardCheck,
  ExternalLink,
  FileClock,
  History,
  Link2,
  Plus,
  Pencil,
  Phone,
  Printer,
  QrCode,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Stethoscope,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import type { BmActor } from "@/lib/bm/types";
import { formatDate, formatDateTime, todayBangkok } from "@/lib/bm/rules";
import {
  EQUIPMENT_EVENT_LABELS,
  EQUIPMENT_PLAN_TYPES,
  endOfEquipmentDueMonth,
  equipmentStatusLabel,
  equipmentDueMonthInput,
  formatEquipmentDueMonth,
} from "@/lib/equipment/rules";
import { equipmentClassificationOptions } from "@/lib/equipment/classifications";
import type {
  Equipment,
  EquipmentEventType,
  EquipmentPlan,
  EquipmentPlanType,
  EquipmentServiceRecord,
  EquipmentStatus,
  EquipmentWorkspace,
} from "@/lib/equipment/types";
import { AttachmentList } from "@/components/attachments";
import { RoutineMaintenance } from "@/components/routine-maintenance";
import { SignaturePad, type SignaturePadHandle } from "@/components/signature-pad";
import {
  api,
  Button,
  Card,
  Field,
  Input,
  Notice,
  PageHeader,
  Select,
  StatCard,
  StatusBadge,
  Tabs,
  Textarea,
} from "@/components/ui";

type Tab = "overview" | "registry" | "plans" | "history" | "pending";
type NoticeState = {
  tone: "success" | "danger" | "warning";
  text: string;
} | null;
const tabs = [
  { key: "overview" as const, label: "ภาพรวม", icon: Activity },
  { key: "registry" as const, label: "เครื่องมือ", icon: Stethoscope },
  { key: "plans" as const, label: "แผนงาน", icon: CalendarClock },
  { key: "history" as const, label: "ประวัติงาน", icon: History },
  { key: "pending" as const, label: "รอตรวจรับ", icon: ClipboardCheck },
];

export function EquipmentView({
  actor,
  initialData,
  historyPrintedAt,
}: {
  actor: BmActor;
  initialData: EquipmentWorkspace;
  historyPrintedAt?: string;
}) {
  const searchParams = useSearchParams();
  const requestedView = searchParams.get("view");
  const [workspace, setWorkspace] = useState(initialData);
  const [tab, setTab] = useState<Tab>(
    requestedView && tabs.some((item) => item.key === requestedView)
      ? (requestedView as Tab)
      : "overview",
  );
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<NoticeState>(null);
  async function mutate(url: string, options: RequestInit, success: string) {
    setBusy(true);
    setNotice(null);
    try {
      const result = await api<{ workspace: EquipmentWorkspace }>(url, options);
      setWorkspace(result.workspace);
      setNotice({ tone: "success", text: success });
      return true;
    } catch (error) {
      // Pull the failed run back into the status card so a previous success
      // is not left visible after a new Sync attempt fails.
      await refreshWorkspace()
      setNotice({
        tone: "danger",
        text: error instanceof Error ? error.message : "บันทึกไม่สำเร็จ",
      });
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function refreshWorkspace() {
    try {
      const result = await api<{ workspace: EquipmentWorkspace }>(
        "/api/equipment/workspace",
      );
      setWorkspace(result.workspace);
    } catch {
      // The attachment list has already refreshed itself; keep the current
      // workspace if its supplemental refresh is temporarily unavailable.
    }
  }
  return (
    <div className="mx-auto max-w-[1600px] space-y-5">
      <PageHeader
        eyebrow="Clinical asset control"
        title="เครื่องมือ / Equipment"
        description="ทะเบียนเครื่องมือ แผน PM/Calibration ประวัติซ่อม และการตรวจรับงานช่างจาก QR"
        actions={
          <div className="flex gap-2">
            <Link href="/equipment/qr">
              <Button variant="secondary">
                <QrCode className="size-4" /> พิมพ์ QR
              </Button>
            </Link>
            <Link href="/equipment/report">
              <Button variant="secondary">
                <Printer className="size-4" /> รายงาน
              </Button>
            </Link>
          </div>
        }
      />
      {notice ? <Notice tone={notice.tone}>{notice.text}</Notice> : null}
      <div className="overflow-x-auto pb-1">
        <Tabs tabs={tabs} active={tab} onChange={setTab} />
      </div>
      {tab === "overview" ? (
        <Overview workspace={workspace} onTab={setTab} />
      ) : null}
      {tab === "registry" ? (
        <Registry
          actor={actor}
          workspace={workspace}
          busy={busy}
          mutate={mutate}
          onAttachmentsChanged={refreshWorkspace}
        />
      ) : null}
      {tab === "plans" ? (
        <Plans
          actor={actor}
          workspace={workspace}
          busy={busy}
          mutate={mutate}
        />
      ) : null}
      {tab === "history" ? (
        <WorkHistory
          actor={actor}
          workspace={workspace}
          busy={busy}
          mutate={mutate}
          printedAt={historyPrintedAt}
        />
      ) : null}
      {tab === "pending" ? (
        <Pending workspace={workspace} busy={busy} mutate={mutate} />
      ) : null}
    </div>
  );
}

function Overview({
  workspace,
  onTab,
}: {
  workspace: EquipmentWorkspace;
  onTab: (tab: Tab) => void;
}) {
  const { dashboard } = workspace;
  const attention = workspace.plans
    .filter((plan) => plan.isActive && plan.dueState !== "normal")
    .slice(0, 8);
  const pending = workspace.records
    .filter((record) => record.status === "pending")
    .slice(0, 6);
  const equipmentMap = new Map(
    workspace.equipment.map((item) => [item.id, item]),
  );
  return (
    <div className="space-y-4">
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-3 2xl:grid-cols-6">
        <StatCard
          label="พร้อมใช้งาน"
          value={dashboard.active}
          tone="accepted"
        />
        <StatCard
          label="อยู่ระหว่างซ่อม"
          value={dashboard.maintenance}
          tone="warning"
        />
        <StatCard
          label="หยุดใช้งาน"
          value={dashboard.outOfService}
          tone="rejected"
        />
        <StatCard
          label="ใกล้ครบกำหนด"
          value={dashboard.dueSoon}
          tone="warning"
        />
        <StatCard label="เกินกำหนด" value={dashboard.overdue} tone="rejected" />
        <StatCard label="รอตรวจรับ" value={dashboard.pending} tone="warning" />
      </section>
      <div className="grid gap-4 xl:grid-cols-2">
        <AttentionCard
          title="แผนที่ต้องดำเนินการ"
          icon={<CalendarClock />}
          count={attention.length}
          onClick={() => onTab("plans")}
        >
          {attention.map((plan) => (
            <div
              key={plan.id}
              className="flex items-center gap-3 border-t border-[#edf2f2] px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <strong className="block truncate text-sm text-[#173d50]">
                  {equipmentMap.get(plan.equipmentId)?.code} · {plan.title}
                </strong>
                <p className="mt-1 text-xs text-[#789097]">
                  กำหนด {formatEquipmentDueMonth(plan.nextDueOn)}
                </p>
              </div>
              <DueBadge plan={plan} />
            </div>
          ))}
          {!attention.length ? (
            <Empty text="ไม่มีแผนใกล้หรือเกินกำหนด" />
          ) : null}
        </AttentionCard>
        <AttentionCard
          title="แบบฟอร์มช่างรอตรวจรับ"
          icon={<ClipboardCheck />}
          count={pending.length}
          onClick={() => onTab("pending")}
        >
          {pending.map((record) => (
            <div
              key={record.id}
              className="flex items-center gap-3 border-t border-[#edf2f2] px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <strong className="block truncate text-sm text-[#173d50]">
                  {equipmentMap.get(record.equipmentId)?.code} ·{" "}
                  {record.technicianName}
                </strong>
                <p className="mt-1 text-xs text-[#789097]">
                  {EQUIPMENT_EVENT_LABELS[record.eventType]} ·{" "}
                  {formatDate(record.performedOn)}
                </p>
              </div>
              <StatusBadge tone="warning" label="รอตรวจรับ" />
            </div>
          ))}
          {!pending.length ? <Empty text="ไม่มีรายการรอตรวจรับ" /> : null}
        </AttentionCard>
      </div>
    </div>
  );
}

function AttentionCard({
  title,
  icon,
  count,
  onClick,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  count: number;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Card className="overflow-hidden">
      <button
        type="button"
        onClick={onClick}
        className="flex w-full items-center gap-2 bg-[#fbfdfd] px-4 py-3 text-left text-sm font-bold text-[#173d50] hover:bg-[#f3f8f8]"
      >
        <span className="text-[#0b7f76] [&>svg]:size-4">{icon}</span>
        {title}
        <span className="mono ml-auto rounded-full bg-[#e9f4f3] px-2 py-0.5 text-xs text-[#0b7f76]">
          {count}
        </span>
      </button>
      {children}
    </Card>
  );
}

function SyncControl({
  actor,
  workspace,
  busy,
  mutate,
}: {
  actor: BmActor;
  workspace: EquipmentWorkspace;
  busy: boolean;
  mutate: Mutate;
}) {
  const [labCode, setLabCode] = useState("");
  const lastRun = workspace.sync.lastRun;
  const linkedCount = workspace.equipment.filter(
    (item) => item.portalEquipmentId,
  ).length;
  async function lookup(event: React.FormEvent) {
    event.preventDefault();
    const code = labCode.trim();
    if (!code) return;
    const ok = await mutate(
      "/api/equipment/sync",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ labCode: code }),
      },
      "ดึงข้อมูลเครื่องมือจาก Portal สำเร็จ",
    );
    if (ok) setLabCode("");
  }
  return (
    <Card className="overflow-hidden border-[#cfe4e1]">
      <div className="flex flex-col gap-4 bg-[#f1faf8] p-4">
        <div className="flex min-w-0 gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-[#d9f1ed] text-[#0b7f76]">
            <RefreshCw className="size-5" aria-hidden="true" />
          </span>
          <div>
            <h2 className="font-bold text-[#173d50]">เครื่องมือ</h2>
            <p className="mt-1 text-xs leading-5 text-[#58747d]">
              ข้อมูลหลักจาก Portal · แสดงเฉพาะ งานอณูชีววิทยา และงานตรวจพิเศษและห้องปฏิบัติการตรวจต่อ
            </p>
          </div>
        </div>
        <form onSubmit={lookup} className="flex w-full min-w-0 flex-col gap-2 sm:flex-row">
          <Input
            value={labCode}
            onChange={(event) => setLabCode(event.target.value.toUpperCase())}
            placeholder="LAB-BM-15-002"
            aria-label="รหัส LAB จาก Portal"
            disabled={busy || actor.role === "Assistant"}
            className="min-h-10 flex-1 font-mono text-sm"
          />
          <Button
            type="submit"
            variant="secondary"
            className="shrink-0 whitespace-nowrap"
            disabled={busy || actor.role === "Assistant" || !labCode.trim()}
          >
            <RefreshCw className={`size-4 ${busy ? "animate-spin" : ""}`} aria-hidden="true" />
            ดึงข้อมูลจาก Portal
          </Button>
        </form>
      </div>
      <div className="grid gap-3 border-t border-[#dcebea] p-4 text-xs text-[#58747d] sm:grid-cols-3">
        <div>
          <p className="font-semibold text-[#8ba0a5]">รายการที่เชื่อมแล้ว</p>
          <p className="mono mt-1 text-base font-bold text-[#173d50]">{linkedCount}</p>
        </div>
        <div>
          <p className="font-semibold text-[#8ba0a5]">Sync ล่าสุด</p>
          <p className="mt-1 font-semibold text-[#315763]">
            {lastRun?.finishedAt ? formatDateTime(lastRun.finishedAt) : "ยังไม่เคย Sync"}
          </p>
        </div>
        <div>
          <p className="font-semibold text-[#8ba0a5]">สถานะ</p>
          <p className="mt-1 font-semibold text-[#315763]">
            {lastRun?.status === "succeeded"
              ? lastRun.createdCount > 0
                ? "เพิ่มเครื่องมือสำเร็จ"
                : lastRun.updatedCount > 0
                  ? "อัปเดตข้อมูลสำเร็จ"
                  : "Sync สำเร็จ"
              : lastRun?.status === "failed"
                ? "ไม่สำเร็จ · ข้อมูลเดิมยังคงอยู่"
                : lastRun?.status === "running"
                  ? "กำลังดำเนินการ"
                  : "รอ Sync ครั้งแรก"}
          </p>
        </div>
      </div>
      {lastRun?.status === "failed" && lastRun.errorMessage ? (
        <div className="border-t border-[#f0d7d9] bg-[#fff7f7] px-4 py-2 text-xs text-[#a83541]">
          <span className="font-semibold">ผลจากการ Sync ครั้งล่าสุด:</span> {lastRun.errorMessage}
        </div>
      ) : null}
    </Card>
  );
}

const emptyTechnicianForm = {
  technicianName: "",
  company: "",
  phone: "",
};
function Registry({
  actor,
  workspace,
  busy,
  mutate,
  onAttachmentsChanged,
}: {
  actor: BmActor;
  workspace: EquipmentWorkspace;
  busy: boolean;
  mutate: Mutate;
  onAttachmentsChanged: () => Promise<void>;
}) {
  const requestedEquipment = useSearchParams().get("equipment");
  const [search, setSearch] = useState("");
  const [classification, setClassification] = useState("");
  const [selectedId, setSelectedId] = useState(
    requestedEquipment &&
      workspace.equipment.some((item) => item.id === requestedEquipment)
      ? requestedEquipment
      : (workspace.equipment[0]?.id ?? ""),
  );
  const [linkModule, setLinkModule] = useState<"iqc" | "eqa">("iqc");
  const [linkEntity, setLinkEntity] = useState("");
  const [technicianForm, setTechnicianForm] = useState(emptyTechnicianForm);
  const [editingTechnicianId, setEditingTechnicianId] = useState<string | null>(
    null,
  );
  const classificationOptions = equipmentClassificationOptions(
    workspace.equipment.map((item) => item.category),
  );
  const filtered = workspace.equipment.filter((item) => {
    if (classification && item.category !== classification) return false;
    const query = search.trim().toLowerCase();
    if (!query) return true;
    return [
      item.code,
      item.name,
      item.serialNumber,
      item.assetNumber,
      item.location,
    ].some((value) => value?.toLowerCase().includes(query));
  });
  const selected =
    workspace.equipment.find((item) => item.id === selectedId) ??
    filtered[0] ??
    null;
  function selectEquipment(id: string) {
    setSelectedId(id);
    setTechnicianForm(emptyTechnicianForm);
    setEditingTechnicianId(null);
    setLinkEntity("");
  }
  async function rotate(item: Equipment) {
    if (
      !window.confirm(
        `สร้าง QR token ใหม่สำหรับ ${item.code}? QR เดิมจะใช้ไม่ได้ทันที`,
      )
    )
      return;
    await mutate(
      `/api/equipment/items/${item.id}/token`,
      { method: "POST" },
      "สร้าง QR token ใหม่แล้ว",
    );
  }
  async function addLink() {
    if (!selected || (linkModule === "eqa" && !linkEntity)) return;
    const ok = await mutate(
      "/api/equipment/links",
      {
        method: "POST",
        body: JSON.stringify({
          equipmentId: selected.id,
          module: linkModule,
          ...(linkModule === "eqa" ? { entityId: linkEntity } : {}),
        }),
      },
      "เชื่อมโมดูลแล้ว",
    );
    if (ok) setLinkEntity("");
  }
  async function saveTechnician(event: React.FormEvent) {
    event.preventDefault();
    if (!selected) return;
    const ok = await mutate(
      editingTechnicianId
        ? `/api/equipment/technicians/${editingTechnicianId}`
        : "/api/equipment/technicians",
      {
        method: editingTechnicianId ? "PATCH" : "POST",
        body: JSON.stringify({
          equipmentId: selected.id,
          technicianName: technicianForm.technicianName,
          company: technicianForm.company || null,
          phone: technicianForm.phone || null,
        }),
      },
      editingTechnicianId
        ? "แก้ไขข้อมูลช่างแล้ว"
        : "เพิ่มช่างประจำเครื่องแล้ว",
    );
    if (ok) {
      setTechnicianForm(emptyTechnicianForm);
      setEditingTechnicianId(null);
    }
  }
  function editTechnician(technician: EquipmentWorkspace["technicians"][number]) {
    setEditingTechnicianId(technician.id);
    setTechnicianForm({
      technicianName: technician.technicianName,
      company: technician.company ?? "",
      phone: technician.phone ?? "",
    });
  }
  async function removeTechnician(
    technician: EquipmentWorkspace["technicians"][number],
  ) {
    if (!window.confirm(`ลบ ${technician.technicianName} ออกจากทะเบียนช่างของเครื่องนี้?`))
      return;
    const ok = await mutate(
      `/api/equipment/technicians/${technician.id}`,
      { method: "DELETE" },
      "ลบข้อมูลช่างแล้ว",
    );
    if (ok && editingTechnicianId === technician.id) {
      setTechnicianForm(emptyTechnicianForm);
      setEditingTechnicianId(null);
    }
  }
  const links = selected
    ? workspace.links.filter((link) => link.equipmentId === selected.id)
    : [];
  const hasIqcLink = links.some((link) => link.module === "iqc");
  const linkedEntityIds = new Set(
    links.filter((link) => link.module === linkModule).map((link) => link.entityId),
  );
  const linkOptions = (linkModule === "iqc"
    ? workspace.iqcInstruments.map((item) => ({
        id: item.id,
        label: `${item.code} · ${item.name}`,
      }))
    : workspace.eqaSchemes.map((item) => ({
        id: item.id,
        label: `${item.code ? `${item.code} · ` : ""}${item.name}`,
      }))
  ).filter((item) => !linkedEntityIds.has(item.id));
  const technicians = selected
    ? workspace.technicians.filter(
        (technician) => technician.equipmentId === selected.id,
      )
    : [];
  async function saveLocalLocation(locationId: string) {
    if (!selected) return;
    await mutate(
      `/api/equipment/items/${selected.id}/location`,
      {
        method: "PATCH",
        body: JSON.stringify({ locationId: locationId || null }),
      },
      "บันทึกสถานที่ใช้งานใน Stock-BM แล้ว",
    );
  }
  return (
    <div className="grid gap-4 2xl:grid-cols-[400px_minmax(0,1fr)]">
      <div className="space-y-4">
        <SyncControl actor={actor} workspace={workspace} busy={busy} mutate={mutate} />
        <Card className="overflow-hidden">
          <div className="border-b border-[#e1eaeb] p-3">
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(12rem,0.65fr)]">
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-[#58747d]">
                  ค้นหาเครื่องมือ
                </span>
                <span className="relative block">
                  <Search className="absolute top-3.5 left-3 size-4 text-[#8ba0a5]" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-9"
                    placeholder="รหัส ชื่อ Serial หรือสถานที่"
                  />
                </span>
              </label>
              <Field label="Classification">
                <Select
                  value={classification}
                  onChange={(e) => setClassification(e.target.value)}
                  aria-label="กรองตาม Classification"
                >
                  <option value="">ทุก Classification</option>
                  {classificationOptions.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#789097]">
              <span>
                แสดง {filtered.length} จาก {workspace.equipment.length} เครื่องมือ
              </span>
              {search || classification ? (
                <button
                  type="button"
                  className="cursor-pointer font-bold text-[#0b7f76] underline decoration-[#9ed8d1] underline-offset-2 hover:text-[#075f5a]"
                  onClick={() => {
                    setSearch("");
                    setClassification("");
                  }}
                >
                  ล้างตัวกรอง
                </button>
              ) : null}
            </div>
          </div>
          <div className="max-h-[620px] divide-y divide-[#edf2f2] overflow-y-auto">
            {filtered.length ? filtered.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => selectEquipment(item.id)}
                className={`flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left ${selected?.id === item.id ? "bg-[#eaf7f5]" : "hover:bg-[#f8fbfb]"}`}
              >
                <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-[#e8f4f3] text-[#0b7f76]">
                  <Stethoscope className="size-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <strong className="block truncate text-sm text-[#173d50]">
                    {item.code} · {item.name}
                  </strong>
                  <p className="mt-1 truncate text-xs text-[#789097]">
                    {item.model ?? item.category ?? "-"} ·{" "}
                    {item.location ?? "-"}
                  </p>
                </div>
                <EquipmentStatusBadge status={item.status} />
              </button>
            )) : (
              <div className="px-4 py-8 text-center text-sm text-[#789097]">
                <p>ไม่พบเครื่องมือที่ตรงกับตัวกรอง</p>
                <button
                  type="button"
                  className="mt-2 cursor-pointer font-bold text-[#0b7f76] underline underline-offset-2 hover:text-[#075f5a]"
                  onClick={() => {
                    setSearch("");
                    setClassification("");
                  }}
                >
                  ล้างตัวกรอง
                </button>
              </div>
            )}
          </div>
        </Card>
      </div>
      {selected ? (
        <div className="space-y-4">
          <Card className="overflow-hidden">
            <div className="bg-[#123944] p-5 text-white">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="mono text-xs font-bold tracking-[.16em] text-[#8fe5dc]">
                    {selected.code}
                  </p>
                  <h2 className="mt-2 text-2xl font-bold">{selected.name}</h2>
                  <p className="mt-2 text-sm text-[#c5dfe3]">
                    {selected.manufacturer ?? "-"} · {selected.model ?? "-"}
                  </p>
                  <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[#b7d7dc]">
                    <span>{selected.portalDepartmentName ?? "ยังไม่ระบุหน่วยงานจาก Portal"}</span>
                    {selected.portalDepartmentCode ? (
                      <span className="mono rounded bg-white/10 px-1.5 py-0.5">{selected.portalDepartmentCode}</span>
                    ) : null}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <EquipmentStatusBadge status={selected.status} />
                  {selected.portalStatus ? (
                    <StatusBadge tone="neutral" label={`Portal: ${selected.portalStatus}`} />
                  ) : null}
                </div>
              </div>
            </div>
            {selected.photos.length ? (
              <div className="grid grid-cols-2 gap-3 border-b border-[#edf2f2] p-4 sm:grid-cols-3">
                {selected.photos.map((photo) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={photo.id}
                    src={`/api/attachments/${photo.id}`}
                    alt={`รูป ${selected.name}`}
                    className="aspect-[4/3] w-full rounded-xl border border-[#d9e5e5] bg-white object-cover"
                  />
                ))}
              </div>
            ) : null}
            <div className="border-b border-[#edf2f2] p-4">
              <AttachmentList
                module="equipment"
                entityType="equipment"
                entityId={selected.id}
                kind="equipment-photo"
                canDelete={actor.role === "Admin"}
                canUpload={actor.role === "Admin"}
                accept="image/jpeg,image/png,image/webp"
                label="รูปเครื่องมือ"
                onChanged={onAttachmentsChanged}
              />
            </div>
            <div id="selected-equipment-details">
                <div className="grid gap-3 p-4 sm:grid-cols-3">
                  <Info label="Serial No." value={selected.serialNumber} />
                  <Info label="Asset No." value={selected.assetNumber} />
                  <Info
                    label="ติดตั้ง"
                    value={
                      selected.installedOn
                        ? formatDate(selected.installedOn)
                        : null
                    }
                  />
                  <Info
                    label="หมดประกัน"
                    value={
                      selected.warrantyUntil
                        ? formatDate(selected.warrantyUntil)
                        : null
                    }
                  />
                  <Info label="ประเภท" value={selected.category} />
                  <Info label="หมายเหตุ" value={selected.note} />
                </div>
                <div className="grid gap-3 border-t border-[#edf2f2] p-4 sm:grid-cols-2">
                  <Field
                    label="สถานที่ใช้งานภายใน Stock-BM"
                    hint="ข้อมูลนี้เป็นของ Stock-BM และ Sync จาก Portal จะไม่เขียนทับ"
                  >
                    <Select
                      value={selected.locationId ?? ""}
                      disabled={busy}
                      onChange={(event) => void saveLocalLocation(event.target.value)}
                    >
                      <option value="">ยังไม่ระบุสถานที่</option>
                      {workspace.locations.map((location) => (
                        <option key={location.id} value={location.id}>
                          {location.code} · {location.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <div>
                    <p className="mb-1 text-xs font-semibold text-[#58747d]">สถานที่จาก Portal</p>
                    <p className="min-h-11 rounded-md border border-dashed border-[#c9dadd] bg-[#f7fbfb] px-3 py-2 text-sm text-[#55727c]">
                      {selected.portalLocation ?? "ยังไม่ระบุ"}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 border-t border-[#edf2f2] p-4">
                  <a
                    href={`/service/equipment/${selected.qrToken}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Button variant="secondary">
                      <ExternalLink className="size-4" /> เปิดฟอร์มช่าง
                    </Button>
                  </a>
                  {selected.portalUrl ? (
                    <a href={selected.portalUrl} target="_blank" rel="noreferrer">
                      <Button variant="secondary">
                        <ExternalLink className="size-4" /> เปิดรายละเอียด Portal
                      </Button>
                    </a>
                  ) : null}
                  {actor.role === "Admin" ? (
                    <Button
                      variant="secondary"
                      disabled={busy}
                      onClick={() => void rotate(selected)}
                    >
                      <RefreshCw className="size-4" /> เปลี่ยน QR ของ Stock-BM
                    </Button>
                  ) : null}
                </div>
              </div>
          </Card>
          <RoutineMaintenance actor={actor} equipmentId={selected.id} />
          <section aria-label="รายละเอียดเครื่องมือเพิ่มเติม" className="space-y-4">
              <Card className="overflow-hidden">
            <div className="flex items-center gap-3 border-b border-[#e1eaeb] bg-[#f7fbfb] px-4 py-3">
              <span className="grid size-9 place-items-center rounded-lg bg-[#e7f7f4] text-[#0b7f76]">
                <UserRound className="size-4" />
              </span>
              <div>
                <h3 className="font-bold text-[#173d50]">ทะเบียนช่างประจำเครื่อง</h3>
                <p className="text-xs text-[#789097]">
                  แสดงเป็นตัวเลือกเมื่อช่างสแกน QR
                </p>
              </div>
            </div>
            <div className="divide-y divide-[#edf2f2]">
              {technicians.map((technician) => (
                <div
                  key={technician.id}
                  className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center"
                >
                  <div className="min-w-0 flex-1">
                    <strong className="block truncate text-sm text-[#173d50]">
                      {technician.technicianName}
                    </strong>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#789097]">
                      <span className="flex items-center gap-1">
                        <Building2 className="size-3" />
                        {technician.company ?? "ไม่ระบุบริษัท"}
                      </span>
                      <span className="flex items-center gap-1">
                        <Phone className="size-3" />
                        {technician.phone ?? "ไม่ระบุเบอร์"}
                      </span>
                    </div>
                  </div>
                  {actor.role === "Admin" ? (
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => editTechnician(technician)}
                      >
                        <Pencil className="size-3.5" /> แก้ไข
                      </Button>
                      <Button
                        type="button"
                        variant="danger"
                        disabled={busy}
                        onClick={() => void removeTechnician(technician)}
                      >
                        <Trash2 className="size-3.5" /> ลบ
                      </Button>
                    </div>
                  ) : null}
                </div>
              ))}
              {!technicians.length ? (
                <p className="px-4 py-5 text-center text-sm text-[#8ba0a5]">
                  ยังไม่มีช่างที่ผูกกับเครื่องมือนี้
                </p>
              ) : null}
            </div>
            {actor.role === "Admin" ? (
              <form
                onSubmit={saveTechnician}
                className="grid gap-3 border-t border-[#e1eaeb] bg-[#fbfdfd] p-4 sm:grid-cols-3"
              >
                <Field label="ชื่อช่าง *">
                  <Input
                    required
                    value={technicianForm.technicianName}
                    onChange={(event) =>
                      setTechnicianForm({
                        ...technicianForm,
                        technicianName: event.target.value,
                      })
                    }
                  />
                </Field>
                <Field label="บริษัท">
                  <Input
                    value={technicianForm.company}
                    onChange={(event) =>
                      setTechnicianForm({
                        ...technicianForm,
                        company: event.target.value,
                      })
                    }
                  />
                </Field>
                <Field label="เบอร์ติดต่อ">
                  <Input
                    inputMode="tel"
                    value={technicianForm.phone}
                    onChange={(event) =>
                      setTechnicianForm({
                        ...technicianForm,
                        phone: event.target.value,
                      })
                    }
                  />
                </Field>
                <div className="flex gap-2 sm:col-span-3">
                  <Button disabled={busy}>
                    <Plus className="size-4" />
                    {editingTechnicianId ? "บันทึกการแก้ไข" : "เพิ่มช่าง"}
                  </Button>
                  {editingTechnicianId ? (
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        setTechnicianForm(emptyTechnicianForm);
                        setEditingTechnicianId(null);
                      }}
                    >
                      ยกเลิก
                    </Button>
                  ) : null}
                </div>
              </form>
            ) : null}
              </Card>
              <Card className="p-4">
            <div className="flex items-center gap-2">
              <Link2 className="size-4 text-[#0b7f76]" />
              <h3 className="font-bold text-[#173d50]">เชื่อม IQC / EQA</h3>
            </div>
            <div className="mt-3 space-y-2">
              {links.map((link) => (
                <div
                  key={link.id}
                  className="flex items-center gap-2 rounded border border-[#e1eaeb] px-3 py-2 text-sm"
                >
                  <StatusBadge
                    tone="neutral"
                    label={link.module.toUpperCase()}
                  />
                  <span className="min-w-0 flex-1 truncate text-[#315763]">
                    {link.entityLabel}
                  </span>
                  {actor.role === "Admin" ? (
                    <button
                      type="button"
                      onClick={() =>
                        void mutate(
                          `/api/equipment/links/${link.id}`,
                          { method: "DELETE" },
                          "ยกเลิกการเชื่อมแล้ว",
                        )
                      }
                      className="text-[#b33b46]"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  ) : null}
                </div>
              ))}
              {!links.length ? (
                <p className="text-xs text-[#8ba0a5]">ยังไม่เชื่อมโมดูลอื่น</p>
              ) : null}
            </div>
            {actor.role === "Admin" ? (
              <div className="mt-3 grid gap-2 sm:grid-cols-[120px_1fr_auto]">
                <Select
                  value={linkModule}
                  onChange={(e) => {
                    setLinkModule(e.target.value as "iqc" | "eqa");
                    setLinkEntity("");
                  }}
                >
                  <option value="iqc">IQC</option>
                  <option value="eqa">EQA</option>
                </Select>
                {linkModule === "iqc" ? (
                  <div className="flex items-center rounded-md border border-[#d5e4e5] bg-[#f4f9f8] px-3 text-xs text-[#41656d]">
                    {hasIqcLink ? "เปิดใช้กับ IQC แล้ว" : "ใช้เครื่องมือนี้ใน IQC"}
                  </div>
                ) : (
                  <Select value={linkEntity} onChange={(e) => setLinkEntity(e.target.value)}>
                    <option value="">เลือกรายการ</option>
                    {linkOptions.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.label}
                      </option>
                    ))}
                  </Select>
                )}
                <Button
                  disabled={(linkModule === "eqa" && !linkEntity) || (linkModule === "iqc" && hasIqcLink) || busy}
                  onClick={() => void addLink()}
                >
                  <Plus className="size-4" /> {linkModule === "iqc" ? "เปิดใช้ IQC" : "เชื่อม"}
                </Button>
              </div>
            ) : null}
              </Card>
            </section>
        </div>
      ) : (
        <Empty text="ยังไม่มีเครื่องมือ" />
      )}
    </div>
  );
}

const emptyPlan = {
  equipmentId: "",
  activityType: "pm" as EquipmentPlanType,
  title: "",
  intervalValue: 1,
  intervalUnit: "year",
  scheduleBasis: "completion_based",
  nextDueOn: endOfEquipmentDueMonth(todayBangkok()),
  reminderDays: 30,
  vendor: "",
  instruction: "",
  isActive: true,
};
function Plans({
  actor,
  workspace,
  busy,
  mutate,
}: {
  actor: BmActor;
  workspace: EquipmentWorkspace;
  busy: boolean;
  mutate: Mutate;
}) {
  const [form, setForm] = useState(emptyPlan);
  const [editingId, setEditingId] = useState<string | null>(null);
  const equipmentMap = new Map(
    workspace.equipment.map((item) => [item.id, item]),
  );
  const portalEquipmentIds = new Set(
    workspace.equipment
      .filter((item) => item.portalEquipmentId)
      .map((item) => item.id),
  );
  const localPlans = workspace.plans.filter(
    (plan) => !portalEquipmentIds.has(plan.equipmentId),
  );
  async function save(e: React.FormEvent) {
    e.preventDefault();
    const ok = await mutate(
      editingId ? `/api/equipment/plans/${editingId}` : "/api/equipment/plans",
      { method: editingId ? "PATCH" : "POST", body: JSON.stringify(form) },
      editingId ? "แก้ไขแผนงานแล้ว" : "เพิ่มแผนงานแล้ว",
    );
    if (ok) {
      setForm(emptyPlan);
      setEditingId(null);
    }
  }
  return (
    <div className="grid gap-4 xl:grid-cols-[390px_minmax(0,1fr)]">
      {actor.role === "Admin" ? (
        <Card className="p-4">
          <h2 className="font-bold text-[#173d50]">ตั้งแผนงานตามรอบ</h2>
          <form onSubmit={save} className="mt-4 space-y-3">
            <Field label="เครื่องมือ *">
              <Select
                required
                value={form.equipmentId}
                onChange={(e) =>
                  setForm({ ...form, equipmentId: e.target.value })
                }
              >
                <option value="">เลือกเครื่องมือ</option>
                {workspace.equipment
                  .filter(
                    (item) =>
                      item.status !== "decommissioned" &&
                      !item.portalEquipmentId,
                  )
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.code} · {item.name}
                    </option>
                  ))}
              </Select>
            </Field>
            <Field label="ประเภทแผน">
              <Select
                value={form.activityType}
                onChange={(e) =>
                  setForm({
                    ...form,
                    activityType: e.target.value as EquipmentPlanType,
                  })
                }
              >
                {EQUIPMENT_PLAN_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {EQUIPMENT_EVENT_LABELS[type]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="ชื่อแผน *">
              <Input
                required
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="เช่น PM ประจำปี"
              />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="ทุก">
                <Input
                  type="number"
                  min={1}
                  required
                  value={form.intervalValue}
                  onChange={(e) =>
                    setForm({ ...form, intervalValue: Number(e.target.value) })
                  }
                />
              </Field>
              <Field label="หน่วย">
                <Select
                  value={form.intervalUnit}
                  onChange={(e) =>
                    setForm({ ...form, intervalUnit: e.target.value })
                  }
                >
                  <option value="day">วัน</option>
                  <option value="week">สัปดาห์</option>
                  <option value="month">เดือน</option>
                  <option value="year">ปี</option>
                </Select>
              </Field>
            </div>
            <Field label="วิธีคำนวณรอบ">
              <Select
                value={form.scheduleBasis}
                onChange={(e) =>
                  setForm({ ...form, scheduleBasis: e.target.value })
                }
              >
                <option value="completion_based">นับจากวันที่ทำจริง</option>
                <option value="fixed_schedule">ยึดรอบเดิม</option>
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="เดือนครบกำหนดครั้งถัดไป">
                <Input
                  type="month"
                  required
                  value={equipmentDueMonthInput(form.nextDueOn)}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      nextDueOn: e.target.value
                        ? endOfEquipmentDueMonth(e.target.value)
                        : "",
                    })
                  }
                />
              </Field>
              <Field label="เตือนล่วงหน้า (วัน)">
                <Input
                  type="number"
                  min={0}
                  value={form.reminderDays}
                  onChange={(e) =>
                    setForm({ ...form, reminderDays: Number(e.target.value) })
                  }
                />
              </Field>
            </div>
            <Field label="Vendor">
              <Input
                value={form.vendor}
                onChange={(e) => setForm({ ...form, vendor: e.target.value })}
              />
            </Field>
            <Field label="คำแนะนำ">
              <Textarea
                value={form.instruction}
                onChange={(e) =>
                  setForm({ ...form, instruction: e.target.value })
                }
              />
            </Field>
            <label className="flex items-center gap-2 text-sm font-semibold text-[#41656d]">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) =>
                  setForm({ ...form, isActive: e.target.checked })
                }
              />{" "}
              เปิดใช้แผนและการแจ้งเตือน
            </label>
            <Button disabled={busy || !form.equipmentId}>
              <Plus className="size-4" />{" "}
              {editingId ? "บันทึกการแก้ไข" : "เพิ่มแผน"}
            </Button>
            {editingId ? (
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setEditingId(null);
                  setForm(emptyPlan);
                }}
              >
                ยกเลิก
              </Button>
            ) : null}
          </form>
        </Card>
      ) : null}
      <Card className="overflow-hidden border-[#cfe4e1]">
        <div className="border-b border-[#dcebea] bg-[#f1faf8] px-4 py-3">
          <div className="flex items-center gap-2">
            <CalendarClock className="size-4 text-[#0b7f76]" aria-hidden="true" />
            <h2 className="font-bold text-[#173d50]">PM / Calibration จาก Portal</h2>
          </div>
          <p className="mt-1 text-xs text-[#58747d]">
            ข้อมูล Cache แบบอ่านอย่างเดียว · แก้ไขรายละเอียดและเอกสารที่ Portal
          </p>
        </div>
        <div className="divide-y divide-[#edf2f2]">
          {workspace.portalPmCal.map((item) => (
            <div
              key={item.portalPlanId}
              className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-[#173d50]">
                  {equipmentMap.get(item.equipmentId)?.code ?? "-"} · {item.calType ?? "PM/CAL"}
                </p>
                <p className="mt-1 text-xs text-[#58747d]">
                  รอบ {item.fiscalYear ?? "-"}/{item.calendarMonth ?? "-"} · ครบกำหนด {item.dueDate ? formatDate(item.dueDate) : "-"}
                  {item.provider ? ` · ${item.provider}` : ""}
                </p>
              </div>
              <StatusBadge
                tone={item.recordStatus === "active" ? "accepted" : "neutral"}
                label={item.recordStatus ?? "ไม่ระบุสถานะ"}
              />
            </div>
          ))}
          {!workspace.portalPmCal.length ? (
            <Empty text="ยังไม่มีข้อมูล PM/CAL จาก Portal ใน Cache" />
          ) : null}
        </div>
      </Card>
      <Card className="overflow-hidden">
        <div className="border-b border-[#e1eaeb] bg-[#fbfdfd] px-4 py-3">
          <h2 className="font-bold text-[#173d50]">แผนงานทั้งหมด</h2>
          <p className="mt-1 text-xs text-[#789097]">เรียงตามเดือนครบกำหนด</p>
        </div>
        <div className="divide-y divide-[#edf2f2]">
          {localPlans.map((plan) => (
            <div
              key={plan.id}
              className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <strong className="text-sm text-[#173d50]">
                    {equipmentMap.get(plan.equipmentId)?.code} · {plan.title}
                  </strong>
                  <DueBadge plan={plan} />
                </div>
                <p className="mt-1 text-xs text-[#789097]">
                  {EQUIPMENT_EVENT_LABELS[plan.activityType]} · ทุก{" "}
                  {plan.intervalValue} {plan.intervalUnit} ·{" "}
                  {plan.scheduleBasis === "fixed_schedule"
                    ? "ยึดรอบเดิม"
                    : "นับจากวันที่ทำจริง"}
                </p>
                <p className="mt-1 text-xs font-semibold text-[#315763]">
                  ครบกำหนด {formatEquipmentDueMonth(plan.nextDueOn)}
                </p>
              </div>
              {actor.role === "Admin" ? (
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    disabled={busy}
                    onClick={() => {
                      setEditingId(plan.id);
                      setForm({
                        equipmentId: plan.equipmentId,
                        activityType: plan.activityType,
                        title: plan.title,
                        intervalValue: plan.intervalValue,
                        intervalUnit: plan.intervalUnit,
                        scheduleBasis: plan.scheduleBasis,
                        nextDueOn: plan.nextDueOn,
                        reminderDays: plan.reminderDays,
                        vendor: plan.vendor ?? "",
                        instruction: plan.instruction ?? "",
                        isActive: plan.isActive,
                      });
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                  >
                    <Settings2 className="size-4" /> แก้ไข
                  </Button>
                  <Button
                    variant="danger"
                    disabled={busy}
                    onClick={() => {
                      if (window.confirm(`ลบแผน ${plan.title}?`))
                        void mutate(
                          `/api/equipment/plans/${plan.id}`,
                          { method: "DELETE" },
                          "ลบแผนแล้ว",
                        );
                    }}
                  >
                    <Trash2 className="size-4" /> ลบ
                  </Button>
                </div>
              ) : null}
            </div>
          ))}
          {!localPlans.length ? <Empty text="ไม่มีแผนงานภายในที่ต้องดูแล" /> : null}
        </div>
      </Card>
    </div>
  );
}

const emptyRecord = {
  equipmentId: "",
  planId: "",
  portalPlanId: "",
  eventType: "pm" as EquipmentEventType,
  otherEventLabel: "",
  qualificationStage: "",
  performedOn: todayBangkok(),
  reportedProblem: "",
  findings: "",
  actionTaken: "",
  partsReplaced: "",
  jobNumber: "",
  company: "",
  technicianName: "",
  technicianContact: "",
  receiverName: "",
  downtimeFrom: "",
  downtimeUntil: "",
  outcome: "pass",
  returnStatus: "active",
  nextRecommendedOn: "",
};
function WorkHistory({
  actor,
  workspace,
  busy,
  mutate,
  printedAt,
}: {
  actor: BmActor;
  workspace: EquipmentWorkspace;
  busy: boolean;
  mutate: Mutate;
  printedAt?: string;
}) {
  const [form, setForm] = useState(emptyRecord);
  const [isFormOpen, setFormOpen] = useState(false);
  const [historyEquipmentId, setHistoryEquipmentId] = useState("");
  const [historyEventType, setHistoryEventType] = useState("");
  const [historyFrom, setHistoryFrom] = useState("");
  const [historyTo, setHistoryTo] = useState("");
  const [historySearch, setHistorySearch] = useState("");
  const [selectedTechnicianId, setSelectedTechnicianId] = useState("");
  const technicianSignatureRef = useRef<SignaturePadHandle | null>(null);
  const receiverSignatureRef = useRef<SignaturePadHandle | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [reasonDialog, setReasonDialog] = useState<{
    record: EquipmentServiceRecord;
    action: "void";
  } | null>(null);
  const onTechnicianSignatureReady = useCallback((handle: SignaturePadHandle) => {
    technicianSignatureRef.current = handle;
  }, []);
  const onReceiverSignatureReady = useCallback((handle: SignaturePadHandle) => {
    receiverSignatureRef.current = handle;
  }, []);
  const equipmentMap = new Map(
    workspace.equipment.map((item) => [item.id, item]),
  );
  const normalizedHistorySearch = historySearch.trim().toLowerCase();
  const approved = workspace.records
    .filter(
      (record) =>
        record.status === "approved" ||
        record.status === "voided" ||
        record.status === "rejected",
    )
    .filter(
      (record) =>
        !historyEquipmentId || record.equipmentId === historyEquipmentId,
    )
    .filter(
      (record) => !historyEventType || record.eventType === historyEventType,
    )
    .filter((record) => !historyFrom || record.performedOn >= historyFrom)
    .filter((record) => !historyTo || record.performedOn <= historyTo)
    .filter(
      (record) =>
        !normalizedHistorySearch ||
        [
          equipmentMap.get(record.equipmentId)?.code,
          equipmentMap.get(record.equipmentId)?.name,
          record.technicianName,
          record.company,
          record.otherEventLabel,
          EQUIPMENT_EVENT_LABELS[record.eventType],
        ].some((value) =>
          value?.toLowerCase().includes(normalizedHistorySearch),
        ),
    );
  const hasHistoryFilters = Boolean(
    historyEquipmentId ||
      historyEventType ||
      historyFrom ||
      historyTo ||
      historySearch,
  );
  const reportParams = new URLSearchParams();
  if (historyEquipmentId) reportParams.set("equipmentId", historyEquipmentId);
  if (historyEventType) reportParams.set("eventType", historyEventType);
  if (historyFrom) reportParams.set("from", historyFrom);
  if (historyTo) reportParams.set("to", historyTo);
  const reportHref = reportParams.toString()
    ? `/equipment/report?${reportParams.toString()}`
    : "/equipment/report";
  const plans = workspace.plans.filter(
    (plan) => plan.equipmentId === form.equipmentId && plan.isActive,
  );
  const portalPlans = workspace.portalPmCal.filter(
    (plan) => plan.equipmentId === form.equipmentId && plan.recordStatus === "active",
  );
  const technicians = workspace.technicians.filter(
    (technician) => technician.equipmentId === form.equipmentId,
  );
  function selectTechnician(id: string) {
    setSelectedTechnicianId(id);
    const technician = technicians.find((item) => item.id === id);
    setForm((current) => ({
      ...current,
      technicianName: technician?.technicianName ?? "",
      company: technician?.company ?? "",
      technicianContact: technician?.phone ?? "",
    }));
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!form.receiverName.trim()) {
      setFormError("กรุณาระบุชื่อผู้รับงาน");
      return;
    }
    const technicianSignature = await technicianSignatureRef.current?.toFile();
    const receiverSignature = await receiverSignatureRef.current?.toFile();
    if (!technicianSignature || !receiverSignature) {
      setFormError("กรุณาลงลายเซ็นช่างและผู้รับงานให้ครบ");
      return;
    }
    const payload = {
      ...form,
      planId: form.planId || null,
      portalPlanId: form.portalPlanId || null,
      otherEventLabel: form.otherEventLabel || null,
      qualificationStage: form.qualificationStage || null,
      nextRecommendedOn: form.nextRecommendedOn || null,
      downtimeFrom: form.downtimeFrom
        ? new Date(form.downtimeFrom).toISOString()
        : null,
      downtimeUntil: form.downtimeUntil
        ? new Date(form.downtimeUntil).toISOString()
        : null,
    };
    const body = new FormData();
    for (const [key, value] of Object.entries(payload))
      body.append(key, value == null ? "" : String(value));
    body.append("technicianSignature", technicianSignature);
    body.append("receiverSignature", receiverSignature);
    const ok = await mutate(
      "/api/equipment/records",
      { method: "POST", body },
      "บันทึกประวัติงานแล้ว",
    );
    if (ok) {
      setForm(emptyRecord);
      setSelectedTechnicianId("");
      setFormError(null);
      setFormOpen(false);
    }
  }
  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        <div className="border-b border-[#e1eaeb] bg-[#fbfdfd] px-4 py-4 sm:px-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-bold text-[#173d50]">ประวัติงานทางการ</h2>
                <span className="inline-flex items-center rounded-full border border-[#cfe4e1] bg-[#f1faf8] px-2 py-0.5 text-[11px] font-bold text-[#0b7f76]">
                  {approved.length} รายการ
                </span>
              </div>
              <p className="mt-1 text-xs text-[#789097]">
                เอกสารประวัติงานที่อนุมัติแล้ว พร้อมลายเซ็นและข้อมูลตรวจรับ
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                className="min-h-9 px-2.5 py-1 text-xs"
                onClick={() => {
                  setFormError(null);
                  setFormOpen(true);
                }}
              >
                <Plus className="size-3.5" aria-hidden="true" />
                บันทึกงานภายใน
              </Button>
              {hasHistoryFilters ? (
                <Button
                  type="button"
                  variant="ghost"
                  className="min-h-9 px-2 py-1 text-xs"
                  onClick={() => {
                    setHistoryEquipmentId("");
                    setHistoryEventType("");
                    setHistoryFrom("");
                    setHistoryTo("");
                    setHistorySearch("");
                  }}
                >
                  ล้างตัวกรอง
                </Button>
              ) : null}
              <Link href={reportHref} aria-label="พิมพ์รายงานประวัติงาน">
                <span
                  title="พิมพ์รายงานประวัติงาน"
                  className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border border-[#c9dadd] bg-white px-3.5 py-2 text-sm font-semibold text-[#244854] transition hover:border-[#7fa9ad] hover:bg-[#f7fbfb] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0b7f76]"
                >
                  <Printer className="size-4" aria-hidden="true" />
                </span>
              </Link>
            </div>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
            <label htmlFor="equipment-history-equipment" className="block min-w-0">
              <span className="mb-1 block text-[11px] font-semibold text-[#58747d]">
                เครื่องมือ
              </span>
              <Select
                id="equipment-history-equipment"
                aria-label="เครื่องมือ"
                value={historyEquipmentId}
                onChange={(event) => setHistoryEquipmentId(event.target.value)}
                className="min-h-9 px-2 py-1.5 text-xs"
              >
                <option value="">ทุกเครื่องมือ</option>
                {workspace.equipment.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.code} · {item.name}
                  </option>
                ))}
              </Select>
            </label>
            <label htmlFor="equipment-history-event" className="block min-w-0">
              <span className="mb-1 block text-[11px] font-semibold text-[#58747d]">
                ประเภทงาน
              </span>
              <Select
                id="equipment-history-event"
                aria-label="ประเภทงาน"
                value={historyEventType}
                onChange={(event) => setHistoryEventType(event.target.value)}
                className="min-h-9 px-2 py-1.5 text-xs"
              >
                <option value="">ทุกประเภทงาน</option>
                {Object.entries(EQUIPMENT_EVENT_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </label>
            <label htmlFor="equipment-history-from" className="block min-w-0">
              <span className="mb-1 block text-[11px] font-semibold text-[#58747d]">
                ตั้งแต่วันที่
              </span>
              <Input
                id="equipment-history-from"
                aria-label="ตั้งแต่วันที่"
                type="date"
                value={historyFrom}
                onChange={(event) => setHistoryFrom(event.target.value)}
                className="min-h-9 px-2 py-1.5 text-xs"
              />
            </label>
            <label htmlFor="equipment-history-to" className="block min-w-0">
              <span className="mb-1 block text-[11px] font-semibold text-[#58747d]">
                ถึงวันที่
              </span>
              <Input
                id="equipment-history-to"
                aria-label="ถึงวันที่"
                type="date"
                value={historyTo}
                onChange={(event) => setHistoryTo(event.target.value)}
                className="min-h-9 px-2 py-1.5 text-xs"
              />
            </label>
            <label htmlFor="equipment-history-search" className="block min-w-0 sm:col-span-2 xl:col-span-1">
              <span className="mb-1 block text-[11px] font-semibold text-[#58747d]">
                ค้นหาประวัติงาน
              </span>
              <span className="relative block">
                <Search
                  className="pointer-events-none absolute top-2.5 left-3 size-4 text-[#8ba0a5]"
                  aria-hidden="true"
                />
                <Input
                  id="equipment-history-search"
                  aria-label="ค้นหาประวัติงาน"
                  value={historySearch}
                  onChange={(event) => setHistorySearch(event.target.value)}
                  className="min-h-9 pl-9 py-1.5 text-xs"
                  placeholder="รหัส ชื่อช่าง บริษัท หรือประเภทงาน"
                />
              </span>
            </label>
          </div>
          <div className="mt-3 grid gap-1 border-t border-[#e7eeee] pt-2 text-[11px] text-[#68828a] sm:grid-cols-2">
            <span>
              ช่วงวันที่: {historyFrom ? formatDate(historyFrom) : "เริ่มต้น"} –{" "}
              {historyTo ? formatDate(historyTo) : "ปัจจุบัน"}
            </span>
            <span className="sm:text-right">
              พิมพ์เมื่อ: {printedAt ?? "—"}
            </span>
          </div>
        </div>
        <div className="space-y-3 bg-[#edf4f2] p-3 sm:p-4">
          {approved.map((record, index) => (
            <OfficialRecordCard
              key={record.id}
              record={record}
              equipment={equipmentMap.get(record.equipmentId)}
              index={index}
              canDelete={actor.role === "Admin"}
              actions={
                <>
                  {record.status === "approved" ? (
                    <Button
                      type="button"
                      variant="ghost"
                      className="min-h-7 px-2 py-1 text-[11px]"
                      disabled={busy}
                      onClick={() => setReasonDialog({ record, action: "void" })}
                    >
                      Void
                    </Button>
                  ) : null}
                  {record.status === "rejected" ? (
                    <Button
                      type="button"
                      variant="secondary"
                      className="min-h-7 px-2 py-1 text-[11px]"
                      disabled={busy}
                      onClick={() =>
                        void mutate(
                          `/api/equipment/records/${record.id}`,
                          {
                            method: "PATCH",
                            body: JSON.stringify({ action: "resubmit" }),
                          },
                          "ส่งรายการกลับเข้าคิวตรวจรับแล้ว",
                        )
                      }
                    >
                      ส่งกลับตรวจใหม่
                    </Button>
                  ) : null}
                </>
              }
            />
          ))}
          {!approved.length ? (
            <div className="rounded-lg border border-dashed border-[#cfe0df] bg-white">
              <Empty text="ยังไม่มีประวัติงานที่ตรงกับตัวกรอง" />
            </div>
          ) : null}
        </div>
      </Card>
      {isFormOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-3 sm:p-6"
          role="presentation"
          onMouseDown={() => setFormOpen(false)}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="internal-record-dialog-title"
            className="flex h-[min(900px,calc(100dvh-1.5rem))] w-full max-w-3xl flex-col overflow-hidden rounded-lg border border-[#c9dadd] bg-white shadow-2xl"
            onKeyDown={(event) => {
              if (event.key === "Escape") setFormOpen(false);
            }}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className="flex shrink-0 items-start justify-between gap-3 border-b border-[#e3ebec] bg-[#f6fafa] px-4 py-3 sm:px-5">
              <div>
                <h2 id="internal-record-dialog-title" className="font-bold text-[#173d50]">
                  บันทึกงานภายใน
                </h2>
                <p className="mt-1 text-xs text-[#789097]">
                  บันทึกแล้วจะอยู่สถานะรอตรวจรับจนกว่าจะผ่านผู้ตรวจ
                </p>
              </div>
              <button
                type="button"
                autoFocus
                onClick={() => setFormOpen(false)}
                className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-md text-[#55727c] hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0b7f76]"
                aria-label="ปิดแบบฟอร์มบันทึกงานภายใน"
              >
                <X className="size-5" />
              </button>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
              <form onSubmit={save} className="space-y-3">
          <Field label="เครื่องมือ *">
            <Select
              required
              value={form.equipmentId}
              onChange={(e) => {
                setSelectedTechnicianId("");
                setForm({
                  ...form,
                  equipmentId: e.target.value,
                  planId: "",
                  portalPlanId: "",
                  technicianName: "",
                  company: "",
                  technicianContact: "",
                });
              }}
            >
              <option value="">เลือกเครื่องมือ</option>
              {workspace.equipment
                .filter((item) => item.status !== "decommissioned")
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.code} · {item.name}
                  </option>
                ))}
            </Select>
          </Field>
          <Field label="แผนที่เกี่ยวข้อง">
            <Select
              value={form.planId}
              onChange={(e) => setForm({ ...form, planId: e.target.value })}
            >
              <option value="">ไม่ผูกแผน</option>
              {plans.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.title} · {formatEquipmentDueMonth(plan.nextDueOn)}
                </option>
              ))}
            </Select>
          </Field>
          {portalPlans.length ? (
            <Field
              label="อ้างอิง PM/CAL จาก Portal"
              hint="ลิงก์อ้างอิงเท่านั้น ระบบไม่สร้างแผนซ้ำใน Stock-BM"
            >
              <Select
                value={form.portalPlanId}
                onChange={(e) => setForm({ ...form, portalPlanId: e.target.value })}
              >
                <option value="">ไม่อ้างอิง PM/CAL จาก Portal</option>
                {portalPlans.map((plan) => (
                  <option key={plan.portalPlanId} value={plan.portalPlanId}>
                    {plan.calType ?? "PM/CAL"} · {plan.fiscalYear ?? "-"}/{plan.calendarMonth ?? "-"}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}
          <div className="rounded-xl border border-[#cfe4e1] bg-[#f1faf8] p-3">
            <Field label="เลือกช่างจากทะเบียนเครื่องมือนี้">
              <Select
                value={selectedTechnicianId}
                disabled={!form.equipmentId}
                onChange={(event) => selectTechnician(event.target.value)}
              >
                <option value="">ช่างอื่น / กรอกเอง</option>
                {technicians.map((technician) => (
                  <option key={technician.id} value={technician.id}>
                    {technician.technicianName}
                    {technician.company ? ` · ${technician.company}` : ""}
                  </option>
                ))}
              </Select>
            </Field>
            <p className="mt-2 text-[11px] leading-5 text-[#68828a]">
              เลือกช่างแล้วระบบจะเติมชื่อ บริษัท และเบอร์ติดต่อให้ โดยยังแก้ไขหรือกรอกช่างนอกทะเบียนได้
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="ประเภทงาน">
              <Select
                value={form.eventType}
                onChange={(e) =>
                  setForm({
                    ...form,
                    eventType: e.target.value as EquipmentEventType,
                  })
                }
              >
                {Object.entries(EQUIPMENT_EVENT_LABELS).map(
                  ([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ),
                )}
              </Select>
            </Field>
            <Field label="วันที่ทำ">
              <Input
                type="date"
                required
                value={form.performedOn}
                onChange={(e) =>
                  setForm({ ...form, performedOn: e.target.value })
                }
              />
            </Field>
          </div>
          {form.eventType === "other" ? (
            <Field label="ระบุประเภทอื่น *">
              <Input
                required
                value={form.otherEventLabel}
                onChange={(e) =>
                  setForm({ ...form, otherEventLabel: e.target.value })
                }
              />
            </Field>
          ) : null}
          {form.eventType === "qualification" ? (
            <Field label="Qualification stage">
              <Select
                value={form.qualificationStage}
                onChange={(e) =>
                  setForm({ ...form, qualificationStage: e.target.value })
                }
              >
                <option value="">ไม่ระบุ</option>
                <option>IQ</option>
                <option>OQ</option>
                <option>PQ</option>
              </Select>
            </Field>
          ) : null}
          <Field label="อาการ/ปัญหา">
            <Textarea
              value={form.reportedProblem}
              onChange={(e) =>
                setForm({ ...form, reportedProblem: e.target.value })
              }
            />
          </Field>
          <Field label="ผลตรวจสอบ">
            <Textarea
              value={form.findings}
              onChange={(e) => setForm({ ...form, findings: e.target.value })}
            />
          </Field>
          <Field label="งานที่ดำเนินการ *">
            <Textarea
              required
              value={form.actionTaken}
              onChange={(e) =>
                setForm({ ...form, actionTaken: e.target.value })
              }
            />
          </Field>
          <Field label="อะไหล่ที่เปลี่ยน">
            <Input
              value={form.partsReplaced}
              onChange={(e) =>
                setForm({ ...form, partsReplaced: e.target.value })
              }
            />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="ช่าง *">
              <Input
                required
                value={form.technicianName}
                onChange={(e) =>
                  setForm({ ...form, technicianName: e.target.value })
                }
              />
            </Field>
            <Field label="บริษัท">
              <Input
                value={form.company}
                onChange={(e) => setForm({ ...form, company: e.target.value })}
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="เลขที่ใบงาน">
              <Input
                value={form.jobNumber}
                onChange={(e) =>
                  setForm({ ...form, jobNumber: e.target.value })
                }
              />
            </Field>
            <Field label="ผู้รับงาน *">
              <Input
                required
                value={form.receiverName}
                onChange={(e) =>
                  setForm({ ...form, receiverName: e.target.value })
                }
              />
            </Field>
          </div>
          <Field label="เบอร์ติดต่อช่าง">
            <Input
              value={form.technicianContact}
              onChange={(e) =>
                setForm({ ...form, technicianContact: e.target.value })
              }
            />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="เริ่มหยุดใช้งาน">
              <Input
                type="datetime-local"
                value={form.downtimeFrom}
                onChange={(e) =>
                  setForm({ ...form, downtimeFrom: e.target.value })
                }
              />
            </Field>
            <Field label="กลับมาใช้งาน">
              <Input
                type="datetime-local"
                value={form.downtimeUntil}
                onChange={(e) =>
                  setForm({ ...form, downtimeUntil: e.target.value })
                }
              />
            </Field>
          </div>
          <Field label="วันแนะนำครั้งถัดไป">
            <Input
              type="date"
              value={form.nextRecommendedOn}
              onChange={(e) =>
                setForm({ ...form, nextRecommendedOn: e.target.value })
              }
            />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="ผลลัพธ์">
              <Select
                value={form.outcome}
                onChange={(e) => setForm({ ...form, outcome: e.target.value })}
              >
                <option value="pass">ผ่าน</option>
                <option value="conditional">ผ่านแบบมีเงื่อนไข</option>
                <option value="fail">ไม่ผ่าน</option>
              </Select>
            </Field>
            <Field label="สถานะเครื่องหลังงาน">
              <Select
                value={form.returnStatus}
                onChange={(e) =>
                  setForm({ ...form, returnStatus: e.target.value })
                }
              >
                <option value="active">พร้อมใช้งาน</option>
                <option value="maintenance">อยู่ระหว่างซ่อม</option>
                <option value="out_of_service">หยุดใช้งาน</option>
              </Select>
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <SignaturePad
              label="ลายเซ็นช่าง *"
              onReady={onTechnicianSignatureReady}
            />
            <SignaturePad
              label="ลายเซ็นผู้รับงาน *"
              onReady={onReceiverSignatureReady}
            />
          </div>
          {formError ? (
            <p className="rounded-md border border-[#efc7cc] bg-[#fff5f6] px-3 py-2 text-xs text-[#a83541]" role="alert">
              {formError}
            </p>
          ) : null}
          <Button disabled={busy || !form.equipmentId}>
            <ShieldCheck className="size-4" /> บันทึกประวัติ
          </Button>
              </form>
            </div>
          </section>
        </div>
      ) : null}
      {reasonDialog ? (
        <ReasonDialog
          title="Void ประวัติงาน"
          description="การ Void จะเก็บรายการเดิมไว้และต้องระบุเหตุผล"
          submitLabel="ยืนยัน Void"
          busy={busy}
          onCancel={() => setReasonDialog(null)}
          onSubmit={async (reason) => {
            const ok = await mutate(
              `/api/equipment/records/${reasonDialog.record.id}`,
              {
                method: "PATCH",
                body: JSON.stringify({ action: "void", reason }),
              },
              "Void รายการแล้ว",
            );
            if (ok) setReasonDialog(null);
            return ok;
          }}
        />
      ) : null}
    </div>
  );
}

type EquipmentRecordAttachment = EquipmentServiceRecord["attachments"][number];

const signatureKinds = new Set(["technician-signature", "receiver-signature"]);

function isSignatureAttachment(item: EquipmentRecordAttachment) {
  return signatureKinds.has(item.kind);
}

function isImageAttachment(item: EquipmentRecordAttachment) {
  return (
    item.contentType?.startsWith("image/") === true ||
    /\.(png|jpe?g|gif|webp)$/i.test(item.fileName)
  );
}

function recordEventLabel(record: EquipmentServiceRecord) {
  return record.eventType === "other" && record.otherEventLabel
    ? record.otherEventLabel
    : EQUIPMENT_EVENT_LABELS[record.eventType];
}

function OfficialRecordCard({
  record,
  equipment,
  index,
  actions,
  canDelete,
}: {
  record: EquipmentServiceRecord;
  equipment?: Equipment;
  index: number;
  actions?: React.ReactNode;
  canDelete: boolean;
}) {
  const equipmentPhoto = equipment?.photos[0];
  const snapshot = record.equipmentSnapshot;
  const equipmentCode = snapshot?.code ?? equipment?.code ?? "-";
  const equipmentName = snapshot?.name ?? equipment?.name ?? "-";
  const equipmentModel = snapshot?.model ?? equipment?.model ?? null;
  const equipmentSerial = snapshot?.serialNumber ?? equipment?.serialNumber ?? null;
  const serviceFiles = record.attachments.filter(
    (item) => !isSignatureAttachment(item),
  );
  const signatureByKind = new Map(
    record.attachments
      .filter(isSignatureAttachment)
      .map((item) => [item.kind, item]),
  );
  const statusLabel =
    record.status === "voided"
      ? "VOIDED"
      : record.status === "pending"
        ? "รอตรวจรับ"
        : record.status === "rejected"
          ? "REJECTED"
          : record.outcome.toUpperCase();
  const statusClass =
    record.status === "voided" || record.status === "rejected" || record.outcome === "fail"
      ? "bg-[#fff1f2] text-[#b33b46]"
      : record.outcome === "conditional"
        ? "bg-[#fff8e8] text-[#a76511]"
        : "bg-[#eef9f1] text-[#2f7d44]";
  const signatureSlots = [
    {
      kind: "technician-signature",
      label: "ลายเซ็นช่าง",
    },
    {
      kind: "receiver-signature",
      label: "ลายเซ็นผู้รับงาน",
    },
  ];

  return (
    <article className="overflow-hidden rounded-lg border border-[#cfdee0] bg-white">
      <div className="flex items-center gap-2.5 border-b border-[#e7eeee] bg-[#f8fbfb] px-3 py-2.5 sm:px-4">
        {equipmentPhoto ? (
          <div className="relative size-[54px] shrink-0 overflow-hidden rounded-md border border-[#cfdee0] bg-[#edf5f4]">
            <NextImage
              src={`/api/attachments/${equipmentPhoto.id}`}
              alt={`รูป ${equipmentName}`}
              fill
              sizes="54px"
              unoptimized
              className="object-cover"
            />
          </div>
        ) : (
          <div className="grid size-[54px] shrink-0 place-items-center rounded-md border border-[#dbe7e7] bg-[#f2f8f7] text-center text-[10px] text-[#789097]">
            ไม่มีรูป
          </div>
        )}
        <span className="mono shrink-0 text-[11px] font-bold text-[#0b7f76]">
          {String(index + 1).padStart(2, "0")}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold text-[#173d50]">
            {equipmentCode} · {equipmentName}
          </h3>
          <p className="truncate text-[11px] text-[#68828a]">
            {recordEventLabel(record)} · {formatDate(record.performedOn)} ·{" "}
            {record.company ?? "-"} / {record.technicianName}
          </p>
          <p className="truncate text-[11px] text-[#789097]">
            ไฟล์แนบ: {serviceFiles.map((item) => item.fileName).join(", ") || "-"}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${statusClass}`}
          >
            {statusLabel}
          </span>
          {actions}
        </div>
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-1 border-b border-[#e7eeee] px-3 py-1.5 text-[11px] text-[#58747d] sm:px-4">
        <span>รุ่น: {equipmentModel ?? "-"}</span>
        <span>S/N: {equipmentSerial ?? "-"}</span>
        <span>สถานะหลังงาน: {equipmentStatusLabel(record.returnStatus)}</span>
      </div>
      {record.status === "rejected" && record.rejectionReason ? (
        <div className="border-b border-[#efc7cc] bg-[#fff5f6] px-3 py-2 text-xs text-[#a83541] sm:px-4">
          เหตุผลที่ปฏิเสธ: {record.rejectionReason}
        </div>
      ) : null}
      {record.status === "voided" && record.voidReason ? (
        <div className="border-b border-[#efc7cc] bg-[#fff5f6] px-3 py-2 text-xs text-[#a83541] sm:px-4">
          เหตุผลที่ Void: {record.voidReason}
        </div>
      ) : null}
      <div className="grid gap-x-5 gap-y-4 border-b border-[#e7eeee] p-3 sm:grid-cols-2 sm:p-4">
        <OfficialDetail label="อาการ/ปัญหา" value={record.reportedProblem} />
        <OfficialDetail label="ผลตรวจสอบ" value={record.findings} />
        <OfficialDetail label="งานที่ดำเนินการ" value={record.actionTaken} />
        <OfficialDetail label="อะไหล่ที่เปลี่ยน" value={record.partsReplaced} />
      </div>
      <div className="flex flex-col gap-3 px-3 py-3 sm:flex-row sm:items-end sm:justify-between sm:px-4">
        <div className="space-y-0.5 text-[11px] leading-5 text-[#58747d]">
          <p>เลขที่ใบงาน: {record.jobNumber ?? "-"}</p>
          <p>ผู้รับงาน: {record.receiverName ?? "-"}</p>
          <p>
            ตรวจรับเมื่อ: {record.reviewedAt ? formatDateTime(record.reviewedAt) : "-"}
          </p>
        </div>
        <div className="grid w-full max-w-[280px] grid-cols-2 gap-4 self-end">
          {signatureSlots.map(({ kind, label }) => {
            const item = signatureByKind.get(kind);
            return (
              <figure key={kind} className="min-w-0 text-center">
                <div className="relative flex h-12 items-center justify-center border-b border-[#789097]">
                  {item && isImageAttachment(item) ? (
                    <a
                      href={`/api/attachments/${item.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="absolute inset-0 flex items-center justify-center rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0b7f76]"
                      aria-label={`เปิด${label}`}
                    >
                      <NextImage
                        src={`/api/attachments/${item.id}`}
                        alt={label}
                        fill
                        sizes="140px"
                        unoptimized
                        className="object-contain"
                      />
                    </a>
                  ) : item ? (
                    <a
                      href={`/api/attachments/${item.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="truncate px-1 text-[10px] font-semibold text-[#0b7f76] underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0b7f76]"
                    >
                      {item.fileName}
                    </a>
                  ) : (
                    <span className="text-[10px] text-[#a0b1b4]">ยังไม่มีลายเซ็น</span>
                  )}
                </div>
                <figcaption className="mt-1 truncate text-[10px] text-[#55727c]">
                  {label}
                </figcaption>
              </figure>
            );
          })}
        </div>
      </div>
      <details className="border-t border-[#e7eeee] bg-[#fbfdfd]">
        <summary className="cursor-pointer px-3 py-2 text-[11px] font-semibold text-[#55727c] underline-offset-2 hover:text-[#0b7f76] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#0b7f76] sm:px-4">
          จัดการไฟล์แนบเพิ่มเติม ({serviceFiles.length})
        </summary>
        <div className="px-3 pb-3 sm:px-4">
          <AttachmentList
            module="equipment"
            entityType="equipment-service-record"
            entityId={record.id}
            kind="service-file"
            canDelete={canDelete}
            excludeKinds={["technician-signature", "receiver-signature"]}
            initialItems={record.attachments}
            accept="image/jpeg,image/png,image/webp,application/pdf"
            label="เอกสารงาน / Service files"
          />
        </div>
      </details>
    </article>
  );
}

function OfficialDetail({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold tracking-[0.05em] text-[#789097]">
        {label}
      </p>
      <p className="mt-1 whitespace-pre-wrap break-words text-xs leading-5 text-[#315763]">
        {value || "-"}
      </p>
    </div>
  );
}

function ReasonDialog({
  title,
  description,
  submitLabel,
  busy,
  onCancel,
  onSubmit,
}: {
  title: string;
  description: string;
  submitLabel: string;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (reason: string) => Promise<boolean>;
}) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!reason.trim()) {
      setError("กรุณาระบุเหตุผล");
      return;
    }
    const ok = await onSubmit(reason.trim());
    if (!ok) setError("ดำเนินการไม่สำเร็จ กรุณาลองใหม่");
  }
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-3 sm:p-6"
      role="presentation"
      onMouseDown={onCancel}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="equipment-reason-dialog-title"
        className="w-full max-w-lg rounded-lg border border-[#c9dadd] bg-white p-4 shadow-2xl sm:p-5"
        onSubmit={submit}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="equipment-reason-dialog-title" className="font-bold text-[#173d50]">{title}</h2>
            <p className="mt-1 text-xs leading-5 text-[#789097]">{description}</p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md text-[#55727c] hover:bg-[#f1f7f6]"
            aria-label="ปิด"
          >
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>
        <Field label="เหตุผล *">
          <Textarea
            autoFocus
            required
            value={reason}
            onChange={(event) => {
              setReason(event.target.value);
              setError(null);
            }}
            rows={4}
            maxLength={2000}
          />
        </Field>
        {error ? <p className="mt-2 text-xs text-[#a83541]" role="alert">{error}</p> : null}
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="ghost" disabled={busy} onClick={onCancel}>ยกเลิก</Button>
          <Button type="submit" variant="danger" disabled={busy || !reason.trim()}>{submitLabel}</Button>
        </div>
      </form>
    </div>
  );
}

function Pending({
  workspace,
  busy,
  mutate,
}: {
  workspace: EquipmentWorkspace;
  busy: boolean;
  mutate: Mutate;
}) {
  const equipmentMap = new Map(
    workspace.equipment.map((item) => [item.id, item]),
  );
  const pending = workspace.records.filter(
    (record) => record.status === "pending",
  );
  const [rejectRecord, setRejectRecord] = useState<EquipmentServiceRecord | null>(null);
  async function review(
    record: EquipmentServiceRecord,
    action: "approve" | "reject",
  ) {
    if (action === "reject") {
      setRejectRecord(record);
      return;
    }
    await mutate(
      `/api/equipment/records/${record.id}`,
      { method: "PATCH", body: JSON.stringify({ action }) },
      "ตรวจรับและบันทึกประวัติแล้ว",
    );
  }
  return (
    <>
    <Card className="overflow-hidden">
      <div className="border-b border-[#eed4a6] bg-[#fff9ed] px-4 py-3">
        <h2 className="font-bold text-[#8f5919]">รายการจากช่างที่รอตรวจรับ</h2>
        <p className="mt-1 text-xs text-[#a9700f]">
          ตรวจข้อมูล ไฟล์ และลายเซ็นก่อนอนุมัติเป็นประวัติทางการ
        </p>
      </div>
      <div className="divide-y divide-[#edf2f2]">
        {pending.map((record, index) => (
            <OfficialRecordCard
              key={record.id}
              record={record}
              equipment={equipmentMap.get(record.equipmentId)}
              index={index}
              canDelete={false}
              actions={
                <div className="flex gap-1">
                  <Button
                    type="button"
                    variant="danger"
                    disabled={busy}
                    onClick={() => void review(record, "reject")}
                  >
                    ปฏิเสธ
                  </Button>
                  <Button
                    type="button"
                    disabled={busy}
                    onClick={() => void review(record, "approve")}
                  >
                    <ClipboardCheck className="size-4" aria-hidden="true" /> ตรวจรับ
                  </Button>
                </div>
              }
            />
        ))}
        {!pending.length ? <Empty text="ไม่มีรายการรอตรวจรับ" /> : null}
      </div>
    </Card>
    {rejectRecord ? (
      <ReasonDialog
        title="ปฏิเสธประวัติงาน"
        description="ระบุจุดที่ต้องแก้ไข ผู้บันทึกจะส่งรายการกลับเข้าคิวตรวจใหม่ได้"
        submitLabel="ยืนยันปฏิเสธ"
        busy={busy}
        onCancel={() => setRejectRecord(null)}
        onSubmit={async (reason) => {
          const ok = await mutate(
            `/api/equipment/records/${rejectRecord.id}`,
            {
              method: "PATCH",
              body: JSON.stringify({ action: "reject", reason }),
            },
            "ปฏิเสธรายการแล้ว",
          );
          if (ok) setRejectRecord(null);
          return ok;
        }}
      />
    ) : null}
    </>
  );
}

function DueBadge({ plan }: { plan: EquipmentPlan }) {
  return plan.dueState === "overdue" ? (
    <StatusBadge tone="rejected" label="เกินกำหนด" />
  ) : plan.dueState === "due_soon" ? (
    <StatusBadge tone="warning" label="ใกล้ครบกำหนด" />
  ) : (
    <StatusBadge tone="accepted" label="ตามแผน" />
  );
}
function EquipmentStatusBadge({ status }: { status: EquipmentStatus }) {
  return (
    <StatusBadge
      tone={
        status === "active"
          ? "accepted"
          : status === "maintenance"
            ? "warning"
            : status === "out_of_service"
              ? "rejected"
              : "neutral"
      }
      label={equipmentStatusLabel(status)}
    />
  );
}
function Info({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div>
      <p className="text-[10px] font-bold tracking-[.12em] text-[#8ba0a5] uppercase">
        {label}
      </p>
      <p className="mt-1 whitespace-pre-line text-sm text-[#315763]">
        {value || "-"}
      </p>
    </div>
  );
}
function Empty({ text }: { text: string }) {
  return (
    <div className="grid min-h-28 place-items-center px-4 py-8 text-center text-sm text-[#8ba0a5]">
      <div>
        <FileClock className="mx-auto mb-2 size-6 text-[#b2c4c7]" />
        {text}
      </div>
    </div>
  );
}
type Mutate = (
  url: string,
  options: RequestInit,
  success: string,
) => Promise<boolean>;
