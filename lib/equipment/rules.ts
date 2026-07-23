import { daysUntil, todayBangkok } from "@/lib/bm/rules";
import type {
  EquipmentDueState,
  EquipmentEventType,
  EquipmentIntervalUnit,
  EquipmentPlanType,
  EquipmentScheduleBasis,
  EquipmentStatus,
} from "@/lib/equipment/types";

export const EQUIPMENT_EVENT_LABELS: Record<EquipmentEventType, string> = {
  pm: "Preventive maintenance (PM)",
  repair: "ซ่อม / Corrective repair",
  calibration: "Calibration",
  verification: "Verification",
  qualification: "Qualification",
  inspection_safety: "Inspection / Safety",
  software_firmware: "Software / Firmware update",
  relocation: "Relocation",
  other: "อื่น ๆ / Other",
};

export const EQUIPMENT_PLAN_TYPES: EquipmentPlanType[] = [
  "pm",
  "calibration",
  "verification",
  "qualification",
  "inspection_safety",
];

export function getEquipmentDueState(
  nextDueOn: string,
  reminderDays = 30,
  today = todayBangkok(),
): EquipmentDueState {
  const remaining = daysUntil(nextDueOn, today);
  if (remaining < 0) return "overdue";
  if (remaining <= reminderDays) return "due_soon";
  return "normal";
}

function parseDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return { year, month, day };
}

function formatDate(year: number, month: number, day: number) {
  return `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
}

function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function addEquipmentInterval(
  date: string,
  value: number,
  unit: EquipmentIntervalUnit,
) {
  const { year, month, day } = parseDate(date);
  if (unit === "day" || unit === "week") {
    const result = new Date(
      Date.UTC(year, month - 1, day + value * (unit === "week" ? 7 : 1)),
    );
    return formatDate(
      result.getUTCFullYear(),
      result.getUTCMonth() + 1,
      result.getUTCDate(),
    );
  }
  const months = unit === "year" ? value * 12 : value;
  const absoluteMonth = year * 12 + (month - 1) + months;
  const targetYear = Math.floor(absoluteMonth / 12);
  const targetMonth = (absoluteMonth % 12) + 1;
  const sourceIsMonthEnd = day === daysInMonth(year, month);
  return formatDate(
    targetYear,
    targetMonth,
    sourceIsMonthEnd
      ? daysInMonth(targetYear, targetMonth)
      : Math.min(day, daysInMonth(targetYear, targetMonth)),
  );
}

export function nextEquipmentDueDate(input: {
  previousDueOn: string;
  completedOn: string;
  intervalValue: number;
  intervalUnit: EquipmentIntervalUnit;
  scheduleBasis: EquipmentScheduleBasis;
}) {
  if (input.scheduleBasis === "completion_based")
    return addEquipmentInterval(
      input.completedOn,
      input.intervalValue,
      input.intervalUnit,
    );
  let next = input.previousDueOn;
  for (let index = 0; index < 1000 && next <= input.completedOn; index += 1)
    next = addEquipmentInterval(next, input.intervalValue, input.intervalUnit);
  return next;
}

export function equipmentStatusLabel(status: EquipmentStatus) {
  return status === "active"
    ? "พร้อมใช้งาน"
    : status === "maintenance"
      ? "อยู่ระหว่างซ่อม/บำรุง"
      : status === "out_of_service"
        ? "หยุดใช้งาน"
        : "เลิกใช้งาน";
}
