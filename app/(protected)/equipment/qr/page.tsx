import { EquipmentQrSheet } from "@/components/equipment-qr-sheet";
import { requireFullPageActor } from "@/lib/server/auth";
import { getEquipmentWorkspace } from "@/lib/server/equipment";
import { headers } from "next/headers";

export default async function EquipmentQrPage() {
  const actor = await requireFullPageActor();
  const requestHeaders = await headers();
  const host =
    requestHeaders.get("x-forwarded-host") ??
    requestHeaders.get("host") ??
    "localhost:3000";
  const protocol =
    requestHeaders.get("x-forwarded-proto") ??
    (host.startsWith("localhost") ? "http" : "https");
  return (
    <EquipmentQrSheet
      equipment={(await getEquipmentWorkspace(actor)).equipment}
      origin={`${protocol}://${host}`}
    />
  );
}
