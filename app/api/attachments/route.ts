import { requireActor } from "@/lib/server/auth";
import {
  listAttachments,
  uploadAttachment,
  type AttachmentModule,
} from "@/lib/server/attachments";
import { HttpError } from "@/lib/server/errors";
import { respond } from "@/lib/server/route";

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
    const entityType = String(form.get("entityType") ?? "").trim();
    const entityIdRaw = form.get("entityId");
    const entityId = entityIdRaw ? String(entityIdRaw) : null;
    const kind = String(form.get("kind") ?? "").trim();

    if (!(file instanceof File)) throw new HttpError(400, "file is required");
    if (!entityType || !kind)
      throw new HttpError(400, "entityType and kind are required");
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
