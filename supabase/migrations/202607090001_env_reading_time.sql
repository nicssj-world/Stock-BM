-- Optional reading time for backdated temperature records.
-- created_at remains the actual system timestamp when the record was saved.

alter table public.env_readings
  add column if not exists reading_time time;

notify pgrst, 'reload schema';
