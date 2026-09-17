-- L0-11: the real PostgreSQL TOR function matches the full Revision 3
-- calendar-month fixture table, including clamp and leap-year boundaries.

do $$
declare
  v_case record;
  v_actual text;
begin
  for v_case in
    select * from (values
      (date '2027-10-15', date '2028-04-15', 'not_compliant'),
      (date '2027-10-15', date '2028-04-16', 'compliant'),
      (date '2027-10-15', date '2028-04-14', 'not_compliant'),
      (date '2026-08-31', date '2027-02-28', 'not_compliant'),
      (date '2026-08-31', date '2027-03-01', 'compliant'),
      (date '2026-08-29', date '2027-02-28', 'not_compliant'),
      (date '2027-08-29', date '2028-02-29', 'not_compliant'),
      (date '2027-08-31', date '2028-02-29', 'not_compliant'),
      (date '2027-12-31', date '2028-06-30', 'not_compliant'),
      (date '2027-12-31', date '2028-07-01', 'compliant'),
      (date '2027-10-15', null::date, 'not_applicable')
    ) as fixture(received_date, expiry_date, expected)
  loop
    v_actual := public.bm_tor_expiry_compliance(v_case.expiry_date, v_case.received_date, 6);
    if v_actual <> v_case.expected then
      raise exception 'L0-11: % received % expected %, got %', v_case.expiry_date, v_case.received_date, v_case.expected, v_actual;
    end if;
  end loop;
end;
$$;

select 'L0-11 PASS' as verification;
