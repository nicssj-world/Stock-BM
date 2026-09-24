import { respondEquipmentWrite } from '@/lib/server/equipment-archive'
import { z } from "zod";
import { requireActor } from "@/lib/server/auth";
import { updateEquipmentClassification } from "@/lib/server/equipment";
import { readJson, respond } from "@/lib/server/route";

const classificationSchema = z.object({
  category: z.string().trim().max(120).nullable(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return respondEquipmentWrite(async () => {
    const input = await readJson(request, classificationSchema);
    return {
      workspace: await updateEquipmentClassification(
        (await params).id,
        input.category,
        await requireActor(),
      ),
    };
  });
}
