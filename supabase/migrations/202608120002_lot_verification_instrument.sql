-- Persist the instrument selected for a Lot verification so the same
-- instrument-scoped analyte and lot choices remain visible when editing.

alter table public.lotverif_verifications
  add column if not exists instrument_id uuid references public.iqc_instruments(id);

create index if not exists lotverif_verifications_instrument
  on public.lotverif_verifications(instrument_id);
