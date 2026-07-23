import { z } from "zod";
import { requireActor } from "@/lib/server/auth";
import { createEquipmentTechnician } from "@/lib/server/equipment";
import { readJson, respond } from "@/lib/server/route";

export const equipmentTechnicianSchema = z.object({
  equipmentId: z.string().uuid(),
  technicianName: z.string().trim().min(1).max(200),
  company: z.string().trim().max(200).nullable().optional(),
  phone: z.string().trim().max(100).nullable().optional(),
});

export async function POST(request: Request) {
  return respond(async () => ({
    workspace: await createEquipmentTechnician(
      await readJson(request, equipmentTechnicianSchema),
      await requireActor(),
    ),
  }));
}
