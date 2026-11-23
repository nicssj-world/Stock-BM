-- Team calendar: six more type colors (cyan, indigo, pink, red, brown, lime).
alter table public.bm_calendar_types drop constraint if exists bm_calendar_types_color_key_check;
alter table public.bm_calendar_types
  add constraint bm_calendar_types_color_key_check
  check (color_key in ('teal', 'rose', 'amber', 'sky', 'violet', 'green', 'orange', 'slate',
                       'cyan', 'indigo', 'pink', 'red', 'brown', 'lime'));
