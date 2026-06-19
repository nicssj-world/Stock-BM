# Molecular-CBH QMS

ระบบบริหารคุณภาพห้องปฏิบัติการงานอณูชีววิทยา โรงพยาบาลชลบุรี (เดิมชื่อ Stock-BM) ครอบคลุม 3 ส่วน: จัดการ stock น้ำยา/consumable, IQC (Internal Quality Control) และ EQA (External Quality Assessment)

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
```

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

## Protected Routes

ถ้าเพิ่มหน้า protected ใหม่ ต้องเพิ่ม path ใน matcher ของ `proxy.ts` ด้วย ไม่งั้น Proxy จะไม่ redirect ไป login

