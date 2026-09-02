import { z } from "zod";
import { requireActor } from "@/lib/server/auth";
import {
  resolveEquipmentSyncIssue,
} from "@/lib/server/equipment-sync";
import { getEquipmentWorkspace } from "@/lib/server/equipment";
import { readJson, respond } from "@/lib/server/route";

const issueActionSchema = z.object({
  action: z.enum(["resolve", "ignore"]),
  localEquipmentId: z.string().uuid().nullable().optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return respond(async () => {
    const input = await readJson(request, issueActionSchema);
    const actor = await requireActor();
    await resolveEquipmentSyncIssue(
      (await params).id,
      input.action,
      input.localEquipmentId ?? null,
      actor,
    );
    return { workspace: await getEquipmentWorkspace(actor) };
  });
}
