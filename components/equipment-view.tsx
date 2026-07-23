"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Activity,
  CalendarClock,
  ClipboardCheck,
  ExternalLink,
  FileClock,
  History,
  Image as ImageIcon,
  Link2,
  Plus,
  Printer,
  QrCode,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Stethoscope,
  Trash2,
  Wrench,
} from "lucide-react";
import type { BmActor } from "@/lib/bm/types";
import { formatDate, todayBangkok } from "@/lib/bm/rules";
import {
  EQUIPMENT_EVENT_LABELS,
  EQUIPMENT_PLAN_TYPES,
  equipmentStatusLabel,
} from "@/lib/equipment/rules";
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
  { key: "registry" as const, label: "ทะเบียนเครื่องมือ", icon: Stethoscope },
  { key: "plans" as const, label: "แผนงาน", icon: CalendarClock },
  { key: "history" as const, label: "ประวัติงาน", icon: History },
  { key: "pending" as const, label: "รอตรวจรับ", icon: ClipboardCheck },
];

export function EquipmentView({
  actor,
  initialData,
}: {
  actor: BmActor;
  initialData: EquipmentWorkspace;
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
      setNotice({
        tone: "danger",
        text: error instanceof Error ? error.message : "บันทึกไม่สำเร็จ",
      });
      return false;
    } finally {
      setBusy(false);
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
                  กำหนด {formatDate(plan.nextDueOn)}
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

const emptyEquipmentForm = {
  code: "",
  name: "",
  category: "",
  manufacturer: "",
  model: "",
  serialNumber: "",
  assetNumber: "",
  location: "",
  installedOn: "",
  warrantyUntil: "",
  status: "active" as EquipmentStatus,
  note: "",
};
function Registry({
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
  const requestedEquipment = useSearchParams().get("equipment");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState(
    requestedEquipment &&
      workspace.equipment.some((item) => item.id === requestedEquipment)
      ? requestedEquipment
      : (workspace.equipment[0]?.id ?? ""),
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyEquipmentForm);
  const [linkModule, setLinkModule] = useState<"iqc" | "eqa">("iqc");
  const [linkEntity, setLinkEntity] = useState("");
  const filtered = workspace.equipment.filter((item) =>
    [
      item.code,
      item.name,
      item.serialNumber,
      item.assetNumber,
      item.location,
    ].some((value) =>
      value?.toLowerCase().includes(search.trim().toLowerCase()),
    ),
  );
  const selected =
    workspace.equipment.find((item) => item.id === selectedId) ??
    filtered[0] ??
    null;
  function edit(item: Equipment) {
    setEditingId(item.id);
    setForm({
      code: item.code,
      name: item.name,
      category: item.category ?? "",
      manufacturer: item.manufacturer ?? "",
      model: item.model ?? "",
      serialNumber: item.serialNumber ?? "",
      assetNumber: item.assetNumber ?? "",
      location: item.location ?? "",
      installedOn: item.installedOn ?? "",
      warrantyUntil: item.warrantyUntil ?? "",
      status: item.status,
      note: item.note ?? "",
    });
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    const url = editingId
      ? `/api/equipment/items/${editingId}`
      : "/api/equipment/items";
    const payload = {
      ...form,
      installedOn: form.installedOn || null,
      warrantyUntil: form.warrantyUntil || null,
    };
    const ok = await mutate(
      url,
      { method: editingId ? "PATCH" : "POST", body: JSON.stringify(payload) },
      editingId ? "แก้ไขเครื่องมือแล้ว" : "เพิ่มเครื่องมือแล้ว",
    );
    if (ok) {
      setEditingId(null);
      setForm(emptyEquipmentForm);
    }
  }
  async function remove(item: Equipment) {
    if (
      !window.confirm(
        `ลบเครื่องมือ ${item.code}? ถ้ามีแผนหรือประวัติ ระบบจะไม่อนุญาตให้ลบ`,
      )
    )
      return;
    await mutate(
      `/api/equipment/items/${item.id}`,
      { method: "DELETE" },
      `ลบ ${item.code} แล้ว`,
    );
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
    if (!selected || !linkEntity) return;
    const ok = await mutate(
      "/api/equipment/links",
      {
        method: "POST",
        body: JSON.stringify({
          equipmentId: selected.id,
          module: linkModule,
          entityId: linkEntity,
        }),
      },
      "เชื่อมโมดูลแล้ว",
    );
    if (ok) setLinkEntity("");
  }
  const links = selected
    ? workspace.links.filter((link) => link.equipmentId === selected.id)
    : [];
  return (
    <div className="grid gap-4 2xl:grid-cols-[400px_minmax(0,1fr)]">
      <div className="space-y-4">
        {actor.role === "Admin" ? (
          <Card className="p-4">
            <h2 className="font-bold text-[#173d50]">
              {editingId ? "แก้ไขเครื่องมือ" : "เพิ่มเครื่องมือ"}
            </h2>
            <form
              onSubmit={save}
              className="mt-4 grid gap-3 sm:grid-cols-2 2xl:grid-cols-1"
            >
              <Field label="รหัสเครื่องมือ *">
                <Input
                  required
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                />
              </Field>
              <Field label="ชื่อเครื่องมือ *">
                <Input
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </Field>
              <Field label="ประเภท">
                <Input
                  value={form.category}
                  onChange={(e) =>
                    setForm({ ...form, category: e.target.value })
                  }
                />
              </Field>
              <Field label="ผู้ผลิต">
                <Input
                  value={form.manufacturer}
                  onChange={(e) =>
                    setForm({ ...form, manufacturer: e.target.value })
                  }
                />
              </Field>
              <Field label="รุ่น">
                <Input
                  value={form.model}
                  onChange={(e) => setForm({ ...form, model: e.target.value })}
                />
              </Field>
              <Field label="Serial No.">
                <Input
                  value={form.serialNumber}
                  onChange={(e) =>
                    setForm({ ...form, serialNumber: e.target.value })
                  }
                />
              </Field>
              <Field label="Asset No.">
                <Input
                  value={form.assetNumber}
                  onChange={(e) =>
                    setForm({ ...form, assetNumber: e.target.value })
                  }
                />
              </Field>
              <Field label="สถานที่">
                <Input
                  value={form.location}
                  onChange={(e) =>
                    setForm({ ...form, location: e.target.value })
                  }
                />
              </Field>
              <Field label="วันที่ติดตั้ง">
                <Input
                  type="date"
                  value={form.installedOn}
                  onChange={(e) =>
                    setForm({ ...form, installedOn: e.target.value })
                  }
                />
              </Field>
              <Field label="หมดประกัน">
                <Input
                  type="date"
                  value={form.warrantyUntil}
                  onChange={(e) =>
                    setForm({ ...form, warrantyUntil: e.target.value })
                  }
                />
              </Field>
              <Field label="สถานะ">
                <Select
                  value={form.status}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      status: e.target.value as EquipmentStatus,
                    })
                  }
                >
                  {(
                    [
                      "active",
                      "maintenance",
                      "out_of_service",
                      "decommissioned",
                    ] as const
                  ).map((status) => (
                    <option key={status} value={status}>
                      {equipmentStatusLabel(status)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="หมายเหตุ">
                <Textarea
                  value={form.note}
                  onChange={(e) => setForm({ ...form, note: e.target.value })}
                />
              </Field>
              <div className="flex gap-2 sm:col-span-2 2xl:col-span-1">
                <Button disabled={busy}>
                  {editingId ? "บันทึกการแก้ไข" : "เพิ่มเครื่องมือ"}
                </Button>
                {editingId ? (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setEditingId(null);
                      setForm(emptyEquipmentForm);
                    }}
                  >
                    ยกเลิก
                  </Button>
                ) : null}
              </div>
            </form>
          </Card>
        ) : null}
        <Card className="overflow-hidden">
          <div className="relative border-b border-[#e1eaeb] p-3">
            <Search className="absolute top-5 left-6 size-4 text-[#8ba0a5]" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
              placeholder="ค้นหารหัส ชื่อ Serial หรือสถานที่"
            />
          </div>
          <div className="max-h-[620px] divide-y divide-[#edf2f2] overflow-y-auto">
            {filtered.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setSelectedId(item.id)}
                className={`flex w-full items-center gap-3 px-4 py-3 text-left ${selected?.id === item.id ? "bg-[#eaf7f5]" : "hover:bg-[#f8fbfb]"}`}
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
            ))}
          </div>
        </Card>
      </div>
      {selected ? (
        <div className="space-y-4">
          <Card className="overflow-hidden">
            <div className="bg-[linear-gradient(120deg,#123944,#0b6f69)] p-5 text-white">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="mono text-xs font-bold tracking-[.16em] text-[#8fe5dc]">
                    {selected.code}
                  </p>
                  <h2 className="mt-2 text-2xl font-bold">{selected.name}</h2>
                  <p className="mt-2 text-sm text-[#c5dfe3]">
                    {selected.manufacturer ?? "-"} · {selected.model ?? "-"} ·{" "}
                    {selected.location ?? "-"}
                  </p>
                </div>
                <EquipmentStatusBadge status={selected.status} />
              </div>
            </div>
            <div className="grid gap-3 p-4 sm:grid-cols-3">
              <Info label="Serial No." value={selected.serialNumber} />
              <Info label="Asset No." value={selected.assetNumber} />
              <Info
                label="ติดตั้ง"
                value={
                  selected.installedOn ? formatDate(selected.installedOn) : null
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
              {actor.role === "Admin" ? (
                <>
                  <Button variant="secondary" onClick={() => edit(selected)}>
                    <Settings2 className="size-4" /> แก้ไข
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={busy}
                    onClick={() => void rotate(selected)}
                  >
                    <RefreshCw className="size-4" /> เปลี่ยน QR
                  </Button>
                  <Button
                    variant="danger"
                    disabled={busy}
                    onClick={() => void remove(selected)}
                  >
                    <Trash2 className="size-4" /> ลบ
                  </Button>
                </>
              ) : null}
            </div>
          </Card>
          {selected.photos.length ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
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
          <AttachmentList
            module="equipment"
            entityType="equipment"
            entityId={selected.id}
            kind="equipment-photo"
            canDelete={actor.role === "Admin"}
            canUpload={actor.role === "Admin"}
            accept="image/jpeg,image/png,image/webp"
            label="รูปเครื่องมือ"
          />
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
                <Select
                  value={linkEntity}
                  onChange={(e) => setLinkEntity(e.target.value)}
                >
                  <option value="">เลือกรายการ</option>
                  {(linkModule === "iqc"
                    ? workspace.iqcInstruments.map((item) => ({
                        id: item.id,
                        label: `${item.code} · ${item.name}`,
                      }))
                    : workspace.eqaSchemes.map((item) => ({
                        id: item.id,
                        label: `${item.code ? `${item.code} · ` : ""}${item.name}`,
                      }))
                  ).map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </Select>
                <Button
                  disabled={!linkEntity || busy}
                  onClick={() => void addLink()}
                >
                  <Plus className="size-4" /> เชื่อม
                </Button>
              </div>
            ) : null}
          </Card>
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
  nextDueOn: todayBangkok(),
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
                  .filter((item) => item.status !== "decommissioned")
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
              <Field label="ครบกำหนดครั้งถัดไป">
                <Input
                  type="date"
                  required
                  value={form.nextDueOn}
                  onChange={(e) =>
                    setForm({ ...form, nextDueOn: e.target.value })
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
      <Card className="overflow-hidden">
        <div className="border-b border-[#e1eaeb] bg-[#fbfdfd] px-4 py-3">
          <h2 className="font-bold text-[#173d50]">แผนงานทั้งหมด</h2>
          <p className="mt-1 text-xs text-[#789097]">เรียงตามวันครบกำหนด</p>
        </div>
        <div className="divide-y divide-[#edf2f2]">
          {workspace.plans.map((plan) => (
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
                  ครบกำหนด {formatDate(plan.nextDueOn)}
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
          {!workspace.plans.length ? <Empty text="ยังไม่มีแผนงาน" /> : null}
        </div>
      </Card>
    </div>
  );
}

const emptyRecord = {
  equipmentId: "",
  planId: "",
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
}: {
  actor: BmActor;
  workspace: EquipmentWorkspace;
  busy: boolean;
  mutate: Mutate;
}) {
  const [form, setForm] = useState(emptyRecord);
  const [search, setSearch] = useState("");
  const equipmentMap = new Map(
    workspace.equipment.map((item) => [item.id, item]),
  );
  const approved = workspace.records
    .filter(
      (record) => record.status === "approved" || record.status === "voided",
    )
    .filter((record) =>
      [
        equipmentMap.get(record.equipmentId)?.code,
        record.technicianName,
        record.company,
        EQUIPMENT_EVENT_LABELS[record.eventType],
      ].some((value) =>
        value?.toLowerCase().includes(search.trim().toLowerCase()),
      ),
    );
  const plans = workspace.plans.filter(
    (plan) => plan.equipmentId === form.equipmentId && plan.isActive,
  );
  async function save(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      ...form,
      planId: form.planId || null,
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
    const ok = await mutate(
      "/api/equipment/records",
      { method: "POST", body: JSON.stringify(payload) },
      "บันทึกประวัติงานแล้ว",
    );
    if (ok) setForm(emptyRecord);
  }
  return (
    <div className="grid gap-4 2xl:grid-cols-[420px_minmax(0,1fr)]">
      <Card className="p-4">
        <h2 className="font-bold text-[#173d50]">บันทึกงานภายใน</h2>
        <p className="mt-1 text-xs text-[#789097]">
          รายการจาก Staff จะเป็นประวัติทางการทันที
        </p>
        <form onSubmit={save} className="mt-4 space-y-3">
          <Field label="เครื่องมือ *">
            <Select
              required
              value={form.equipmentId}
              onChange={(e) =>
                setForm({ ...form, equipmentId: e.target.value, planId: "" })
              }
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
                  {plan.title} · {formatDate(plan.nextDueOn)}
                </option>
              ))}
            </Select>
          </Field>
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
            <Field label="ผู้รับงาน">
              <Input
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
          <Button disabled={busy || !form.equipmentId}>
            <ShieldCheck className="size-4" /> บันทึกประวัติ
          </Button>
        </form>
      </Card>
      <Card className="overflow-hidden">
        <div className="flex flex-col gap-2 border-b border-[#e1eaeb] bg-[#fbfdfd] p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-bold text-[#173d50]">ประวัติงานทางการ</h2>
            <p className="text-xs text-[#789097]">Approved และ Voided</p>
          </div>
          <div className="flex gap-2">
            <div className="relative">
              <Search className="absolute top-2.5 left-3 size-4 text-[#8ba0a5]" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
                placeholder="ค้นหาประวัติ"
              />
            </div>
            <Link href="/equipment/report">
              <Button variant="secondary">
                <Printer className="size-4" />
              </Button>
            </Link>
          </div>
        </div>
        <div className="divide-y divide-[#edf2f2]">
          {approved.map((record) => (
            <div key={record.id} className="space-y-3 p-4">
              <ServiceRow
                record={record}
                equipment={equipmentMap.get(record.equipmentId)}
                actions={
                  record.status === "approved" ? (
                    <Button
                      variant="ghost"
                      disabled={busy}
                      onClick={() => {
                        const reason = window.prompt(
                          "เหตุผลที่ void รายการนี้",
                        );
                        if (reason)
                          void mutate(
                            `/api/equipment/records/${record.id}`,
                            {
                              method: "PATCH",
                              body: JSON.stringify({ action: "void", reason }),
                            },
                            "Void รายการแล้ว",
                          );
                      }}
                    >
                      Void
                    </Button>
                  ) : null
                }
              />
              <AttachmentList
                module="equipment"
                entityType="equipment-service-record"
                entityId={record.id}
                kind="service-file"
                canDelete={actor.role === "Admin"}
                accept="image/jpeg,image/png,image/webp,application/pdf"
                label="เอกสารงาน / Service files"
              />
            </div>
          ))}
          {!approved.length ? <Empty text="ยังไม่มีประวัติงาน" /> : null}
        </div>
      </Card>
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
  async function review(
    record: EquipmentServiceRecord,
    action: "approve" | "reject",
  ) {
    const reason =
      action === "reject" ? window.prompt("ระบุเหตุผลที่ปฏิเสธ") : null;
    if (action === "reject" && !reason) return;
    if (
      !window.confirm(
        action === "approve"
          ? `ยืนยันตรวจรับงานของ ${record.technicianName}?`
          : "ยืนยันปฏิเสธรายการนี้?",
      )
    )
      return;
    await mutate(
      `/api/equipment/records/${record.id}`,
      { method: "PATCH", body: JSON.stringify({ action, reason }) },
      action === "approve" ? "ตรวจรับและบันทึกประวัติแล้ว" : "ปฏิเสธรายการแล้ว",
    );
  }
  async function edit(record: EquipmentServiceRecord) {
    const actionTaken = window.prompt("งานที่ดำเนินการ", record.actionTaken);
    if (!actionTaken?.trim()) return;
    const findings = window.prompt("ผลตรวจสอบ", record.findings ?? "");
    if (findings === null) return;
    const jobNumber = window.prompt("เลขที่ใบงาน", record.jobNumber ?? "");
    if (jobNumber === null) return;
    await mutate(
      `/api/equipment/records/${record.id}`,
      {
        method: "PUT",
        body: JSON.stringify({
          equipmentId: record.equipmentId,
          planId: record.planId,
          eventType: record.eventType,
          otherEventLabel: record.otherEventLabel,
          qualificationStage: record.qualificationStage,
          performedOn: record.performedOn,
          reportedProblem: record.reportedProblem,
          findings,
          actionTaken,
          partsReplaced: record.partsReplaced,
          jobNumber,
          company: record.company,
          technicianName: record.technicianName,
          technicianContact: record.technicianContact,
          receiverName: record.receiverName,
          downtimeFrom: record.downtimeFrom,
          downtimeUntil: record.downtimeUntil,
          outcome: record.outcome,
          returnStatus: record.returnStatus,
          nextRecommendedOn: record.nextRecommendedOn,
        }),
      },
      "แก้ไขข้อมูลก่อนตรวจรับแล้ว",
    );
  }
  return (
    <Card className="overflow-hidden">
      <div className="border-b border-[#eed4a6] bg-[#fff9ed] px-4 py-3">
        <h2 className="font-bold text-[#8f5919]">รายการจากช่างที่รอตรวจรับ</h2>
        <p className="mt-1 text-xs text-[#a9700f]">
          ตรวจข้อมูล ไฟล์ และลายเซ็นก่อนอนุมัติเป็นประวัติทางการ
        </p>
      </div>
      <div className="divide-y divide-[#edf2f2]">
        {pending.map((record) => (
          <div key={record.id} className="p-4">
            <ServiceRow
              record={record}
              equipment={equipmentMap.get(record.equipmentId)}
            />
            <div className="mt-3 grid gap-3 rounded-lg border border-[#e4ecec] bg-[#fbfdfd] p-3 sm:grid-cols-3">
              <Info label="งานที่ทำ" value={record.actionTaken} />
              <Info label="ผลตรวจสอบ" value={record.findings} />
              <Info label="ผู้รับงาน" value={record.receiverName} />
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {record.attachments.map((item) => (
                <a
                  key={item.id}
                  href={`/api/attachments/${item.id}`}
                  target="_blank"
                  className="flex items-center gap-2 rounded border border-[#dce8e9] px-3 py-2 text-xs font-semibold text-[#0b7f76]"
                >
                  <ImageIcon className="size-4" />{" "}
                  {item.kind === "technician-signature"
                    ? "ลายเซ็นช่าง"
                    : item.kind === "receiver-signature"
                      ? "ลายเซ็นผู้รับงาน"
                      : item.fileName}
                </a>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap justify-end gap-2">
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => void edit(record)}
              >
                แก้ไขข้อมูล
              </Button>
              <Button
                variant="danger"
                disabled={busy}
                onClick={() => void review(record, "reject")}
              >
                ปฏิเสธ
              </Button>
              <Button
                disabled={busy}
                onClick={() => void review(record, "approve")}
              >
                <ClipboardCheck className="size-4" /> ตรวจรับ
              </Button>
            </div>
          </div>
        ))}
        {!pending.length ? <Empty text="ไม่มีรายการรอตรวจรับ" /> : null}
      </div>
    </Card>
  );
}

function ServiceRow({
  record,
  equipment,
  actions,
}: {
  record: EquipmentServiceRecord;
  equipment?: Equipment;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="grid size-11 shrink-0 place-items-center rounded-lg bg-[#e8f4f3] text-[#0b7f76]">
        <Wrench className="size-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <strong className="text-sm text-[#173d50]">
            {equipment?.code ?? "-"} ·{" "}
            {EQUIPMENT_EVENT_LABELS[record.eventType]}
          </strong>
          <RecordStatusBadge record={record} />
        </div>
        <p className="mt-1 text-xs text-[#789097]">
          {formatDate(record.performedOn)} · {record.technicianName}
          {record.company ? ` · ${record.company}` : ""}
        </p>
        <p className="mt-1 line-clamp-2 text-xs text-[#55727c]">
          {record.actionTaken}
        </p>
      </div>
      {actions}
    </div>
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
function RecordStatusBadge({ record }: { record: EquipmentServiceRecord }) {
  return (
    <StatusBadge
      tone={
        record.status === "approved"
          ? "accepted"
          : record.status === "pending"
            ? "warning"
            : record.status === "rejected"
              ? "rejected"
              : "neutral"
      }
      label={
        record.status === "pending"
          ? "รอตรวจรับ"
          : record.status === "approved"
            ? "อนุมัติแล้ว"
            : record.status === "rejected"
              ? "ปฏิเสธ"
              : "Voided"
      }
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
