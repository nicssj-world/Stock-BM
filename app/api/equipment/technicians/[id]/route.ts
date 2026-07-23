import { requireActor } from "@/lib/server/auth";
import {
  deleteEquipmentTechnician,
  updateEquipmentTechnician,
} from "@/lib/server/equipment";
import { readJson, respond } from "@/lib/server/route";
import { equipmentTechnicianSchema } from "../route";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return respond(async () => ({
    workspace: await updateEquipmentTechnician(
      (await params).id,
      await readJson(request, equipmentTechnicianSchema),
      await requireActor(),
    ),
  }));
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return respond(async () => ({
    workspace: await deleteEquipmentTechnician(
      (await params).id,
      await requireActor(),
    ),
  }));
}
