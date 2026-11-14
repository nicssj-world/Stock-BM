import 'server-only'

import { HttpError } from '@/lib/server/errors'

// Database functions raise short BM_* codes; this turns them into Thai messages and HTTP statuses.
const MESSAGES: Record<string, [number, string]> = {
  BM_ACCESS_DENIED: [403, 'ไม่มีสิทธิ์ทำรายการนี้'],
  BM_STALE_DATA: [409, 'ข้อมูลถูกแก้ไขโดยผู้อื่นแล้ว กรุณาโหลดหน้าใหม่แล้วลองอีกครั้ง'],
  BM_REASON_REQUIRED: [400, 'กรุณาระบุเหตุผล'],
  BM_VENDOR_NOT_FOUND: [404, 'ไม่พบผู้ขาย'],
  BM_VENDOR_CODE_TAKEN: [409, 'รหัสผู้ขายนี้มีอยู่แล้ว'],
  BM_VENDOR_NAME_TAKEN: [409, 'ชื่อผู้ขายนี้มีอยู่แล้ว'],
  BM_VENDOR_TAX_TAKEN: [409, 'เลขประจำตัวผู้เสียภาษีและสาขานี้มีอยู่แล้ว'],
  BM_VENDOR_CODE_NAME_REQUIRED: [400, 'กรุณาระบุรหัสและชื่อผู้ขาย'],
  BM_VENDOR_FIELD_INVALID: [400, 'ข้อมูลผู้ขายไม่ถูกต้อง'],
  BM_VENDOR_INVOICE_INVALID: [409, 'Invoice ไม่ใช่ของผู้ขายนี้'],
  BM_VENDOR_RECEIPT_INVALID: [409, 'ใบรับเข้าไม่ใช่ของผู้ขายนี้'],
  BM_INVOICE_NOT_FOUND: [404, 'ไม่พบใบส่งของ'],
  BM_INVOICE_NOT_OPEN: [409, 'ปิดแบบรับไม่ครบได้เฉพาะใบส่งของที่เปิดอยู่'],
  BM_INVOICE_HAS_DRAFT_RECEIPT: [409, 'ใบส่งของนี้ยังมีใบรับเข้าฉบับร่าง กรุณายืนยันหรือยกเลิกก่อน'],
  BM_INVOICE_NOTHING_OUTSTANDING: [409, 'ใบส่งของนี้ไม่มีรายการค้างรับ'],
  BM_RECEIPT_NOT_FOUND: [404, 'ไม่พบใบรับเข้า'],
  BM_RECEIPT_NOT_CONFIRMED: [409, 'ประเมินได้เฉพาะใบรับเข้าที่ยืนยันแล้ว'],
  BM_ASSESSMENT_NOT_FOUND: [404, 'ไม่พบผลตรวจรับ'],
  BM_ASSESSMENT_ALREADY_COMPLETED: [409, 'การประเมินนี้บันทึกแล้ว ใช้ปุ่มแก้ไขผลตรวจรับแทน'],
  BM_ASSESSMENT_NOT_COMPLETED: [409, 'ผลตรวจรับนี้ยังไม่ได้บันทึก'],
  BM_ASSESSMENT_UNCHANGED: [409, 'ไม่มีการเปลี่ยนแปลงผลตรวจรับ'],
  BM_ASSESSMENT_REQUIRED: [400, 'กรุณาตอบผลตรวจรับให้ครบทุกข้อ'],
  BM_ASSESSMENT_REASON_REQUIRED: [400, 'มีรายการผิดปกติ — กรุณาเลือกเหตุผลที่ยอมรับสินค้า'],
  BM_ASSESSMENT_REASON_INVALID: [400, 'เหตุผลที่เลือกไม่ถูกต้อง'],
  BM_ASSESSMENT_REASON_NOT_ALLOWED: [400, 'ทุกข้อปกติ ไม่ต้องระบุเหตุผล'],
  BM_ASSESSMENT_NOTE_REQUIRED: [400, 'มีรายการผิดปกติ — กรุณาระบุหมายเหตุ'],
  BM_ASSESSMENT_OTHER_REASON_REQUIRED: [400, 'กรุณาระบุรายละเอียดเหตุผลอื่น'],
  BM_ISSUE_NOT_FOUND: [404, 'ไม่พบปัญหาผู้ขาย'],
  BM_ISSUE_DESCRIPTION_REQUIRED: [400, 'กรุณาระบุรายละเอียดปัญหา'],
  BM_ISSUE_RESOLUTION_REQUIRED: [400, 'กรุณาระบุวิธีแก้ไขและรายละเอียด'],
  BM_ISSUE_NOT_OPEN: [409, 'ปัญหานี้ปิดไปแล้ว'],
  BM_ISSUE_CANCEL_REASON_INVALID: [400, 'เหตุผลการยกเลิกไม่ถูกต้อง'],
  BM_ISSUE_CANCEL_NOTE_REQUIRED: [400, 'กรุณาระบุรายละเอียดเมื่อยกเลิกด้วยเหตุผลอื่น'],
  BM_ISSUE_ALREADY_CANCELLED: [409, 'ปัญหานี้ถูกยกเลิกแล้ว'],
  BM_POLICY_NOT_FOUND: [404, 'ไม่พบนโยบายประเมินผู้ขายที่ใช้กับปีงบประมาณนี้'],
  BM_POLICY_FROZEN: [409, 'นโยบายที่อนุมัติแล้วแก้ไขไม่ได้'],
  BM_POLICY_NOT_PROPOSED: [409, 'นโยบายนี้ไม่ได้อยู่ในสถานะข้อเสนอ'],
  BM_POLICY_INCOMPLETE: [409, 'นโยบายยังไม่ครบ ต้องมีเกณฑ์ผ่าน ความครอบคลุมขั้นต่ำ และน้ำหนักรวม 100'],
  BM_POLICY_OVERLAP: [409, 'ปีงบประมาณของนโยบายนี้ทับกับนโยบายที่อนุมัติแล้ว'],
  BM_POLICY_WEIGHT_TOTAL: [400, 'น้ำหนักรวมต้องเท่ากับ 100'],
  BM_POLICY_CRITERIA_INCOMPLETE: [400, 'กรุณาระบุเกณฑ์ให้ครบ 8 ข้อและไม่ซ้ำ'],
  BM_POLICY_INPUT_INVALID: [400, 'ข้อมูลนโยบายไม่ถูกต้อง'],
  BM_POLICY_NOT_APPROVED: [409, 'นโยบายที่ใช้กับรายงานนี้ยังไม่ได้อนุมัติ จึงสิ้นสุดรายงานไม่ได้ · หากมีนโยบายที่อนุมัติแล้ว กด “รีเฟรชหลักฐาน” เพื่อเปลี่ยนมาใช้นโยบายนั้น'],
  BM_FISCAL_YEAR_INVALID: [400, 'ปีงบประมาณไม่ถูกต้อง'],
  BM_ANNUAL_REVISION_NOT_FOUND: [404, 'ไม่พบรายงานประเมิน'],
  BM_ANNUAL_REVISION_IMMUTABLE: [409, 'รายงานที่สิ้นสุดแล้วแก้ไขไม่ได้ สร้างฉบับร่างใหม่แทน'],
  BM_ANNUAL_INPUT_INVALID: [400, 'ข้อมูลรายงานไม่ถูกต้อง'],
  BM_ANNUAL_EVIDENCE_STALE: [409, 'หลักฐานเปลี่ยนไปหลังสร้างร่าง · กด “รีเฟรชหลักฐาน” แล้วตรวจตัวเลขอีกครั้งก่อนสิ้นสุดรายงาน'],
  BM_ANNUAL_COVERAGE_LOW: [409, 'ยังไม่มีผลตรวจรับที่ใช้คำนวณ Coverage หรือความครอบคลุมต่ำกว่าเกณฑ์ตามนโยบาย'],
  BM_VENDOR_FOLLOWUP_NOT_FOUND: [404, 'ไม่พบงานติดตามผลประเมินผู้ขาย'],
  BM_VENDOR_FOLLOWUP_INVALID: [400, 'ข้อมูลติดตามผลไม่ถูกต้อง'],
  BM_VENDOR_FOLLOWUP_OWNER_INVALID: [400, 'ผู้รับผิดชอบต้องเป็นเจ้าหน้าที่ Stock ที่ใช้งานอยู่'],
  BM_VENDOR_FOLLOWUP_PLAN_REQUIRED: [400, 'กรุณากำหนดผู้รับผิดชอบ วันครบกำหนด และแผนแก้ไขก่อนเริ่มดำเนินการ'],
  BM_VENDOR_FOLLOWUP_RESOLUTION_REQUIRED: [400, 'กรุณาบันทึกผลการแก้ไขก่อนปิดงาน'],
  BM_ANNUAL_TEXT_REQUIRED: [400, 'กรอกสรุป จุดแข็ง ความเสี่ยง และข้อเสนอแนะให้ครบทั้ง 4 ช่อง'],
  BM_ANNUAL_SIGNERS_REQUIRED: [400, 'เลือกผู้ประเมิน ผู้ทบทวน และผู้อนุมัติให้ครบ'],
  BM_ANNUAL_SIGNATURE_MISSING: [409, 'ผู้ลงนามบางคนยังไม่มีลายเซ็น ให้เจ้าตัวเซ็นที่หน้าบัญชีของฉันก่อน'],
  BM_ANNUAL_NO_APPLICABLE_CRITERIA: [409, 'ยังไม่มีหลักฐานให้คำนวณคะแนนในปีงบประมาณนี้'],
  BM_SIGNER_INACTIVE: [409, 'ผู้ลงนามคนหนึ่งไม่ได้ใช้งานอยู่'],
  BM_SIGNER_POSITION_REQUIRED: [409, 'ผู้ลงนามต้องมีตำแหน่งก่อน'],
  BM_SIGNATURE_INVALID: [400, 'ลายเซ็นไม่ถูกต้อง'],
  BM_POSITION_INVALID: [400, 'ตำแหน่งยาวเกินไป'],
  BM_USER_NOT_FOUND: [404, 'ไม่พบผู้ใช้'],
}

/** Throws the HttpError for a failed database call; anything without a known BM_* code keeps its raw message. */
export function throwRpcError(error: { code?: string; message: string } | null): void {
  if (!error) return
  const code = Object.keys(MESSAGES).find((key) => error.message.includes(key))
  if (code) {
    const [status, message] = MESSAGES[code]
    throw new HttpError(status, message)
  }
  if (error.message.includes('bm_vendors_tax_id_format')) throw new HttpError(400, 'เลขประจำตัวผู้เสียภาษีต้องเป็นตัวเลข 13 หลัก')
  if (error.message.includes('bm_vendors_tax_branch_format')) throw new HttpError(400, 'รหัสสาขาต้องเป็นตัวเลข 5 หลัก')
  if (error.message.includes('bm_vendors_email_format')) throw new HttpError(400, 'รูปแบบอีเมลไม่ถูกต้อง')
  if (error.message.includes('bm_vendor_issues_type_check')) throw new HttpError(400, 'ประเภทปัญหาไม่ถูกต้อง')
  if (error.message.includes('bm_vendor_evaluation_policies_version_key')) throw new HttpError(409, 'เวอร์ชันนโยบายนี้มีอยู่แล้ว')
  throw new HttpError(400, error.message || 'Vendor database operation failed')
}
