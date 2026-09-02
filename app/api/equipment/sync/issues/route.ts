import { requireActor } from "@/lib/server/auth";
import { getEquipmentSyncOverview } from "@/lib/server/equipment-sync";
import { respond } from "@/lib/server/route";

export async function GET() {
  return respond(async () => {
    await requireActor();
    return { issues: (await getEquipmentSyncOverview()).openIssues };
  });
}
