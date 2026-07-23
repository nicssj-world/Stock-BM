"use client";

import { useCallback, useRef, useState } from "react";
import {
  CheckCircle2,
  FileUp,
  LoaderCircle,
  ShieldCheck,
  Stethoscope,
  Wrench,
} from "lucide-react";
import type {
  EquipmentEventType,
  EquipmentOutcome,
  PublicEquipmentContext,
} from "@/lib/equipment/types";
import {
  EQUIPMENT_EVENT_LABELS,
  equipmentStatusLabel,
  formatEquipmentDueMonth,
} from "@/lib/equipment/rules";
import { todayBangkok } from "@/lib/bm/rules";
import {
  SignaturePad,
  type SignaturePadHandle,
} from "@/components/signature-pad";
import {
  Button,
  Field,
  Input,
  Notice,
  Select,
  Textarea,
} from "@/components/ui";

export function EquipmentPublicForm({
  token,
  context,
}: {
  token: string;
  context: PublicEquipmentContext;
}) {
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const technicianPad = useRef<SignaturePadHandle | null>(null);
  const receiverPad = useRef<SignaturePadHandle | null>(null);
  const idempotencyKey = useRef<string | null>(null);
  const technicianReady = useCallback((handle: SignaturePadHandle) => {
    technicianPad.current = handle;
  }, []);
  const receiverReady = useCallback((handle: SignaturePadHandle) => {
    receiverPad.current = handle;
  }, []);
  const [eventType, setEventType] = useState<EquipmentEventType>("pm");
  const [planId, setPlanId] = useState("");
  const [outcome, setOutcome] = useState<EquipmentOutcome>("pass");
  const [returnStatus, setReturnStatus] = useState<
    "active" | "maintenance" | "out_of_service"
  >("active");
  const [selectedTechnicianId, setSelectedTechnicianId] = useState("");
  const [technicianName, setTechnicianName] = useState("");
  const [company, setCompany] = useState("");
  const [technicianContact, setTechnicianContact] = useState("");

  function selectTechnician(id: string) {
    setSelectedTechnicianId(id);
    const technician = context.technicians.find((item) => item.id === id);
    setTechnicianName(technician?.technicianName ?? "");
    setCompany(technician?.company ?? "");
    setTechnicianContact(technician?.phone ?? "");
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (technicianPad.current?.isEmpty() || receiverPad.current?.isEmpty()) {
      setError("กรุณาลงลายเซ็นให้ครบทั้งช่างและผู้รับงาน");
      return;
    }
    const form = new FormData(event.currentTarget);
    idempotencyKey.current ??= crypto.randomUUID();
    form.set("eventType", eventType);
    form.set("planId", planId);
    form.set("outcome", outcome);
    form.set("returnStatus", returnStatus);
    form.set("idempotencyKey", idempotencyKey.current);
    const [technicianSignature, receiverSignature] = await Promise.all([
      technicianPad.current?.toFile(),
      receiverPad.current?.toFile(),
    ]);
    if (!technicianSignature || !receiverSignature) {
      setError("ไม่สามารถอ่านลายเซ็นได้ กรุณาลงลายเซ็นใหม่");
      return;
    }
    form.set("technicianSignature", technicianSignature);
    form.set("receiverSignature", receiverSignature);
    setBusy(true);
    try {
      const response = await fetch(`/api/equipment/public/${token}`, {
        method: "POST",
        body: form,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(payload.error ?? "ส่งแบบฟอร์มไม่สำเร็จ");
      setSubmitted(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "ส่งแบบฟอร์มไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  if (submitted)
    return (
      <main className="grid min-h-screen place-items-center bg-[#edf5f4] p-5">
        <section className="w-full max-w-md rounded-2xl border border-[#b9dcd7] bg-white p-7 text-center shadow-[0_24px_70px_rgba(18,57,68,.14)]">
          <div className="mx-auto grid size-16 place-items-center rounded-full bg-[#e7f7f4] text-[#0b7f76]">
            <CheckCircle2 className="size-8" />
          </div>
          <h1 className="mt-5 text-2xl font-bold text-[#173d50]">
            ส่งแบบฟอร์มแล้ว
          </h1>
          <p className="mt-2 text-sm leading-6 text-[#68828a]">
            รายการอยู่ระหว่างการตรวจรับโดยเจ้าหน้าที่ห้องปฏิบัติการ
            สามารถปิดหน้านี้ได้
          </p>
        </section>
      </main>
    );

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(67,184,174,.18),transparent_35%),#edf4f3] px-3 py-5 sm:px-5">
      <div className="mx-auto max-w-2xl space-y-4">
        <header className="overflow-hidden rounded-2xl bg-[#123944] text-white shadow-[0_20px_55px_rgba(18,57,68,.22)]">
          <div className="border-b border-white/10 px-5 py-4">
            <p className="text-[10px] font-bold tracking-[.18em] text-[#7ee3d8] uppercase">
              Chonburi Hospital · Field service
            </p>
          </div>
          <div className="flex items-start gap-4 px-5 py-5">
            <div className="grid size-12 shrink-0 place-items-center rounded-xl bg-white/10 text-[#7ee3d8]">
              <Stethoscope className="size-6" />
            </div>
            <div>
              <p className="mono text-xs font-bold text-[#8fe5dc]">
                {context.equipment.code}
              </p>
              <h1 className="mt-1 text-xl font-bold">
                {context.equipment.name}
              </h1>
              <p className="mt-1 text-xs text-[#bad8dd]">
                {context.equipment.manufacturer ?? "-"} ·{" "}
                {context.equipment.model ?? "-"} ·{" "}
                {equipmentStatusLabel(context.equipment.status)}
              </p>
            </div>
          </div>
        </header>
        {error ? <Notice tone="danger">{error}</Notice> : null}
        <form onSubmit={submit} className="space-y-4">
          <section className="rounded-2xl border border-[#d5e4e4] bg-white p-4 shadow-[0_12px_35px_rgba(20,64,72,.08)]">
            <Step number="01" title="ข้อมูลงาน" icon={<Wrench />} />
            <div className="mt-4 space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="ประเภทงาน *">
                  <Select
                    value={eventType}
                    onChange={(e) =>
                      setEventType(e.target.value as EquipmentEventType)
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
                <Field label="วันที่ทำงาน *">
                  <Input
                    required
                    name="performedOn"
                    type="date"
                    defaultValue={todayBangkok()}
                  />
                </Field>
              </div>
              {eventType === "other" ? (
                <Field label="ระบุประเภทอื่น *">
                  <Input required name="otherEventLabel" />
                </Field>
              ) : null}
              {eventType === "qualification" ? (
                <Field label="Qualification stage">
                  <Select name="qualificationStage">
                    <option value="">ไม่ระบุ</option>
                    <option>IQ</option>
                    <option>OQ</option>
                    <option>PQ</option>
                  </Select>
                </Field>
              ) : null}
              <Field label="แผนที่เกี่ยวข้อง">
                <Select
                  value={planId}
                  onChange={(e) => setPlanId(e.target.value)}
                >
                  <option value="">ไม่ผูกแผน</option>
                  {context.plans.map((plan) => (
                    <option key={plan.id} value={plan.id}>
                      {plan.title} · {formatEquipmentDueMonth(plan.nextDueOn)}
                    </option>
                  ))}
                </Select>
              </Field>
              <div className="rounded-xl border border-[#cfe4e1] bg-[#f1faf8] p-3">
                <Field label="เลือกช่างจากทะเบียนเครื่องนี้">
                  <Select
                    value={selectedTechnicianId}
                    onChange={(event) => selectTechnician(event.target.value)}
                  >
                    <option value="">ช่างอื่น / กรอกเอง</option>
                    {context.technicians.map((technician) => (
                      <option key={technician.id} value={technician.id}>
                        {technician.technicianName}
                        {technician.company ? ` · ${technician.company}` : ""}
                      </option>
                    ))}
                  </Select>
                </Field>
                <p className="mt-2 text-[11px] leading-5 text-[#68828a]">
                  เลือกแล้วระบบจะเติมข้อมูลให้ แต่ยังแก้ไขชื่อ บริษัท และเบอร์ได้
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="ชื่อช่าง *">
                  <Input
                    required
                    name="technicianName"
                    autoComplete="name"
                    value={technicianName}
                    onChange={(event) => setTechnicianName(event.target.value)}
                  />
                </Field>
                <Field label="บริษัท">
                  <Input
                    name="company"
                    value={company}
                    onChange={(event) => setCompany(event.target.value)}
                  />
                </Field>
              </div>
              <Field label="เบอร์ติดต่อ">
                <Input
                  name="technicianContact"
                  inputMode="tel"
                  value={technicianContact}
                  onChange={(event) =>
                    setTechnicianContact(event.target.value)
                  }
                />
              </Field>
              <Field label="เลขที่ใบงาน">
                <Input name="jobNumber" />
              </Field>
            </div>
          </section>
          <section className="rounded-2xl border border-[#d5e4e4] bg-white p-4 shadow-[0_12px_35px_rgba(20,64,72,.08)]">
            <Step
              number="02"
              title="รายละเอียดการดำเนินการ"
              icon={<FileUp />}
            />
            <div className="mt-4 space-y-3">
              <Field label="อาการ/ปัญหาที่แจ้ง">
                <Textarea name="reportedProblem" rows={3} />
              </Field>
              <Field label="ผลตรวจสอบ">
                <Textarea name="findings" rows={3} />
              </Field>
              <Field label="งานที่ดำเนินการ *">
                <Textarea required name="actionTaken" rows={4} />
              </Field>
              <Field label="อะไหล่ที่เปลี่ยน">
                <Textarea name="partsReplaced" rows={2} />
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="ผลลัพธ์">
                  <Select
                    value={outcome}
                    onChange={(e) =>
                      setOutcome(e.target.value as EquipmentOutcome)
                    }
                  >
                    <option value="pass">ผ่าน</option>
                    <option value="conditional">ผ่านแบบมีเงื่อนไข</option>
                    <option value="fail">ไม่ผ่าน</option>
                  </Select>
                </Field>
                <Field label="สถานะเครื่องหลังงาน">
                  <Select
                    value={returnStatus}
                    onChange={(e) =>
                      setReturnStatus(e.target.value as typeof returnStatus)
                    }
                  >
                    <option value="active">พร้อมใช้งาน</option>
                    <option value="maintenance">อยู่ระหว่างซ่อม</option>
                    <option value="out_of_service">หยุดใช้งาน</option>
                  </Select>
                </Field>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="เริ่มหยุดใช้งาน">
                  <Input name="downtimeFrom" type="datetime-local" />
                </Field>
                <Field label="กลับมาใช้งาน">
                  <Input name="downtimeUntil" type="datetime-local" />
                </Field>
              </div>
              <Field label="วันแนะนำครั้งถัดไป">
                <Input name="nextRecommendedOn" type="date" />
              </Field>
              <Field label="ไฟล์แนบ (รูปหรือ PDF สูงสุด 5 ไฟล์ ไฟล์ละ 15 MB)">
                <Input
                  name="files"
                  type="file"
                  multiple
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                />
              </Field>
            </div>
          </section>
          <section className="rounded-2xl border border-[#d5e4e4] bg-white p-4 shadow-[0_12px_35px_rgba(20,64,72,.08)]">
            <Step
              number="03"
              title="ตรวจรับและลงลายเซ็น"
              icon={<ShieldCheck />}
            />
            <div className="mt-4 space-y-3">
              <Field label="ชื่อผู้รับงาน *">
                <Input required name="receiverName" />
              </Field>
              <SignaturePad label="ลายเซ็นช่าง *" onReady={technicianReady} />
              <SignaturePad
                label="ลายเซ็นผู้รับงาน *"
                onReady={receiverReady}
              />
            </div>
          </section>
          <input
            name="website"
            tabIndex={-1}
            autoComplete="off"
            className="hidden"
            aria-hidden="true"
          />
          <Button
            className="min-h-14 w-full rounded-xl text-base"
            disabled={busy}
          >
            {busy ? (
              <LoaderCircle className="size-5 animate-spin" />
            ) : (
              <ShieldCheck className="size-5" />
            )}{" "}
            {busy ? "กำลังส่งแบบฟอร์ม" : "ส่งเพื่อรอตรวจรับ"}
          </Button>
          <p className="pb-3 text-center text-[11px] leading-5 text-[#789097]">
            ข้อมูลและไฟล์จะถูกเก็บในระบบของโรงพยาบาล
            และจะเป็นประวัติทางการหลังเจ้าหน้าที่ตรวจรับ
          </p>
        </form>
      </div>
    </main>
  );
}

function Step({
  number,
  title,
  icon,
}: {
  number: string;
  title: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="mono text-xs font-bold text-[#0b7f76]">{number}</span>
      <span className="grid size-9 place-items-center rounded-lg bg-[#e8f7f5] text-[#0b7f76] [&>svg]:size-4">
        {icon}
      </span>
      <h2 className="font-bold text-[#173d50]">{title}</h2>
    </div>
  );
}
