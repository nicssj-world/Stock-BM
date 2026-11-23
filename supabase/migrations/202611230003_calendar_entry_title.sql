-- Team calendar: a short, shareable title on entries (e.g. what a meeting or
-- training is about). A type with requires_title makes it mandatory; unlike the
-- private note, the title is shown in the calendar, the LINE heads-up and the
-- phone-calendar feed.

alter table public.bm_calendar_types
  add column if not exists requires_title boolean not null default false;

alter table public.bm_calendar_events
  add column if not exists title text
  check (title is null or (nullif(trim(title), '') is not null and char_length(title) <= 80));

-- Meetings/training are the reason for this column; "ประชุม / อบรม" and "ประชุม/อบรม" match.
update public.bm_calendar_types
set requires_title = true, updated_at = now()
where regexp_replace(name, '\s', '', 'g') = 'ประชุม/อบรม';

notify pgrst, 'reload schema';
