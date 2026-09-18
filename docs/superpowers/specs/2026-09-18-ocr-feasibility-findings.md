# OCR feasibility findings — Revision 3

> **Status: OCR removed from Stock1.** Owner removed OCR from approved Stock1
> scope after real-iPhone acceptance testing (2026-09-18). The later
> Tesseract.js runtime, OCR intake and OCR tables were also retired; these
> findings are kept as history only.

This record retires the throwaway OCR feasibility spike before the production receiving workflow is extended.
The archive remains available on `origin/spike/ocr-v3`.

## Engines and runtime paths tried

- RapidOCR-style browser inference: `esearch-ocr` with `paddleocr-browser` ONNX assets, OpenCV preprocessing, and
  ONNX Runtime Web. The spike required browser runtime shims and externally hosted model/runtime assets.
- Official PaddleOCR.js: `@paddleocr/paddleocr-js` with a standalone Vite vendor bundle, Safari-targeted output, and
  browser-side PP-OCRv5 inference. The standalone bundle kept the SDK outside the Next.js bundle, but still required
  a separate model/runtime delivery path.
- Tesseract.js: browser-side worker inference. This is the selected Phase 2 direction, with the worker, core, and
  `tha`/`eng` traineddata self-hosted under `public/ocr/`; it remains capture-only and produces draft suggestions.

## iPhone Safari findings

The archived spike exercised the intended iPhone shape: Photos/camera input, browser-side image resize and contrast
preprocessing, and engine-specific result cards. The implementation included Safari-specific OpenCV readiness and
runtime fallback handling. The repository contains no durable benchmark artifact for a completed device run, and this
execution environment has no browser surface or connected iPhone, so no new iPhone engine pass is claimed here.
Real iPhone Safari verification remains a Phase 2 exit and release acceptance check.

## Catalog-match sample

The Revision 3 plan records the feasibility sample as 11/12 catalog matches. That is a feasibility signal only; it is
not permission to infer an Item from OCR text. Phase 2 keeps the four-outcome catalog matcher and requires explicit
review for ambiguous, similar, or unmatched results. OCR must never confirm a receipt or mutate stock.

## Why the CDN/import-map approach was rejected

The spike initially used CDN scripts and import maps for OpenCV, ONNX Runtime Web, model assets, `esearch-ocr`, and the
PaddleOCR SDK. That was useful for a disposable comparison page, but it is not an acceptable receiving runtime:
third-party availability and version drift are outside the application release, CSP/offline behavior is harder to
govern, and the browser would depend on external model delivery. Revision 3 therefore retires the spike and uses a
self-hosted Tesseract runtime. No external OCR service is introduced.

## Scope boundary

This document records feasibility only. The Phase 2 OCR path must remain authenticated, client-side, read-only, and
limited to Receive Draft suggestions. A user must review and confirm through the existing receiving path before any
ledger mutation.
