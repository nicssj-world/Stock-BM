# Receiving expected-quantity and closure policy holds

> **Update 2026-09-25:** the holds below (P-06, P-07 stays, P-09, P-10, P-12, P-13, P-14, P-16) were closed by the owner decision to adopt LABCBH-Stock's vendor evaluation as the QP. See `2026-09-25-vendor-evaluation-labcbh-port.md`. The close route no longer returns 501; the text below is kept as history.

The Stock1 receiving flow records invoice and invoice-line expectations, links
each receipt to those records, and calculates cumulative received quantity. It
does not silently turn an operational observation into a policy decision.

## P-06 — Invoice closure after partial receiving

`POST /api/receiving/invoices/[id]/close` intentionally returns HTTP 501 with
the Thai policy message `รอการอนุมัติ policy การปิดใบส่งของ`. No invoice is
closed by the new flow.

## P-07 — Changing expected quantity after receiving starts

Expected quantity is editable through the invoice-line PATCH route only while
no receipt line has started against that invoice line. Once any linked receipt
line exists, the server returns HTTP 409 and writes no change. The attempted
edit is protected by the stock-operator route guard and the successful edit is
audited.

## P-09 and P-10 — Short-close transitions and reason vocabulary

`closure_state` remains a manual field. The cumulative display may show a line
as complete, but it does not change `closure_state` or close the invoice.
Short-close/reopen transitions remain pending P-09. Short-delivery reason
values remain free text until P-10 is approved; no vocabulary or scoring rule
is invented here.

## Due dates and scoring

No contractual due-date field is collected or inferred. Delivery Lead Time is
an informational invoice-date-to-received-date calculation only. Open and
cancelled lines are excluded from the Complete Delivery denominator, and the
metric remains provisional until P-06/P-09 are approved.
