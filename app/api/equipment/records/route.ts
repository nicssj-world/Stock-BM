import { z } from "zod";
import { requireActor } from "@/lib/server/auth";
import {
  createInternalEquipmentRecord,
  type InternalEquipmentSignatures,
} from "@/lib/server/equipment";
import { HttpError } from "@/lib/server/errors";
import { respond } from "@/lib/server/route";

export const equipmentRecordSchema = z
  .object({
    equipmentId: z.string().uuid(),
    planId: z.string().uuid().nullable().optional(),
    portalPlanId: z.string().uuid().nullable().optional(),
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

const NULLABLE_FORM_FIELDS = [
  "planId",
  "portalPlanId",
  "otherEventLabel",
  "qualificationStage",
  "reportedProblem",
  "findings",
  "partsReplaced",
  "jobNumber",
  "company",
  "technicianContact",
  "downtimeFrom",
  "downtimeUntil",
  "nextRecommendedOn",
] as const;

export async function readEquipmentRecordForm(request: Request): Promise<{
  input: z.infer<typeof equipmentRecordSchema>;
  signatures: InternalEquipmentSignatures;
}> {
  const form = await request.formData();
  const values: Record<string, unknown> = {};
  for (const [key, value] of form.entries()) {
    if (!(value instanceof File)) values[key] = String(value);
  }
  for (const key of NULLABLE_FORM_FIELDS) {
    if (values[key] === "") values[key] = null;
  }
  const technicianSignature = form.get("technicianSignature");
  const receiverSignature = form.get("receiverSignature");
  if (!(technicianSignature instanceof File) || !(receiverSignature instanceof File))
    throw new HttpError(400, "กรุณาลงลายเซ็นช่างและผู้รับงานให้ครบ");
  const input = equipmentRecordSchema.parse(values);
  if (!input.receiverName?.trim())
    throw new HttpError(400, "กรุณาระบุชื่อผู้รับงาน");
  return {
    input,
    signatures: { technicianSignature, receiverSignature },
  };
}

export async function POST(request: Request) {
  return respond(async () => {
    if (!request.headers.get("content-type")?.includes("multipart/form-data"))
      throw new HttpError(415, "แบบฟอร์มบันทึกงานต้องส่งเป็น multipart พร้อมลายเซ็น");
    const parsed = await readEquipmentRecordForm(request);
    return {
      workspace: await createInternalEquipmentRecord(
        parsed.input,
        await requireActor(),
        parsed.signatures,
      ),
    };
  });
}
