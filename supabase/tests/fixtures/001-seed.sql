-- Deterministic data used by the local real-Postgres verification harness.
-- This file runs after the repository migrations. The CD4 rows also satisfy
-- the precondition of 202608270002 when the harness resumes that migration.

insert into public.nipt_users (id, ephis_id, display_name, role, is_active)
values (
  '00000000-0000-0000-0000-000000000001',
  'HARNESS-ADMIN',
  'Stock Harness Admin',
  'Admin',
  true
)
on conflict (id) do update
set ephis_id = excluded.ephis_id,
    display_name = excluded.display_name,
    role = excluded.role,
    is_active = excluded.is_active;

insert into public.bm_stock_categories (id, name, created_by)
values ('10000000-0000-0000-0000-000000000001', 'Harness Reagents', '00000000-0000-0000-0000-000000000001')
on conflict (id) do nothing;

insert into public.bm_stock_locations (id, code, name, storage_condition, created_by)
values ('20000000-0000-0000-0000-000000000001', 'HARNESS-ROOM', 'Harness Room Temperature', 'room', '00000000-0000-0000-0000-000000000001')
on conflict (id) do nothing;

insert into public.bm_stock_items (
  id, item_code, name, category_id, unit, minimum_stock, supplier, catalog_no,
  manufacturer, manufacturer_barcode, track_lot, track_expiry, created_by
)
values
  (
    '30000000-0000-0000-0000-000000000001', 'HARNESS-ITEM-001', 'Harness reagent one',
    '10000000-0000-0000-0000-000000000001', 'กล่อง', 0, 'Harness Supplier',
    'CAT-001', 'Harness Manufacturer', 'ITEM-BARCODE-001', true, true,
    '00000000-0000-0000-0000-000000000001'
  ),
  (
    '30000000-0000-0000-0000-000000000002', 'HARNESS-ITEM-002', 'Harness reagent two',
    '10000000-0000-0000-0000-000000000001', 'ชุด', 0, 'Harness Supplier',
    'CAT-002', 'Harness Manufacturer', null, true, true,
    '00000000-0000-0000-0000-000000000001'
  )
on conflict (id) do nothing;

insert into public.bm_stock_lots (
  id, item_id, lot_number, expiry_date, manufacturer_barcode, created_by
)
values
  (
    '40000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000001',
    'HARNESS-LOT-001', '2028-12-31', 'LOT-BARCODE-001',
    '00000000-0000-0000-0000-000000000001'
  ),
  (
    '40000000-0000-0000-0000-000000000002',
    '30000000-0000-0000-0000-000000000002',
    'HARNESS-LOT-002', '2029-12-31', null,
    '00000000-0000-0000-0000-000000000001'
  )
on conflict (id) do nothing;

insert into public.bm_user_access (user_id, role, is_active, created_by)
values (
  '00000000-0000-0000-0000-000000000001', 'Admin', true,
  '00000000-0000-0000-0000-000000000001'
)
on conflict (user_id) do update
set role = excluded.role,
    is_active = excluded.is_active;

insert into public.iqc_instruments (id, code, name, created_by)
values (
  '50000000-0000-0000-0000-000000000001', 'HARNESS-CD4', 'Harness CD4 instrument',
  '00000000-0000-0000-0000-000000000001'
)
on conflict (id) do nothing;

insert into public.iqc_control_materials (id, name, created_by)
values (
  '50000000-0000-0000-0000-000000000002', 'Harness CD4 control',
  '00000000-0000-0000-0000-000000000001'
)
on conflict (id) do nothing;

insert into public.iqc_control_lots (id, control_material_id, lot_number, created_by)
values (
  '50000000-0000-0000-0000-000000000003',
  '50000000-0000-0000-0000-000000000002', 'HARNESS-CD4-LOT',
  '00000000-0000-0000-0000-000000000001'
)
on conflict (id) do nothing;

insert into public.iqc_analytes (id, code, name, created_by)
values
  ('50000000-0000-0000-0000-000000000004', '%CD3', 'Harness CD3', '00000000-0000-0000-0000-000000000001'),
  ('50000000-0000-0000-0000-000000000005', '%CD4', 'Harness CD4', '00000000-0000-0000-0000-000000000001')
on conflict (id) do nothing;

insert into public.iqc_control_plans (id, analyte_id, instrument_id, required_levels, created_by)
values
  (
    '50000000-0000-0000-0000-000000000006',
    '50000000-0000-0000-0000-000000000004',
    '50000000-0000-0000-0000-000000000001',
    array['normal'], '00000000-0000-0000-0000-000000000001'
  ),
  (
    '50000000-0000-0000-0000-000000000007',
    '50000000-0000-0000-0000-000000000005',
    '50000000-0000-0000-0000-000000000001',
    array['normal'], '00000000-0000-0000-0000-000000000001'
  )
on conflict (id) do nothing;
