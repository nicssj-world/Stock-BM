# Self-hosted OCR assets

These files are the browser assets used by the authenticated receiving OCR
flow. They are served from the same application origin; the application passes
explicit local worker, core, and language paths to Tesseract.js and does not
load OCR code or language data from a CDN at runtime.

- `worker.min.js`, `tesseract-core-lstm.wasm.js`, and the matching `.wasm` are
  from `tesseract.js` / `tesseract.js-core` 7.0.0.
- `lang-data/eng.traineddata.gz` and `lang-data/tha.traineddata.gz` are the
  LSTM-only `4.0.0_best_int` data packages from `@tesseract.js-data/eng` and
  `@tesseract.js-data/tha` 1.0.0.

The upstream packages are distributed under their respective licenses. Keep
this note with the copied assets when updating them, and verify the asset
paths and checksums in the OCR runtime tests before release.
