import Link from 'next/link'
import type { ReactNode } from 'react'
import type { EqaApprovalRole, EqaDocumentApproval } from '@/lib/eqa/types'
import { EQA_APPROVAL_ROLE_LABELS } from '@/lib/eqa/types'
import { EqaPrintButton } from '@/components/eqa-print-button'

function thaiDateTime(value: string) {
  return new Intl.DateTimeFormat('th-TH-u-ca-buddhist', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'Asia/Bangkok' }).format(new Date(value))
}

export function EqaApprovalGrid({ roles, approvals }: { roles: EqaApprovalRole[]; approvals: EqaDocumentApproval[] }) {
  return <div className="approval-grid">{roles.map((role) => {
    const approval = approvals.find((item) => item.approvalRole === role)
    return <div className="approval-block" key={role}>
      <div className="signature-line">{approval?.approvedByName ?? ''}</div>
      <div className="signature-role">({EQA_APPROVAL_ROLE_LABELS[role]})</div>
      <div className="signature-date">วันที่ {approval ? thaiDateTime(approval.approvedAt) : '........................................'}</div>
    </div>
  })}</div>
}

export function EqaReportFrame({ backHref, code, orientation, draft, children }: { backHref: string; code: string; orientation: 'portrait' | 'landscape'; draft: boolean; children: ReactNode }) {
  return <main className={`eqa-report-page ${orientation}`}>
    <div className="report-toolbar print-hidden"><Link href={backHref}>กลับ EQA</Link><EqaPrintButton /></div>
    <section className="report-sheet">
      {draft ? <div className="draft-watermark">ฉบับร่าง - ยังอนุมัติไม่ครบ</div> : null}
      {children}
      <div className="document-code">{code}</div>
      <div className="legal-footer">เอกสารนี้เป็นสมบัติของกลุ่มงานเทคนิคการแพทย์ โรงพยาบาลชลบุรี ห้ามนำออกไปใช้ภายนอกหรือทำซ้ำโดยไม่ได้รับอนุญาต</div>
    </section>
    <style>{`
      @font-face{font-family:"TH Sarabun New";src:url('/fonts/th-sarabun-new/THSarabunNew-Regular.ttf') format('truetype');font-style:normal;font-weight:400;font-display:block}
      @font-face{font-family:"TH Sarabun New";src:url('/fonts/th-sarabun-new/THSarabunNew-Bold.ttf') format('truetype');font-style:normal;font-weight:700;font-display:block}
      @font-face{font-family:"TH Sarabun New";src:url('/fonts/th-sarabun-new/THSarabunNew-Italic.ttf') format('truetype');font-style:italic;font-weight:400;font-display:block}
      @font-face{font-family:"TH Sarabun New";src:url('/fonts/th-sarabun-new/THSarabunNew-BoldItalic.ttf') format('truetype');font-style:italic;font-weight:700;font-display:block}
      @page{size:A4 ${orientation};margin:${orientation === 'landscape' ? '9mm 9mm 15mm' : '9mm 10mm 16mm'}}
      .eqa-report-page,.eqa-report-page *{box-sizing:border-box;font-family:"TH Sarabun New",serif!important}
      .eqa-report-page{color:#000;font-size:18px;line-height:1.12}
      .report-toolbar{display:flex;justify-content:space-between;align-items:center;max-width:${orientation === 'landscape' ? '1120px' : '794px'};margin:0 auto 12px}
      .report-toolbar a,.report-toolbar button{border:1px solid #b8c8cc;background:#fff;border-radius:6px;padding:8px 14px;color:#173d50;font-family:"Noto Sans Thai",sans-serif!important;font-size:13px;font-weight:700}
      .report-toolbar button:disabled{opacity:.55}
      .report-sheet{position:relative;width:${orientation === 'landscape' ? '1120px' : '794px'};min-height:${orientation === 'landscape' ? '780px' : '1123px'};margin:0 auto;background:#fff;padding:${orientation === 'landscape' ? '28px 22px 72px' : '28px 42px 76px'};box-shadow:0 12px 40px rgba(20,64,72,.15);overflow:hidden}
      .document-code{position:fixed;right:10mm;bottom:7mm;z-index:5;font-size:15px;line-height:1;white-space:nowrap}
      .legal-footer{position:fixed;right:26mm;bottom:1.5mm;left:26mm;z-index:4;text-align:center;font-size:11px;line-height:1}
      .draft-watermark{position:fixed;top:47%;left:50%;z-index:0;transform:translate(-50%,-50%) rotate(-25deg);color:rgba(185,31,31,.11);font-size:64px;font-weight:700;white-space:nowrap;pointer-events:none}
      .report-sheet>*:not(.draft-watermark,.document-code,.legal-footer){position:relative;z-index:1}
      .approval-grid{display:grid;grid-template-columns:1fr 1fr;gap:20px 70px;margin:22px 28px 0;break-inside:avoid;page-break-inside:avoid}
      .approval-block{text-align:center;min-height:88px}
      .signature-line{min-height:27px;border-bottom:1px dotted #111;font-size:18px}
      .signature-role{margin-top:2px;font-size:17px}
      .signature-date{margin-top:7px;font-size:16px}
      table{border-collapse:collapse}
      thead{display:table-header-group}
      tr,.approval-grid{break-inside:avoid;page-break-inside:avoid}
      @media print{
        html,body{background:#fff!important}
        body>div>aside,body>div>nav{display:none!important}
        body>div{display:block!important}
        body>div>main{padding:0!important}
        .print-hidden{display:none!important}
        .eqa-report-page{font-size:18px;print-color-adjust:exact;-webkit-print-color-adjust:exact}
        .report-sheet{width:auto;min-height:auto;margin:0;padding:0 0 18mm;box-shadow:none;overflow:visible}
      }
    `}</style>
  </main>
}
