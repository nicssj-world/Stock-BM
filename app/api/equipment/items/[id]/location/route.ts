import { z } from "zod";
import { requireActor } from "@/lib/server/auth";
import { updateEquipmentLocation } from "@/lib/server/equipment";
import { readJson, respond } from "@/lib/server/route";

const locationSchema = z.object({
  locationId: z.string().uuid().nullable(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return respond(async () => {
    const input = await readJson(request, locationSchema);
    return {
      workspace: await updateEquipmentLocation(
        (await params).id,
        input.locationId,
        await requireActor(),
      ),
    };
  });
}
