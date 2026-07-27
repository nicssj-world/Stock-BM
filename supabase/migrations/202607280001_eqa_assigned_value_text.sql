-- A provider's EQA reference can be quantitative or qualitative (for example
-- "1,000", "Positive", or "Negative"). Preserve existing numeric values as text.
alter table public.eqa_results
  alter column assigned_value type text using assigned_value::text;
