import { z } from "zod";
import { requireActor } from "@/lib/server/auth";
import {
  getEquipmentSyncOverview,
  syncEquipmentByLabCode,
} from "@/lib/server/equipment-sync";
import { getEquipmentWorkspace } from "@/lib/server/equipment";
import { readJson, respond } from "@/lib/server/route";

const syncSchema = z.object({
  labCode: z.string().trim().min(1).max(60),
});

export async function GET() {
  return respond(async () => {
    await requireActor();
    return { sync: await getEquipmentSyncOverview() };
  });
}

export async function POST(request: Request) {
  return respond(async () => {
    const actor = await requireActor();
    const input = await readJson(request, syncSchema);
    const result = await syncEquipmentByLabCode(actor, input.labCode);
    return {
      result,
      workspace: await getEquipmentWorkspace(actor),
    };
  });
}
