# HPV Sample Storage: specimen type per sample

## Goal

Remove storage-box types. Staff select the specimen type once and may scan a continuous series of barcodes into an open box. Every scanned sample retains its own type.

## Data model

- Remove `box_type` from `bm_hpv_storage_boxes`.
- Add required `specimen_type` to `bm_hpv_storage_samples` with exactly two allowed values: `self_collected` and `clinician_collected`.
- The environment has no existing storage data, so the migration drops the old column directly and does not need a data backfill.
- Update TypeScript types and server mappings so `HpvStorageBox` no longer exposes a type and `HpvSample` does.

## Scanning flow

- The Sample Storage screen provides a persistent specimen-type selector above the barcode input.
- The selector defaults to Self-collected and remains selected after each successful scan.
- Each scan request includes the selected type. The server validates it and writes it to the created sample.
- Changing the selector affects only later scans; it never changes samples already stored.

## Interface changes

- Creating a storage box requires only a box code.
- The open-box selector and box detail header no longer describe a box type.
- Every sample displayed in Storage boxes has a compact, accessible colour-coded badge:
  - Self-collected: teal.
  - Clinician-collected: amber.
- Sample search and checkout results show the sample's specimen type rather than its box's former type.

## Error handling and verification

- The scan API rejects a missing or unsupported specimen type.
- Existing barcode, box-status, duplicate-sample, and capacity rules remain unchanged.
- Unit tests cover the type rules and migration structure. Build, focused lint, and the full test suite must pass.
