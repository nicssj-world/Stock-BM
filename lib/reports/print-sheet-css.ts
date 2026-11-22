// Shared print styles for the A4 portrait record reports (instrument comparison,
// lot verification, IQC monthly). Each report page inlines it in a <style> tag,
// following the environment/HPV print-page pattern.
export const PRINT_SHEET_CSS = `
  @page { size: A4 portrait; margin: 10mm; }
  body { background: #e9eef0; }
  .report-page { color: #111; font-family: "Noto Sans Thai", Arial, sans-serif; padding: 16px; }
  .toolbar { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin: 0 auto 12px; max-width: 794px; }
  .toolbar a, #print-report { border: 1px solid #b8c8cc; background: white; border-radius: 6px; padding: 8px 12px; color: #173d50; font-weight: 700; font-size: 13px; }
  .sheet { position: relative; max-width: 794px; margin: 0 auto; background: white; padding: 28px 30px 36px; box-shadow: 0 10px 40px rgba(20, 64, 72, 0.16); font-size: 11px; line-height: 1.45; }
  .sheet + .sheet { margin-top: 18px; }
  .sheet-break { break-before: page; page-break-before: always; }
  .doc-code { position: absolute; right: 30px; top: 20px; font-size: 10px; font-weight: 700; }
  h1 { margin: 0; text-align: center; font-size: 17px; font-weight: 800; }
  .subhead { margin: 2px 0 14px; text-align: center; font-size: 11px; }
  h2 { margin: 14px 0 6px; font-size: 12.5px; font-weight: 800; border-bottom: 1px solid #222; padding-bottom: 2px; }
  .info { width: 100%; border-collapse: collapse; }
  .info th { text-align: left; font-weight: 700; width: 26%; padding: 2px 6px 2px 0; vertical-align: top; }
  .info td { padding: 2px 0; vertical-align: top; }
  .grid { width: 100%; border-collapse: collapse; table-layout: auto; }
  .grid th, .grid td { border: 1px solid #333; padding: 3px 5px; vertical-align: top; }
  .grid th { background: #f1f4f5; font-weight: 700; text-align: left; }
  .num { text-align: right; font-variant-numeric: tabular-nums; font-family: "IBM Plex Mono", ui-monospace, monospace; }
  .center { text-align: center; }
  .bad { color: #a40012; font-weight: 700; }
  .ok { color: #1d6b37; font-weight: 700; }
  .verdict { margin-top: 8px; padding: 6px 10px; border: 1.5px solid #222; font-weight: 800; font-size: 12px; }
  .verdict.pass { border-color: #1d6b37; color: #1d6b37; }
  .verdict.fail { border-color: #a40012; color: #a40012; }
  .verdict ul { margin: 4px 0 0 18px; padding: 0; font-weight: 400; font-size: 10.5px; color: #222; }
  .charts { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 8px; }
  .charts figure { margin: 0; border: 1px solid #ccc; padding: 6px; break-inside: avoid; }
  .charts figcaption { font-weight: 700; font-size: 10.5px; margin-bottom: 2px; }
  .charts svg { width: 100%; height: auto; }
  .conclusion { min-height: 48px; border: 1px solid #333; padding: 6px 8px; white-space: pre-wrap; }
  .signatures { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; margin-top: 22px; break-inside: avoid; }
  .signatures div { text-align: center; font-size: 10.5px; }
  .signatures .line { border-bottom: 1px dotted #333; min-height: 20px; margin-bottom: 3px; font-weight: 700; display: flex; align-items: flex-end; justify-content: center; }
  .muted { color: #555; font-size: 10px; }
  .footer-note { margin: 18px 0 0; text-align: center; font-size: 8.5px; color: #333; }
  tr { break-inside: avoid; }
  @media print {
    body { background: white; }
    .report-page { padding: 0; }
    .print-hidden { display: none !important; }
    .sheet { max-width: none; margin: 0; padding: 0; box-shadow: none; }
    .sheet + .sheet { margin-top: 0; }
    .doc-code { right: 0; top: 0; }
  }
`

export const REPORT_FOOTER = 'เอกสารนี้เป็นสมบัติของกลุ่มงานเทคนิคการแพทย์ โรงพยาบาลชลบุรี ห้ามนำออกไปใช้ภายนอกหรือทำซ้ำโดยไม่ได้รับอนุญาต'
export const REPORT_SUBHEAD = 'งานอณูชีววิทยา กลุ่มงานเทคนิคการแพทย์ โรงพยาบาลชลบุรี'
