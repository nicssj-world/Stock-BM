import "server-only";

import type { BmActor, StockLocation } from "@/lib/bm/types";
import { todayBangkok } from "@/lib/bm/rules";
import {
  endOfEquipmentDueMonth,
  getEquipmentDueState,
} from "@/lib/equipment/rules";
import type {
  Equipment,
  EquipmentAttachment,
  EquipmentDashboard,
  EquipmentEventType,
  EquipmentIntervalUnit,
  EquipmentModuleLink,
  EquipmentOutcome,
  EquipmentPlan,
  EquipmentPlanType,
  EquipmentRecordStatus,
  EquipmentScheduleBasis,
  EquipmentServiceRecord,
  EquipmentStatus,
  EquipmentTechnician,
  EquipmentWorkspace,
  PublicEquipmentContext,
} from "@/lib/equipment/types";
import {
  deleteAttachment,
  deletePublicEquipmentAttachments,
  uploadPublicEquipmentAttachment,
} from "@/lib/server/attachments";
import { writeAudit, writeSystemAudit } from "@/lib/server/audit";
import { HttpError } from "@/lib/server/errors";
import { getAdminClient } from "@/lib/supabase/admin";

type RecordRow = Record<string, unknown>;

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}
function nullableString(value: unknown) {
  return typeof value === "string" && value ? value : null;
}
function clean(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
function cleanAssetNumber(value: unknown) {
  const assetNumber = clean(value);
  return assetNumber === "-" ? null : assetNumber;
}
function asNumber(value: unknown) {
  return Number(value) || 0;
}
function fail(
  error: { message: string; code?: string } | null,
  fallback = "Equipment operation failed",
) {
  if (error)
    throw new HttpError(
      error.code === "23505" ? 409 : 400,
      error.message || fallback,
    );
}
function assertAccess(actor: BmActor) {
  if (actor.role === "Assistant")
    throw new HttpError(403, "Equipment permission required");
}
function assertAdmin(actor: BmActor) {
  if (actor.role !== "Admin")
    throw new HttpError(403, "Admin permission required");
}
const EVENT_TYPES = new Set<EquipmentEventType>([
  "pm",
  "repair",
  "calibration",
  "verification",
  "qualification",
  "inspection_safety",
  "software_firmware",
  "relocation",
  "other",
]);
const OUTCOMES = new Set<EquipmentOutcome>(["pass", "conditional", "fail"]);
const RETURN_STATUSES = new Set<Exclude<EquipmentStatus, "decommissioned">>([
  "active",
  "maintenance",
  "out_of_service",
]);

async function assertEquipmentAndPlan(
  equipmentId: string,
  planId?: string | null,
) {
  const admin = getAdminClient();
  const { data: equipment, error: equipmentError } = await admin
    .from("bm_equipment")
    .select("id,status")
    .eq("id", equipmentId)
    .maybeSingle();
  fail(equipmentError);
  if (!equipment) throw new HttpError(404, "ไม่พบเครื่องมือ");
  if ((equipment as RecordRow).status === "decommissioned")
    throw new HttpError(409, "เครื่องมือนี้เลิกใช้งานแล้ว");
  if (!planId) return;
  const { data: plan, error: planError } = await admin
    .from("bm_equipment_plans")
    .select("id")
    .eq("id", planId)
    .eq("equipment_id", equipmentId)
    .maybeSingle();
  fail(planError);
  if (!plan) throw new HttpError(400, "แผนงานไม่ตรงกับเครื่องมือ");
}

function mapAttachment(row: RecordRow): EquipmentAttachment {
  return {
    id: asString(row.id),
    entityType: asString(row.entity_type),
    entityId: nullableString(row.entity_id),
    kind: asString(row.kind),
    fileName: asString(row.file_name),
    contentType: nullableString(row.content_type),
    sizeBytes: row.size_bytes == null ? null : Number(row.size_bytes),
    createdAt: asString(row.created_at),
  };
}

function mapEquipment(
  row: RecordRow,
  photos: EquipmentAttachment[],
  locations: Map<string, StockLocation>,
): Equipment {
  const locationId = nullableString(row.location_id);
  const linkedLocation = locationId ? locations.get(locationId) : null;
  return {
    id: asString(row.id),
    code: asString(row.code),
    name: asString(row.name),
    category: nullableString(row.category),
    manufacturer: nullableString(row.manufacturer),
    model: nullableString(row.model),
    serialNumber: nullableString(row.serial_number),
    assetNumber: nullableString(row.asset_number),
    locationId,
    location: linkedLocation
      ? `${linkedLocation.code} · ${linkedLocation.name}`
      : nullableString(row.location),
    installedOn: nullableString(row.installed_on),
    warrantyUntil: nullableString(row.warranty_until),
    status: asString(row.status) as EquipmentStatus,
    qrToken: asString(row.qr_token),
    note: nullableString(row.note),
    createdAt: asString(row.created_at),
    photos,
  };
}

function mapPlan(row: RecordRow): EquipmentPlan {
  const nextDueOn = asString(row.next_due_on);
  return {
    id: asString(row.id),
    equipmentId: asString(row.equipment_id),
    activityType: asString(row.activity_type) as EquipmentPlanType,
    title: asString(row.title),
    intervalValue: asNumber(row.interval_value),
    intervalUnit: asString(row.interval_unit) as EquipmentIntervalUnit,
    scheduleBasis: asString(row.schedule_basis) as EquipmentScheduleBasis,
    nextDueOn,
    reminderDays: asNumber(row.reminder_days),
    lastCompletedOn: nullableString(row.last_completed_on),
    vendor: nullableString(row.vendor),
    instruction: nullableString(row.instruction),
    isActive: Boolean(row.is_active),
    dueState: Boolean(row.is_active)
      ? getEquipmentDueState(nextDueOn, asNumber(row.reminder_days))
      : "normal",
  };
}

function mapRecord(
  row: RecordRow,
  attachments: EquipmentAttachment[],
  names: Map<string, string>,
): EquipmentServiceRecord {
  return {
    id: asString(row.id),
    equipmentId: asString(row.equipment_id),
    planId: nullableString(row.plan_id),
    eventType: asString(row.event_type) as EquipmentEventType,
    otherEventLabel: nullableString(row.other_event_label),
    qualificationStage: nullableString(row.qualification_stage) as
      "IQ" | "OQ" | "PQ" | null,
    status: asString(row.status) as EquipmentRecordStatus,
    source: asString(row.source) === "public_qr" ? "public_qr" : "internal",
    performedOn: asString(row.performed_on),
    reportedProblem: nullableString(row.reported_problem),
    findings: nullableString(row.findings),
    actionTaken: asString(row.action_taken),
    partsReplaced: nullableString(row.parts_replaced),
    jobNumber: nullableString(row.job_number),
    company: nullableString(row.company),
    technicianName: asString(row.technician_name),
    technicianContact: nullableString(row.technician_contact),
    receiverName: nullableString(row.receiver_name),
    downtimeFrom: nullableString(row.downtime_from),
    downtimeUntil: nullableString(row.downtime_until),
    outcome: asString(row.outcome) as EquipmentOutcome,
    returnStatus: asString(row.return_status) as Exclude<
      EquipmentStatus,
      "decommissioned"
    >,
    nextRecommendedOn: nullableString(row.next_recommended_on),
    submittedAt: asString(row.submitted_at),
    reviewedByName: names.get(asString(row.reviewed_by)) ?? null,
    reviewedAt: nullableString(row.reviewed_at),
    rejectionReason: nullableString(row.rejection_reason),
    voidReason: nullableString(row.void_reason),
    attachments,
  };
}

function mapTechnician(row: RecordRow): EquipmentTechnician {
  return {
    id: asString(row.id),
    equipmentId: asString(row.equipment_id),
    technicianName: asString(row.technician_name),
    company: nullableString(row.company),
    phone: nullableString(row.phone),
    createdAt: asString(row.created_at),
  };
}

export async function getEquipmentWorkspace(
  actor: BmActor,
): Promise<EquipmentWorkspace> {
  assertAccess(actor);
  const admin = getAdminClient();
  const [
    equipmentResult,
    planResult,
    recordResult,
    linkResult,
    iqcResult,
    eqaResult,
    attachmentResult,
    userResult,
    locationResult,
    technicianResult,
  ] = await Promise.all([
    admin.from("bm_equipment").select("*").order("code"),
    admin.from("bm_equipment_plans").select("*").order("next_due_on"),
    admin
      .from("bm_equipment_service_records")
      .select("*")
      .order("performed_on", { ascending: false })
      .limit(1000),
    admin.from("bm_equipment_module_links").select("*").order("created_at"),
    admin
      .from("iqc_instruments")
      .select("id,code,name")
      .eq("is_active", true)
      .order("code"),
    admin
      .from("eqa_schemes")
      .select("id,code,name")
      .eq("is_active", true)
      .order("name"),
    admin
      .from("bm_attachments")
      .select("*")
      .eq("module", "equipment")
      .order("created_at", { ascending: false }),
    admin.from("nipt_users").select("id,display_name"),
    admin
      .from("bm_stock_locations")
      .select("id,code,name,storage_condition,is_active")
      .order("is_active", { ascending: false })
      .order("code"),
    admin
      .from("bm_equipment_technicians")
      .select("*")
      .order("technician_name"),
  ]);
  [
    equipmentResult.error,
    planResult.error,
    recordResult.error,
    linkResult.error,
    iqcResult.error,
    eqaResult.error,
    attachmentResult.error,
    userResult.error,
    locationResult.error,
    technicianResult.error,
  ].forEach((error) => fail(error));
  const attachments = ((attachmentResult.data ?? []) as RecordRow[]).map(
    mapAttachment,
  );
  const attachmentsByEntity = new Map<string, EquipmentAttachment[]>();
  for (const item of attachments)
    if (item.entityId)
      attachmentsByEntity.set(item.entityId, [
        ...(attachmentsByEntity.get(item.entityId) ?? []),
        item,
      ]);
  const names = new Map(
    ((userResult.data ?? []) as RecordRow[]).map((row) => [
      asString(row.id),
      asString(row.display_name),
    ]),
  );
  const locations: StockLocation[] = (
    (locationResult.data ?? []) as RecordRow[]
  ).map((row) => ({
    id: asString(row.id),
    code: asString(row.code),
    name: asString(row.name),
    storageCondition: nullableString(row.storage_condition),
    isActive: Boolean(row.is_active),
  }));
  const locationMap = new Map(locations.map((location) => [location.id, location]));
  const equipment = ((equipmentResult.data ?? []) as RecordRow[]).map((row) =>
    mapEquipment(
      row,
      (attachmentsByEntity.get(asString(row.id)) ?? []).filter(
        (item) => item.kind === "equipment-photo",
      ),
      locationMap,
    ),
  );
  const plans = ((planResult.data ?? []) as RecordRow[]).map(mapPlan);
  const records = ((recordResult.data ?? []) as RecordRow[]).map((row) =>
    mapRecord(row, attachmentsByEntity.get(asString(row.id)) ?? [], names),
  );
  const technicians = ((technicianResult.data ?? []) as RecordRow[]).map(
    mapTechnician,
  );
  const iqcInstruments = ((iqcResult.data ?? []) as RecordRow[]).map((row) => ({
    id: asString(row.id),
    code: asString(row.code),
    name: asString(row.name),
  }));
  const eqaSchemes = ((eqaResult.data ?? []) as RecordRow[]).map((row) => ({
    id: asString(row.id),
    code: nullableString(row.code),
    name: asString(row.name),
  }));
  const iqcMap = new Map(
    iqcInstruments.map((item) => [item.id, `${item.code} · ${item.name}`]),
  );
  const eqaMap = new Map(
    eqaSchemes.map((item) => [
      item.id,
      `${item.code ? `${item.code} · ` : ""}${item.name}`,
    ]),
  );
  const links: EquipmentModuleLink[] = (
    (linkResult.data ?? []) as RecordRow[]
  ).map((row) => {
    const linkModule = asString(row.module) as "iqc" | "eqa";
    const entityId = asString(row.entity_id);
    return {
      id: asString(row.id),
      equipmentId: asString(row.equipment_id),
      module: linkModule,
      entityType: linkModule === "iqc" ? "instrument" : "scheme",
      entityId,
      entityLabel:
        (linkModule === "iqc" ? iqcMap : eqaMap).get(entityId) ?? "ไม่พบรายการ",
    };
  });
  return {
    equipment,
    plans,
    records,
    links,
    technicians,
    iqcInstruments,
    eqaSchemes,
    locations,
    dashboard: summarizeDashboard(equipment, plans, records),
  };
}

function summarizeDashboard(
  equipment: Equipment[],
  plans: EquipmentPlan[],
  records: EquipmentServiceRecord[],
): EquipmentDashboard {
  return {
    active: equipment.filter((item) => item.status === "active").length,
    maintenance: equipment.filter((item) => item.status === "maintenance")
      .length,
    outOfService: equipment.filter((item) => item.status === "out_of_service")
      .length,
    dueSoon: plans.filter(
      (item) => item.isActive && item.dueState === "due_soon",
    ).length,
    overdue: plans.filter(
      (item) => item.isActive && item.dueState === "overdue",
    ).length,
    pending: records.filter((item) => item.status === "pending").length,
  };
}

export async function getEquipmentDashboardData(): Promise<EquipmentDashboard> {
  const admin = getAdminClient();
  const [
    { data: equipmentData, error: equipmentError },
    { data: planData, error: planError },
    { count: pending, error: pendingError },
  ] = await Promise.all([
    admin.from("bm_equipment").select("status"),
    admin
      .from("bm_equipment_plans")
      .select("next_due_on,reminder_days,is_active")
      .eq("is_active", true),
    admin
      .from("bm_equipment_service_records")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
  ]);
  fail(equipmentError);
  fail(planError);
  fail(pendingError);
  const equipment = (equipmentData ?? []) as RecordRow[];
  const plans = ((planData ?? []) as RecordRow[]).map((row) =>
    getEquipmentDueState(
      asString(row.next_due_on),
      asNumber(row.reminder_days),
    ),
  );
  return {
    active: equipment.filter((r) => r.status === "active").length,
    maintenance: equipment.filter((r) => r.status === "maintenance").length,
    outOfService: equipment.filter((r) => r.status === "out_of_service").length,
    dueSoon: plans.filter((s) => s === "due_soon").length,
    overdue: plans.filter((s) => s === "overdue").length,
    pending: pending ?? 0,
  };
}

export interface EquipmentInput {
  code: string;
  name: string;
  category?: string | null;
  manufacturer?: string | null;
  model?: string | null;
  serialNumber?: string | null;
  assetNumber?: string | null;
  locationId?: string | null;
  installedOn?: string | null;
  warrantyUntil?: string | null;
  status?: EquipmentStatus;
  note?: string | null;
}

async function equipmentPayload(input: EquipmentInput) {
  const locationId = clean(input.locationId);
  let location: RecordRow | null = null;
  if (locationId) {
    const { data, error } = await getAdminClient()
      .from("bm_stock_locations")
      .select("id,code,name")
      .eq("id", locationId)
      .maybeSingle();
    fail(error);
    location = data as RecordRow | null;
    if (!location) throw new HttpError(400, "ไม่พบ Location คลังน้ำยาที่เลือก");
  }
  return {
    code: input.code.trim().toUpperCase(),
    name: input.name.trim(),
    category: clean(input.category),
    manufacturer: clean(input.manufacturer),
    model: clean(input.model),
    serial_number: clean(input.serialNumber),
    // A dash is the UI convention for an omitted Asset No.; store it as null
    // so it does not consume the unique Asset No. value for other equipment.
    asset_number: cleanAssetNumber(input.assetNumber),
    location_id: locationId,
    location: location ? `${asString(location.code)} · ${asString(location.name)}` : null,
    installed_on: clean(input.installedOn),
    warranty_until: clean(input.warrantyUntil),
    status: input.status ?? "active",
    note: clean(input.note),
  };
}

export async function createEquipment(input: EquipmentInput, actor: BmActor) {
  assertAdmin(actor);
  const { data, error } = await getAdminClient()
    .from("bm_equipment")
    .insert({
      ...(await equipmentPayload(input)),
      created_by: actor.id,
      updated_by: actor.id,
    })
    .select("id")
    .single();
  fail(error);
  await writeAudit(
    actor,
    "equipment.create",
    "equipment",
    asString((data as RecordRow).id),
    { ...input },
  );
  return getEquipmentWorkspace(actor);
}

export async function updateEquipment(
  id: string,
  input: EquipmentInput,
  actor: BmActor,
) {
  assertAdmin(actor);
  const { error } = await getAdminClient()
    .from("bm_equipment")
    .update({
      ...(await equipmentPayload(input)),
      updated_by: actor.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  fail(error);
  await writeAudit(actor, "equipment.update", "equipment", id, { ...input });
  return getEquipmentWorkspace(actor);
}

export async function deleteEquipment(id: string, actor: BmActor) {
  assertAdmin(actor);
  const admin = getAdminClient();
  const [planResult, recordResult] = await Promise.all([
    admin
      .from("bm_equipment_plans")
      .select("id", { count: "exact", head: true })
      .eq("equipment_id", id),
    admin
      .from("bm_equipment_service_records")
      .select("id", { count: "exact", head: true })
      .eq("equipment_id", id),
  ]);
  fail(planResult.error);
  fail(recordResult.error);
  const plans = planResult.count;
  const records = recordResult.count;
  if (plans || records)
    throw new HttpError(
      409,
      "เครื่องมือนี้มีแผนหรือประวัติแล้ว กรุณาเปลี่ยนสถานะเป็นเลิกใช้งานแทน",
    );
  const { data: photos, error: photoError } = await admin
    .from("bm_attachments")
    .select("id")
    .eq("module", "equipment")
    .eq("entity_type", "equipment")
    .eq("entity_id", id);
  fail(photoError);
  for (const photo of (photos ?? []) as RecordRow[])
    await deleteAttachment(asString(photo.id), actor);
  const { error } = await admin.from("bm_equipment").delete().eq("id", id);
  fail(error);
  await writeAudit(actor, "equipment.delete", "equipment", id, {});
  return getEquipmentWorkspace(actor);
}

export async function rotateEquipmentToken(id: string, actor: BmActor) {
  assertAdmin(actor);
  const token = crypto.randomUUID().replaceAll("-", "");
  const { error } = await getAdminClient()
    .from("bm_equipment")
    .update({
      qr_token: token,
      updated_by: actor.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  fail(error);
  await writeAudit(actor, "equipment.token.rotate", "equipment", id, {});
  return getEquipmentWorkspace(actor);
}

export interface EquipmentPlanInput {
  equipmentId: string;
  activityType: EquipmentPlanType;
  title: string;
  intervalValue: number;
  intervalUnit: EquipmentIntervalUnit;
  scheduleBasis: EquipmentScheduleBasis;
  nextDueOn: string;
  reminderDays?: number;
  vendor?: string | null;
  instruction?: string | null;
  isActive?: boolean;
}
function planPayload(input: EquipmentPlanInput) {
  return {
    equipment_id: input.equipmentId,
    activity_type: input.activityType,
    title: input.title.trim(),
    interval_value: input.intervalValue,
    interval_unit: input.intervalUnit,
    schedule_basis: input.scheduleBasis,
    next_due_on: endOfEquipmentDueMonth(input.nextDueOn),
    reminder_days: input.reminderDays ?? 30,
    vendor: clean(input.vendor),
    instruction: clean(input.instruction),
    is_active: input.isActive ?? true,
  };
}

export async function createEquipmentPlan(
  input: EquipmentPlanInput,
  actor: BmActor,
) {
  assertAdmin(actor);
  await assertEquipmentAndPlan(input.equipmentId);
  const { data, error } = await getAdminClient()
    .from("bm_equipment_plans")
    .insert({
      ...planPayload(input),
      created_by: actor.id,
      updated_by: actor.id,
    })
    .select("id")
    .single();
  fail(error);
  await writeAudit(
    actor,
    "equipment.plan.create",
    "equipment-plan",
    asString((data as RecordRow).id),
    { ...input },
  );
  return getEquipmentWorkspace(actor);
}
export async function updateEquipmentPlan(
  id: string,
  input: EquipmentPlanInput,
  actor: BmActor,
) {
  assertAdmin(actor);
  await assertEquipmentAndPlan(input.equipmentId);
  const { error } = await getAdminClient()
    .from("bm_equipment_plans")
    .update({
      ...planPayload(input),
      updated_by: actor.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  fail(error);
  await writeAudit(actor, "equipment.plan.update", "equipment-plan", id, {
    ...input,
  });
  return getEquipmentWorkspace(actor);
}
export async function deleteEquipmentPlan(id: string, actor: BmActor) {
  assertAdmin(actor);
  const { count, error: countError } = await getAdminClient()
    .from("bm_equipment_service_records")
    .select("id", { count: "exact", head: true })
    .eq("plan_id", id);
  fail(countError);
  if (count)
    throw new HttpError(409, "แผนนี้มีประวัติงานแล้ว กรุณาปิดใช้งานแทน");
  const { error } = await getAdminClient()
    .from("bm_equipment_plans")
    .delete()
    .eq("id", id);
  fail(error);
  await writeAudit(actor, "equipment.plan.delete", "equipment-plan", id, {});
  return getEquipmentWorkspace(actor);
}

export interface EquipmentRecordInput {
  equipmentId: string;
  planId?: string | null;
  eventType: EquipmentEventType;
  otherEventLabel?: string | null;
  qualificationStage?: "IQ" | "OQ" | "PQ" | null;
  performedOn: string;
  reportedProblem?: string | null;
  findings?: string | null;
  actionTaken: string;
  partsReplaced?: string | null;
  jobNumber?: string | null;
  company?: string | null;
  technicianName: string;
  technicianContact?: string | null;
  receiverName?: string | null;
  downtimeFrom?: string | null;
  downtimeUntil?: string | null;
  outcome: EquipmentOutcome;
  returnStatus: Exclude<EquipmentStatus, "decommissioned">;
  nextRecommendedOn?: string | null;
}
function recordPayload(input: EquipmentRecordInput) {
  return {
    equipment_id: input.equipmentId,
    plan_id: clean(input.planId),
    event_type: input.eventType,
    other_event_label: clean(input.otherEventLabel),
    qualification_stage: clean(input.qualificationStage),
    performed_on: input.performedOn,
    reported_problem: clean(input.reportedProblem),
    findings: clean(input.findings),
    action_taken: input.actionTaken.trim(),
    parts_replaced: clean(input.partsReplaced),
    job_number: clean(input.jobNumber),
    company: clean(input.company),
    technician_name: input.technicianName.trim(),
    technician_contact: clean(input.technicianContact),
    receiver_name: clean(input.receiverName),
    downtime_from: clean(input.downtimeFrom),
    downtime_until: clean(input.downtimeUntil),
    outcome: input.outcome,
    return_status: input.returnStatus,
    next_recommended_on: clean(input.nextRecommendedOn),
  };
}

export async function createInternalEquipmentRecord(
  input: EquipmentRecordInput,
  actor: BmActor,
) {
  assertAccess(actor);
  await assertEquipmentAndPlan(input.equipmentId, input.planId);
  const admin = getAdminClient();
  const { data, error } = await admin
    .from("bm_equipment_service_records")
    .insert({
      ...recordPayload(input),
      status: "pending",
      source: "internal",
      created_by: actor.id,
    })
    .select("id")
    .single();
  fail(error);
  const id = asString((data as RecordRow).id);
  const { error: approveError } = await admin.rpc(
    "approve_equipment_service_record",
    { p_record_id: id, p_reviewer: actor.id },
  );
  fail(approveError);
  await writeAudit(
    actor,
    "equipment.record.create",
    "equipment-service-record",
    id,
    { ...input },
  );
  return getEquipmentWorkspace(actor);
}

export async function updatePendingEquipmentRecord(
  id: string,
  input: EquipmentRecordInput,
  actor: BmActor,
) {
  assertAccess(actor);
  await assertEquipmentAndPlan(input.equipmentId, input.planId);
  const { data, error } = await getAdminClient()
    .from("bm_equipment_service_records")
    .update({ ...recordPayload(input), updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();
  fail(error);
  if (!data) throw new HttpError(409, "แก้ไขได้เฉพาะรายการที่รอตรวจรับ");
  await writeAudit(
    actor,
    "equipment.record.pending.update",
    "equipment-service-record",
    id,
    { ...input },
  );
  return getEquipmentWorkspace(actor);
}

export async function reviewEquipmentRecord(
  id: string,
  action: "approve" | "reject" | "void",
  reason: string | null,
  actor: BmActor,
) {
  assertAccess(actor);
  const admin = getAdminClient();
  if (action === "approve") {
    const { error } = await admin.rpc("approve_equipment_service_record", {
      p_record_id: id,
      p_reviewer: actor.id,
    });
    fail(error);
  } else if (action === "reject") {
    if (!reason?.trim()) throw new HttpError(400, "กรุณาระบุเหตุผลที่ปฏิเสธ");
    const { data, error } = await admin
      .from("bm_equipment_service_records")
      .update({
        status: "rejected",
        rejection_reason: reason.trim(),
        reviewed_by: actor.id,
        reviewed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();
    fail(error);
    if (!data) throw new HttpError(409, "รายการนี้ไม่ได้อยู่ในสถานะรอตรวจรับ");
  } else {
    if (!reason?.trim()) throw new HttpError(400, "กรุณาระบุเหตุผลที่ void");
    const { data, error } = await admin
      .from("bm_equipment_service_records")
      .update({
        status: "voided",
        void_reason: reason.trim(),
        voided_by: actor.id,
        voided_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("status", "approved")
      .select("id")
      .maybeSingle();
    fail(error);
    if (!data) throw new HttpError(409, "Void ได้เฉพาะประวัติที่อนุมัติแล้ว");
  }
  await writeAudit(
    actor,
    `equipment.record.${action}`,
    "equipment-service-record",
    id,
    { reason },
  );
  return getEquipmentWorkspace(actor);
}

export async function createEquipmentLink(
  input: { equipmentId: string; module: "iqc" | "eqa"; entityId: string },
  actor: BmActor,
) {
  assertAdmin(actor);
  await assertEquipmentAndPlan(input.equipmentId);
  const admin = getAdminClient();
  const table = input.module === "iqc" ? "iqc_instruments" : "eqa_schemes";
  const { data: target, error: targetError } = await admin
    .from(table)
    .select("id")
    .eq("id", input.entityId)
    .maybeSingle();
  fail(targetError);
  if (!target) throw new HttpError(404, "ไม่พบรายการปลายทาง");
  const { data, error } = await admin
    .from("bm_equipment_module_links")
    .insert({
      equipment_id: input.equipmentId,
      module: input.module,
      entity_type: input.module === "iqc" ? "instrument" : "scheme",
      entity_id: input.entityId,
      created_by: actor.id,
    })
    .select("id")
    .single();
  fail(error);
  await writeAudit(
    actor,
    "equipment.link.create",
    "equipment-link",
    asString((data as RecordRow).id),
    input,
  );
  return getEquipmentWorkspace(actor);
}
export async function deleteEquipmentLink(id: string, actor: BmActor) {
  assertAdmin(actor);
  const { error } = await getAdminClient()
    .from("bm_equipment_module_links")
    .delete()
    .eq("id", id);
  fail(error);
  await writeAudit(actor, "equipment.link.delete", "equipment-link", id, {});
  return getEquipmentWorkspace(actor);
}

export interface EquipmentTechnicianInput {
  equipmentId: string;
  technicianName: string;
  company?: string | null;
  phone?: string | null;
}

function technicianPayload(input: EquipmentTechnicianInput) {
  return {
    equipment_id: input.equipmentId,
    technician_name: input.technicianName.trim(),
    company: clean(input.company),
    phone: clean(input.phone),
  };
}

export async function createEquipmentTechnician(
  input: EquipmentTechnicianInput,
  actor: BmActor,
) {
  assertAdmin(actor);
  const admin = getAdminClient();
  const { data: equipment, error: equipmentError } = await admin
    .from("bm_equipment")
    .select("id")
    .eq("id", input.equipmentId)
    .maybeSingle();
  fail(equipmentError);
  if (!equipment) throw new HttpError(404, "ไม่พบเครื่องมือ");
  const { data, error } = await admin
    .from("bm_equipment_technicians")
    .insert({
      ...technicianPayload(input),
      created_by: actor.id,
      updated_by: actor.id,
    })
    .select("id")
    .single();
  fail(error);
  const id = asString((data as RecordRow).id);
  await writeAudit(actor, "equipment.technician.create", "equipment-technician", id, { ...input });
  return getEquipmentWorkspace(actor);
}

export async function updateEquipmentTechnician(
  id: string,
  input: EquipmentTechnicianInput,
  actor: BmActor,
) {
  assertAdmin(actor);
  const { error } = await getAdminClient()
    .from("bm_equipment_technicians")
    .update({
      ...technicianPayload(input),
      updated_by: actor.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  fail(error);
  await writeAudit(actor, "equipment.technician.update", "equipment-technician", id, { ...input });
  return getEquipmentWorkspace(actor);
}

export async function deleteEquipmentTechnician(id: string, actor: BmActor) {
  assertAdmin(actor);
  const { error } = await getAdminClient()
    .from("bm_equipment_technicians")
    .delete()
    .eq("id", id);
  fail(error);
  await writeAudit(actor, "equipment.technician.delete", "equipment-technician", id, {});
  return getEquipmentWorkspace(actor);
}

export async function resolvePublicEquipment(
  token: string,
): Promise<PublicEquipmentContext | null> {
  const admin = getAdminClient();
  const { data, error } = await admin
    .from("bm_equipment")
    .select("*")
    .eq("qr_token", token.trim())
    .neq("status", "decommissioned")
    .maybeSingle();
  fail(error);
  if (!data) return null;
  const row = data as RecordRow;
  const equipment = mapEquipment(row, [], new Map<string, StockLocation>());
  const [planResult, technicianResult] = await Promise.all([
    admin
      .from("bm_equipment_plans")
      .select("*")
      .eq("equipment_id", equipment.id)
      .eq("is_active", true)
      .order("next_due_on"),
    admin
      .from("bm_equipment_technicians")
      .select("id,equipment_id,technician_name,company,phone,created_at")
      .eq("equipment_id", equipment.id)
      .order("technician_name"),
  ]);
  fail(planResult.error);
  fail(technicianResult.error);
  return {
    equipment: {
      code: equipment.code,
      name: equipment.name,
      category: equipment.category,
      manufacturer: equipment.manufacturer,
      model: equipment.model,
      serialNumber: equipment.serialNumber,
      status: equipment.status,
    },
    plans: ((planResult.data ?? []) as RecordRow[])
      .map(mapPlan)
      .map(({ id, activityType, title, nextDueOn, dueState }) => ({
        id,
        activityType,
        title,
        nextDueOn,
        dueState,
      })),
    technicians: ((technicianResult.data ?? []) as RecordRow[])
      .map(mapTechnician)
      .map(({ id, technicianName, company, phone }) => ({
        id,
        technicianName,
        company,
        phone,
      })),
  };
}

const PUBLIC_FILE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);
function publicText(form: FormData, key: string) {
  return String(form.get(key) ?? "").trim();
}
function publicBangkokDateTime(form: FormData, key: string) {
  const value = publicText(form, key);
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))
    throw new HttpError(400, "รูปแบบวันเวลาไม่ถูกต้อง");
  return `${value}:00+07:00`;
}

export async function submitPublicEquipmentRecord(
  token: string,
  form: FormData,
) {
  const context = await resolvePublicEquipment(token);
  if (!context) throw new HttpError(404, "QR นี้ไม่พร้อมใช้งาน");
  const admin = getAdminClient();
  const { data: equipmentRow, error: equipmentError } = await admin
    .from("bm_equipment")
    .select("id")
    .eq("qr_token", token.trim())
    .maybeSingle();
  fail(equipmentError);
  const equipmentId = asString((equipmentRow as RecordRow | null)?.id);
  const idempotencyKey = publicText(form, "idempotencyKey");
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      idempotencyKey,
    )
  )
    throw new HttpError(400, "Invalid submission key");
  const { data: existing, error: existingError } = await admin
    .from("bm_equipment_service_records")
    .select("id")
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();
  fail(existingError);
  if (existing)
    return { id: asString((existing as RecordRow).id), duplicate: true };
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count, error: rateError } = await admin
    .from("bm_equipment_service_records")
    .select("id", { count: "exact", head: true })
    .eq("equipment_id", equipmentId)
    .eq("source", "public_qr")
    .gte("submitted_at", oneHourAgo);
  fail(rateError);
  if ((count ?? 0) >= 10)
    throw new HttpError(429, "มีการส่งรายการมากเกินไป กรุณาลองใหม่ภายหลัง");
  if (publicText(form, "website"))
    throw new HttpError(400, "Invalid submission");
  const textLimits: Record<string, number> = {
    technicianName: 200,
    receiverName: 200,
    actionTaken: 5000,
    reportedProblem: 2000,
    findings: 4000,
    partsReplaced: 2000,
    jobNumber: 120,
    company: 200,
    technicianContact: 200,
    otherEventLabel: 120,
  };
  for (const [key, limit] of Object.entries(textLimits))
    if (publicText(form, key).length > limit)
      throw new HttpError(400, `ข้อมูล ${key} ยาวเกินกำหนด`);
  const technicianName = publicText(form, "technicianName");
  const receiverName = publicText(form, "receiverName");
  const actionTaken = publicText(form, "actionTaken");
  if (!technicianName || !receiverName || !actionTaken)
    throw new HttpError(400, "กรุณากรอกข้อมูลที่จำเป็นให้ครบ");
  const eventType = publicText(form, "eventType") as EquipmentEventType;
  const outcome = publicText(form, "outcome") as EquipmentOutcome;
  const returnStatus = publicText(form, "returnStatus") as Exclude<
    EquipmentStatus,
    "decommissioned"
  >;
  if (
    !EVENT_TYPES.has(eventType) ||
    !OUTCOMES.has(outcome) ||
    !RETURN_STATUSES.has(returnStatus)
  )
    throw new HttpError(400, "ประเภทงานหรือสถานะไม่ถูกต้อง");
  if (eventType === "other" && !publicText(form, "otherEventLabel"))
    throw new HttpError(400, "กรุณาระบุประเภทงานอื่น");
  const performedOn = publicText(form, "performedOn") || todayBangkok();
  const nextRecommendedOn = publicText(form, "nextRecommendedOn");
  const qualificationStage = publicText(form, "qualificationStage");
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(performedOn) ||
    (nextRecommendedOn && !/^\d{4}-\d{2}-\d{2}$/.test(nextRecommendedOn))
  )
    throw new HttpError(400, "รูปแบบวันที่ไม่ถูกต้อง");
  if (qualificationStage && !["IQ", "OQ", "PQ"].includes(qualificationStage))
    throw new HttpError(400, "Qualification stage ไม่ถูกต้อง");
  const workFiles = form
    .getAll("files")
    .filter((item): item is File => item instanceof File && item.size > 0);
  if (workFiles.length > 5) throw new HttpError(400, "แนบไฟล์ได้สูงสุด 5 ไฟล์");
  for (const file of workFiles)
    if (file.size > 15 * 1024 * 1024 || !PUBLIC_FILE_TYPES.has(file.type))
      throw new HttpError(400, "ไฟล์งานต้องเป็นรูปหรือ PDF และไม่เกิน 15 MB");
  const technicianSignature = form.get("technicianSignature");
  const receiverSignature = form.get("receiverSignature");
  for (const signature of [technicianSignature, receiverSignature])
    if (
      !(signature instanceof File) ||
      signature.type !== "image/png" ||
      signature.size === 0 ||
      signature.size > 2 * 1024 * 1024
    )
      throw new HttpError(400, "กรุณาลงลายเซ็นให้ครบทั้งสองฝ่าย");
  const input: EquipmentRecordInput = {
    equipmentId,
    planId: clean(publicText(form, "planId")),
    eventType,
    otherEventLabel: clean(publicText(form, "otherEventLabel")),
    qualificationStage: clean(qualificationStage) as "IQ" | "OQ" | "PQ" | null,
    performedOn,
    reportedProblem: clean(publicText(form, "reportedProblem")),
    findings: clean(publicText(form, "findings")),
    actionTaken,
    partsReplaced: clean(publicText(form, "partsReplaced")),
    jobNumber: clean(publicText(form, "jobNumber")),
    company: clean(publicText(form, "company")),
    technicianName,
    technicianContact: clean(publicText(form, "technicianContact")),
    receiverName,
    downtimeFrom: publicBangkokDateTime(form, "downtimeFrom"),
    downtimeUntil: publicBangkokDateTime(form, "downtimeUntil"),
    outcome,
    returnStatus,
    nextRecommendedOn: clean(nextRecommendedOn),
  };
  await assertEquipmentAndPlan(input.equipmentId, input.planId);
  const { data, error } = await admin
    .from("bm_equipment_service_records")
    .insert({
      ...recordPayload(input),
      status: "pending",
      source: "public_qr",
      idempotency_key: idempotencyKey,
      created_by: null,
    })
    .select("id")
    .single();
  if (error?.code === "23505") {
    const { data: duplicate, error: duplicateError } = await admin
      .from("bm_equipment_service_records")
      .select("id")
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();
    fail(duplicateError);
    if (duplicate)
      return { id: asString((duplicate as RecordRow).id), duplicate: true };
  }
  fail(error);
  const id = asString((data as RecordRow).id);
  const uploads = [
    ...workFiles.map((file) => ({ file, kind: "service-file" })),
    { file: technicianSignature as File, kind: "technician-signature" },
    { file: receiverSignature as File, kind: "receiver-signature" },
  ];
  try {
    for (const upload of uploads)
      await uploadPublicEquipmentAttachment({
        entityId: id,
        kind: upload.kind,
        file: upload.file,
        uploaderName: technicianName,
      });
  } catch (cause) {
    try {
      await deletePublicEquipmentAttachments(id);
    } catch {
      /* retain the original upload failure */
    }
    await admin
      .from("bm_equipment_service_records")
      .delete()
      .eq("id", id)
      .eq("status", "pending");
    throw cause;
  }
  await writeSystemAudit(
    "equipment.record.public.submit",
    "equipment-service-record",
    id,
    { equipmentId, technicianName, fileCount: workFiles.length },
  );
  return { id, duplicate: false };
}
