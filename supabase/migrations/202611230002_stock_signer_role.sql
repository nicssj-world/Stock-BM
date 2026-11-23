-- Signer: an approver from outside this unit (quality manager, group head)
-- who only reviews and signs the EQA documents assigned to them and manages
-- their own signature. The app rejects the role everywhere else
-- (lib/server/auth.ts); all its reads and writes go through the server's
-- service-role client.

alter table public.bm_user_access drop constraint if exists bm_user_access_role_check;
alter table public.bm_user_access
  add constraint bm_user_access_role_check
  check (role in ('Admin', 'Staff', 'Assistant', 'Signer'));

-- RLS read policies allow any role (`current_bm_role() is not null`). A Signer
-- has no reason to query tables directly with its own session, so it gets no
-- role here and therefore no direct table access.
create or replace function public.current_bm_role()
returns text language sql stable security definer set search_path = public as $$
  select access.role
  from public.bm_user_access access
  join public.nipt_users users on users.id = access.user_id
  where access.user_id = auth.uid()
    and access.is_active
    and users.is_active
    and access.role <> 'Signer';
$$;
