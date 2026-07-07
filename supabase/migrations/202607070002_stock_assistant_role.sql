-- Add an HPV-only Stock Assistant role.

alter table public.bm_user_access drop constraint if exists bm_user_access_role_check;
alter table public.bm_user_access
  add constraint bm_user_access_role_check
  check (role in ('Admin', 'Staff', 'Assistant'));
