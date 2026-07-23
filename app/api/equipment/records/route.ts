import { z } from "zod";
import { requireActor } from "@/lib/server/auth";
import { createInternalEquipmentRecord } from "@/lib/server/equipment";
import { readJson, respond } from "@/lib/server/route";

export const equipmentRecordSchema = z
  .object({
    equipmentId: z.string().uuid(),
    planId: z.string().uuid().nullable().optional(),
    eventType: z.enum([
      "pm",
      "repair",
      "calibration",
      "verification",
      "qualification",
      "inspection_safety",
      "software_firmware",
      "relocation",
      "other",
    ]),
    otherEventLabel: z.string().trim().max(120).nullable().optional(),
    qualificationStage: z.enum(["IQ", "OQ", "PQ"]).nullable().optional(),
    performedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    reportedProblem: z.string().trim().max(2000).nullable().optional(),
    findings: z.string().trim().max(4000).nullable().optional(),
    actionTaken: z.string().trim().min(1).max(5000),
    partsReplaced: z.string().trim().max(2000).nullable().optional(),
    jobNumber: z.string().trim().max(120).nullable().optional(),
    company: z.string().trim().max(200).nullable().optional(),
    technicianName: z.string().trim().min(1).max(200),
    technicianContact: z.string().trim().max(200).nullable().optional(),
    receiverName: z.string().trim().max(200).nullable().optional(),
    downtimeFrom: z.string().datetime().nullable().optional(),
    downtimeUntil: z.string().datetime().nullable().optional(),
    outcome: z.enum(["pass", "conditional", "fail"]),
    returnStatus: z.enum(["active", "maintenance", "out_of_service"]),
    nextRecommendedOn: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable()
      .optional(),
  })
  .refine(
    (data) => data.eventType !== "other" || Boolean(data.otherEventLabel),
    { message: "กรุณาระบุประเภทงานอื่น" },
  );
export async function POST(request: Request) {
  return respond(async () => ({
    workspace: await createInternalEquipmentRecord(
      await readJson(request, equipmentRecordSchema),
      await requireActor(),
    ),
  }));
}
