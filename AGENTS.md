<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Project conventions

- **PDF/report exports**: build a dedicated `<feature>/report` page (server component) that renders a print-styled HTML sheet with a "Print / Save PDF" button wired to `window.print()`. Do not use `lib/reports/pdf.ts` for anything containing Thai text — it writes raw PDF byte streams with a Helvetica/WinAnsi font and strips non-ASCII characters, so Thai renders as `?`. See `app/(protected)/environment/report` and `app/(protected)/hpv/report` for the pattern.
- **Exception — annual vendor evaluation report**: it is generated as a real PDF by `lib/vendors/annual-pdf.ts` (pdf-lib + TH Sarabun New fonts, served by `app/api/vendors/[id]/evaluations/[revisionId]/pdf`). This is the only report that does; it follows LABCBH-Stock's official QP layout, and its fonts/logo are listed in `next.config.ts` `outputFileTracingIncludes`. Every other report still uses the print-page pattern above.
- **New protected pages**: check `proxy.ts`'s matcher — most feature areas already use a `/feature/:path*` wildcard, so a new page nested under an existing feature route usually needs no change there.
