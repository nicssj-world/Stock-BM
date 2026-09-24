import { requireActor } from "@/lib/server/auth";
import {
  assertAttachmentAccess,
  deleteAttachment,
  signedUrl,
} from "@/lib/server/attachments";
import { HttpError } from "@/lib/server/errors";
import { respond } from "@/lib/server/route";
import { assertEquipmentWriteAllowed, equipmentArchiveModeEnabled } from "@/lib/server/equipment-archive";
import { getAdminClient } from "@/lib/supabase/admin";

// The route remains authenticated, but its immutable attachment URL can be
// cached privately by the current browser. This avoids a new signed URL and
// image download whenever the same equipment record is revisited.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireActor();
    const id = (await params).id;
    await assertAttachmentAccess(id, actor);
    const url = await signedUrl(id);
    return new Response(null, {
      status: 302,
      headers: {
        Location: url,
        "Cache-Control": "private, max-age=600, stale-while-revalidate=60",
        Vary: "Cookie",
      },
    });
  } catch (error) {
    if (error instanceof HttpError)
      return Response.json({ error: error.message }, { status: error.status });
    return Response.json(
      { error: error instanceof Error ? error.message : "Unexpected error" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return respond(async () => {
    const actor = await requireActor();
    const id = (await params).id;
    if (equipmentArchiveModeEnabled()) {
      const { data, error } = await getAdminClient().from("bm_attachments").select("module").eq("id", id).maybeSingle();
      if (error) throw new HttpError(500, "ตรวจสอบไฟล์แนบไม่สำเร็จ");
      if (data?.module === "equipment") assertEquipmentWriteAllowed();
    }
    await deleteAttachment(id, actor);
    return { ok: true };
  });
}
