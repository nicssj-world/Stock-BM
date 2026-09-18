# Recovered approved Stock1 requirement

This execution-scope amendment records the requirement recovered from the user’s
execution correction:

> Recovered approved Stock1 requirement omitted from Revision 3:
> Invoice auto-document crop + manually adjustable four-corner perspective crop.

## Placement

This belongs in Phase 2 after barcode foundations, scanner plumbing, and package
scan, and before the Tesseract.js OCR runtime and invoice OCR intake.

## Required workflow

Capture or select an invoice image, suggest a document quadrilateral when possible,
allow manual editing of all four corners, rectify the confirmed quadrilateral with
a perspective transform, preserve the original separately, and only then hand the
confirmed processed image to the OCR layer. Auto-detection failure falls back to a
manual four-corner crop; skip-crop is an explicit user action.

## Release evidence

Tests must cover coordinate scaling, corner ordering/reset/editing, transform input
validation, detection fallback, skip-crop, orientation handling, confirmation
ordering, and the invariant that crop/OCR code never mutates stock. Manual Phase 2
acceptance must include straight, angled, cluttered-background, incorrect and
failed auto-detection, reset, retake, corrected preview, corrected-image OCR, and
real iPhone Safari verification.
