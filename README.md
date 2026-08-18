# Molecular-CBH QMS

ระบบบริหารคุณภาพห้องปฏิบัติการงานอณูชีววิทยา โรงพยาบาลชลบุรี (เดิมชื่อ Stock-BM) ครอบคลุม 4 ส่วน: จัดการ stock น้ำยา/consumable, IQC (Internal Quality Control), EQA (External Quality Assessment) และ HPV Genotype (เบิก-จ่ายชุดเก็บตัวอย่างให้ รพ.สต./หน่วยงาน, รับตัวอย่างกลับ, จัดเก็บ sample storage box)

## Stack

- Next.js 16 App Router
- React 19
- Supabase Auth + Postgres
- Tailwind CSS v4
- Vitest

## Environment

สร้าง `.env.local` จาก `.env.example`

```env
NEXT_PUBLIC_BM_SUPABASE_URL=
NEXT_PUBLIC_BM_SUPABASE_ANON_KEY=
BM_SUPABASE_SERVICE_ROLE_KEY=
LINE_CHANNEL_ACCESS_TOKEN=
LINE_GROUP_ID=
LINE_CHANNEL_SECRET=
```

`LINE_CHANNEL_ACCESS_TOKEN` และ `LINE_GROUP_ID` ใช้เฉพาะฝั่ง server สำหรับ HIV LAB Alert ห้ามใส่ค่าเหล่านี้ในตัวแปร `NEXT_PUBLIC_*` หรือส่งให้ browser และต้องเชิญ LINE Official Account เข้า group เป้าหมายก่อนส่งข้อความ ส่วน `LINE_CHANNEL_SECRET` ใช้ตรวจสอบลายเซ็นของ LINE Webhook ที่ `/api/line/webhook` และต้องเก็บเป็น server secret เช่นกัน

หลัง deploy แล้ว ให้ตั้ง Webhook URL ใน LINE Developers Console เป็น:

```text
https://<production-domain>/api/line/webhook
```

ส่งข้อความทดสอบในกลุ่ม แล้วอ่านค่า `LINE_GROUP_ID_CANDIDATES` จาก server log จากนั้นนำ `groupId` ไปตั้งใน `LINE_GROUP_ID` และนำ Route ชั่วคราวออกหรือปิด Webhook หากไม่ต้องการรับ event ต่อ

HN/LN และข้อมูล HIV ยังเป็นข้อมูลที่ระบุตัวผู้ป่วยได้ ควรให้ DPO/ฝ่ายความปลอดภัยของโรงพยาบาลอนุมัติการส่งเข้า LINE group ก่อนใช้งานจริง

ใช้ Supabase project เดียวกับ `Genomic-CBH` แต่ Molecular-CBH QMS ใช้ cookie แยกชื่อ `bm-stock-auth`

## Database

Apply migration:

```sql
supabase/migrations/202606120001_bm_stock_v1.sql
```

Migration นี้สร้างตาราง `bm_*` แยกจาก `nipt_stock_*` แต่ผูกบัญชีผู้ใช้กับ `nipt_users`

## Bootstrap Admin

หลัง apply migration และตั้ง env แล้ว:

```powershell
npm run bootstrap:stock-admin -- --ephis 12345 --name "Admin Name" --password "initialPassword"
```

คำสั่งนี้จะสร้างหรืออัปเดต Supabase user, `nipt_users`, และ `bm_user_access` เป็น Stock Admin

## Commands

```powershell
npm run dev
npm run lint
npm run test
npm run build
```

## EQA: ลำดับสถานะของรอบทดสอบ

สถานะของ EQA round เปลี่ยนตามงานที่บันทึกจริง เพื่อให้ลำดับงานสะท้อนกระบวนการปฏิบัติงานและลดการแก้ไขสถานะแบบคลาดเคลื่อน

| ลำดับ | สถานะ | เกิดขึ้นเมื่อ |
| --- | --- | --- |
| 1 | `scheduled` | สร้าง round ใหม่ (ค่าเริ่มต้น) |
| 2 | `received` | บันทึกแบบรับตัวอย่าง |
| 3 | `submitted` | ผู้ทำการตรวจวิเคราะห์ลงนามยืนยันแบบรับตัวอย่าง |
| 4 | `evaluated` | บันทึกสรุปผลของ round (ผ่าน/ไม่ผ่าน) |
| 5 | `closed` | ผู้จัดการวิชาการลงนามแบบรับตัวอย่างครบ ทำให้เอกสารอนุมัติครบ 2 ราย |

การเปลี่ยนสถานะเป็นแบบเดินหน้าเท่านั้น: การแก้ไขข้อมูลในขั้นก่อนหน้า เช่น แก้แบบรับตัวอย่างหลังจากประเมินผลแล้ว จะไม่ทำให้สถานะย้อนกลับไปเป็น `received` และ dropdown สำหรับปรับสถานะแบบ manual ไม่แสดงในหน้าจอผู้ใช้

หน้ารอบ EQA แสดง progress ตามขั้นตอนหลัก ได้แก่ แบบรับตัวอย่างครบ, มีผล, ประเมินแล้ว, สรุปผ่าน/ไม่ผ่าน และอนุมัติครบ 2 ราย โดยแต่ละขั้นอ้างอิงข้อมูลจริงของ round ไม่ได้ดูเฉพาะชื่อสถานะ

การแจ้งเตือนกำหนดส่งผลจะคำนวณเฉพาะ round ที่ยังเปิดอยู่ (`scheduled` และ `received`) ส่วนรายงานสรุปรายปีจะพร้อมอนุมัติเมื่อ round มีสถานะ `evaluated` หรือ `closed` พร้อมผลการประเมินและ corrective action ที่ปิดครบในกรณีผลไม่ผ่าน

## EQA: รหัสย่อผู้รับผิดชอบ

ในแผน EQA ช่อง “เดือน/ผู้รับผิดชอบ” ใช้รหัสย่อ (Initial) ที่เติมอัตโนมัติเมื่อเลือกผู้ใช้ แต่ยังแก้ไขในรายการแผนได้ หากต้องใช้รหัสเฉพาะของงานนั้น

| ชื่อผู้ใช้ | รหัสย่อ |
| --- | --- |
| Siriwat J | `SJ` |
| Siritorn C | `SC` |
| Somrat M | `SM` |
| Umaporn R | `UR` |
| Worrawut W | `WW` |

ตารางจับคู่นี้อยู่ใน `lib/bm/responsible-codes.ts` และใช้ร่วมกันทั้ง EQA กับ Equipment; รหัสที่เลือกใช้จริงจะถูกบันทึกกับแต่ละรายการกำหนดการของแผน (`eqa_plan_occurrences.responsible_code`) ไม่ได้เก็บเป็นฟิลด์กลางในโปรไฟล์ผู้ใช้

โค้ดที่เกี่ยวข้องอยู่ที่ `lib/eqa/types.ts`, `lib/eqa/rules.ts`, `lib/server/eqa.ts` และ `components/eqa-view.tsx`

## Protected Routes

ถ้าเพิ่มหน้า protected ใหม่ ต้องเพิ่ม path ใน matcher ของ `proxy.ts` ด้วย ไม่งั้น Proxy จะไม่ redirect ไป login (ถ้าเพิ่มหน้าใหม่ใต้ path ที่มี `:path*` อยู่แล้ว เช่น `/hpv/*`, `/environment/*` ก็ครอบคลุมอยู่แล้วไม่ต้องแก้)

## PDF Reports

หน้ารายงานที่ต้อง export เป็น PDF (เช่น `app/(protected)/environment/report`, `app/(protected)/hpv/report`) ใช้วิธี render เป็นหน้า HTML จัดหน้าแบบ A4 พร้อมปุ่ม "Print / Save PDF" ที่เรียก `window.print()` — ไม่ใช้ `lib/reports/pdf.ts` เพราะตัวนั้น generate PDF ด้วยการเขียน byte ตรง ๆ (font Helvetica, WinAnsi) และ strip ตัวอักษรที่ไม่ใช่ ASCII ทิ้ง ภาษาไทยจะกลายเป็น `?` ทั้งหมด ใช้ได้เฉพาะรายงานที่เป็นภาษาอังกฤษล้วนเท่านั้น (เช่น `/api/reports/stock-summary.pdf`)

