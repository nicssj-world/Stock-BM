import { requireActor } from "@/lib/server/auth";
import {
  listAttachments,
  uploadAttachment,
  type AttachmentModule,
} from "@/lib/server/attachments";
import { HttpError } from "@/lib/server/errors";
import { respond } from "@/lib/server/route";
import { getAdminClient } from "@/lib/supabase/admin";

const MODULES: AttachmentModule[] = [
  "iqc",
  "eqa",
  "stock",
  "env",
  "lotverif",
  "hpv",
  "equipment",
];
const MAX_BYTES = 15 * 1024 * 1024;
const EQA_CERTIFICATE_READY_STATUSES = new Set(["submitted", "evaluated", "closed"]);

async function assertEqaAttachmentAllowed(
  module: AttachmentModule,
  entityType: string,
  entityId: string | null,
  kind: string,
) {
  if (module !== "eqa") return;
  if (entityType === "eqa-round-receipt" && kind === "eqa-receipt")
    throw new HttpError(400, "ไม่รองรับการแนบเอกสารรับตัวอย่าง");
  if (entityType !== "eqa-round" || kind !== "eqa-certificate") return;
  if (!entityId) throw new HttpError(400, "entityId is required");
  const { data, error } = await getAdminClient()
    .from("eqa_rounds")
    .select("status")
    .eq("id", entityId)
    .maybeSingle();
  if (error) throw new HttpError(400, error.message || "ตรวจสอบสถานะ EQA ไม่สำเร็จ");
  if (!data) throw new HttpError(404, "ไม่พบ EQA round");
  if (!EQA_CERTIFICATE_READY_STATUSES.has(String((data as { status?: unknown }).status)))
    throw new HttpError(409, "แนบ Certificate / รายงานผลได้หลังส่งผลแล้วเท่านั้น");
}

function asModule(value: string): AttachmentModule {
  if (!MODULES.includes(value as AttachmentModule))
    throw new HttpError(400, "Invalid module");
  return value as AttachmentModule;
}

export async function GET(request: Request) {
  return respond(async () => {
    const actor = await requireActor();
    const url = new URL(request.url);
    const mod = asModule(url.searchParams.get("module") ?? "");
    if (mod === "equipment" && actor.role === "Assistant")
      throw new HttpError(403, "Equipment permission required");
    const entityType = (url.searchParams.get("entityType") ?? "").trim();
    const entityId = url.searchParams.get("entityId");
    if (!entityType) throw new HttpError(400, "entityType is required");
    return {
      attachments: await listAttachments(mod, entityType, entityId || null),
    };
  });
}

export async function POST(request: Request) {
  return respond(async () => {
    const actor = await requireActor();
    const form = await request.formData();
    const file = form.get("file");
    const mod = asModule(String(form.get("module") ?? ""));
    if (mod === "equipment" && actor.role === "Assistant")
      throw new HttpError(403, "Equipment permission required");
    if (actor.role === "Assistant" && ["iqc", "eqa", "lotverif"].includes(mod))
      throw new HttpError(403, "Review-module attachment permission required");
    const entityType = String(form.get("entityType") ?? "").trim();
    const entityIdRaw = form.get("entityId");
    const entityId = entityIdRaw ? String(entityIdRaw) : null;
    const kind = String(form.get("kind") ?? "").trim();

    if (!(file instanceof File)) throw new HttpError(400, "file is required");
    if (!entityType || !kind)
      throw new HttpError(400, "entityType and kind are required");
    await assertEqaAttachmentAllowed(mod, entityType, entityId, kind);
    if (mod === "equipment" && entityType === "equipment" && actor.role !== "Admin")
      throw new HttpError(403, "Admin permission required");
    if (mod === "equipment" && entityType === "equipment" && !["image/jpeg", "image/png", "image/webp"].includes(file.type))
      throw new HttpError(400, "รูปเครื่องมือต้องเป็น JPEG, PNG หรือ WebP");
    if (mod === "equipment" && entityType === "equipment-service-record" && !["image/jpeg", "image/png", "image/webp", "application/pdf"].includes(file.type))
      throw new HttpError(400, "ไฟล์งานต้องเป็นรูปหรือ PDF");
    if (file.size === 0) throw new HttpError(400, "file is empty");
    if (file.size > MAX_BYTES)
      throw new HttpError(413, "File too large (max 15MB)");

    return {
      attachment: await uploadAttachment(
        { module: mod, entityType, entityId, kind, file },
        actor,
      ),
    };
  });
}
