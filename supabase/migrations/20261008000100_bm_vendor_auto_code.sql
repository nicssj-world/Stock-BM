-- Allocate stable Vendor codes in the database so concurrent creates cannot collide.
create sequence if not exists public.bm_vendor_code_seq
  as bigint
  start with 1
  increment by 1
  minvalue 1
  no cycle;

revoke all on sequence public.bm_vendor_code_seq from public, anon, authenticated;
grant usage, select on sequence public.bm_vendor_code_seq to service_role;

-- Continue after existing codes that already use the generated V#### format.
do $$
declare
  v_last_code bigint;
begin
  select max(case when upper(code) ~ '^V[0-9]{1,18}$' then substring(upper(code) from 2)::bigint end)
    into v_last_code
    from public.bm_vendors;

  if v_last_code is null or v_last_code < 1 then
    perform setval('public.bm_vendor_code_seq', 1, false);
  else
    perform setval('public.bm_vendor_code_seq', v_last_code, true);
  end if;
end;
$$;

-- Keep accepting a supplied code for compatibility with already-running app versions.
-- The current API no longer sends one, so new Vendors receive the next V#### code.
create or replace function public.create_bm_vendor(p_actor uuid, p_data jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
  v_sequence_value bigint;
  v_name text;
  v_tax text;
  v_branch text;
  v_id uuid;
begin
  perform public.bm_require_role(p_actor, array['Admin']);
  perform public.bm_assert_vendor_fields(p_data);
  v_code := upper(public.bm_text(p_data, 'code'));
  if v_code is null then
    v_sequence_value := nextval('public.bm_vendor_code_seq');
    v_code := 'V' || lpad(v_sequence_value::text, greatest(4, length(v_sequence_value::text)), '0');
  end if;
  v_name := public.bm_text(p_data, 'name');
  v_tax := public.bm_text(p_data, 'taxId');
  v_branch := coalesce(public.bm_text(p_data, 'taxBranchCode'), '00000');
  if v_name is null then raise exception 'BM_VENDOR_CODE_NAME_REQUIRED'; end if;
  perform public.bm_assert_vendor_unique(null, v_code, v_name, v_tax, v_branch);
  insert into public.bm_vendors (code, name, legal_name, tax_id, tax_branch_code, address, contact_person, phone, email, note, created_by, updated_by)
  values (v_code, v_name, public.bm_text(p_data, 'legalName'), v_tax, v_branch, public.bm_text(p_data, 'address'), public.bm_text(p_data, 'contactPerson'),
          public.bm_text(p_data, 'phone'), public.bm_text(p_data, 'email'), public.bm_text(p_data, 'note'), p_actor, p_actor)
  returning id into v_id;
  perform public.bm_write_audit(p_actor, 'vendor.create', 'stock-vendor', v_id, jsonb_build_object('code', v_code, 'name', v_name));
  return v_id;
end;
$$;

-- Vendor codes are assigned once and remain stable when the rest of the record changes.
create or replace function public.update_bm_vendor(p_actor uuid, p_id uuid, p_data jsonb, p_expected_updated_at timestamptz)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old public.bm_vendors%rowtype;
  v_code text;
  v_name text;
  v_tax text;
  v_branch text;
begin
  perform public.bm_require_role(p_actor, array['Admin']);
  perform public.bm_assert_vendor_fields(p_data);
  select * into v_old from public.bm_vendors where id = p_id for update;
  if not found then raise exception 'BM_VENDOR_NOT_FOUND'; end if;
  if v_old.updated_at is distinct from p_expected_updated_at then raise exception 'BM_STALE_DATA'; end if;
  v_code := v_old.code;
  v_name := case when p_data ? 'name' then public.bm_text(p_data, 'name') else v_old.name end;
  v_tax := case when p_data ? 'taxId' then public.bm_text(p_data, 'taxId') else v_old.tax_id end;
  v_branch := case when p_data ? 'taxBranchCode' then coalesce(public.bm_text(p_data, 'taxBranchCode'), '00000') else v_old.tax_branch_code end;
  if v_name is null then raise exception 'BM_VENDOR_CODE_NAME_REQUIRED'; end if;
  perform public.bm_assert_vendor_unique(p_id, v_code, v_name, v_tax, v_branch);
  update public.bm_vendors set
    name = v_name, tax_id = v_tax, tax_branch_code = v_branch,
    legal_name = case when p_data ? 'legalName' then public.bm_text(p_data, 'legalName') else legal_name end,
    address = case when p_data ? 'address' then public.bm_text(p_data, 'address') else address end,
    contact_person = case when p_data ? 'contactPerson' then public.bm_text(p_data, 'contactPerson') else contact_person end,
    phone = case when p_data ? 'phone' then public.bm_text(p_data, 'phone') else phone end,
    email = case when p_data ? 'email' then public.bm_text(p_data, 'email') else email end,
    note = case when p_data ? 'note' then public.bm_text(p_data, 'note') else note end,
    updated_at = clock_timestamp(), updated_by = p_actor
  where id = p_id;
  perform public.bm_write_audit(p_actor, 'vendor.update', 'stock-vendor', p_id, jsonb_build_object('before', to_jsonb(v_old), 'keys', (select coalesce(jsonb_agg(k), '[]'::jsonb) from jsonb_object_keys(p_data) k)));
end;
$$;

notify pgrst, 'reload schema';
