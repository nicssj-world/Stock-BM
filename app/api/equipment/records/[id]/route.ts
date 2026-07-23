import { z } from "zod";
import { requireActor } from "@/lib/server/auth";
import {
  reviewEquipmentRecord,
  updatePendingEquipmentRecord,
} from "@/lib/server/equipment";
import { readJson, respond } from "@/lib/server/route";
import { equipmentRecordSchema } from "../route";

const schema = z.object({
  action: z.enum(["approve", "reject", "void"]),
  reason: z.string().trim().max(2000).nullable().optional(),
});
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return respond(async () => {
    const input = await readJson(request, schema);
    return {
      workspace: await reviewEquipmentRecord(
        (await params).id,
        input.action,
        input.reason ?? null,
        await requireActor(),
      ),
    };
  });
}
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return respond(async () => ({
    workspace: await updatePendingEquipmentRecord(
      (await params).id,
      await readJson(request, equipmentRecordSchema),
      await requireActor(),
    ),
  }));
}
