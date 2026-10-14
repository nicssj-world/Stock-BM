import {readFileSync} from 'node:fs'
import {join} from 'node:path'
import {describe,expect,it} from 'vitest'
const load=(p:string)=>readFileSync(join(process.cwd(),p),'utf8')
const page=load('app/(protected)/vendors/[id]/page.tsx')
const editor=load('components/vendors/annual-evaluation-editor.tsx')
const followups=load('components/vendors/vendor-followup-panel.tsx')
const api=load('app/api/vendors/[id]/followups/[followupId]/route.ts')
const lib=load('lib/vendors/evaluation.ts')
const server=load('lib/server/vendor-evaluation.ts')
const receipts=load('lib/server/vendors.ts')
describe('Vendor evaluation end-to-end UI contract',()=>{
  it('does not require all narrative fields to be present',()=>{
    expect(lib).not.toContain('กรอกสรุป จุดแข็ง ความเสี่ยง และข้อเสนอแนะให้ครบทั้ง 4 ช่อง')
    expect(editor).toContain('ผลการประเมินและข้อเสนอแนะ (ไม่บังคับ)')
  })
  it('keeps failed-report follow-ups editable by Admin with concurrency and evidence',()=>{
    expect(page).toContain('<VendorFollowupPanel')
    expect(followups).toContain('responsibleUserId')
    expect(followups).toContain('dueDate')
    expect(followups).toContain('actionPlan')
    expect(followups).toContain('resolutionNote')
    expect(followups).toContain('expectedUpdatedAt')
    expect(api).toContain('requireStockAdmin')
    expect(server).toContain('update_bm_vendor_annual_followup')
  })
  it('exposes older receipt assessments via cursorless bounded pages',()=>{
    expect(page).toContain('receiptPageSize = 20')
    expect(page).toContain('receiptHref(receiptPage+1)')
    expect(receipts).toContain(".range(offset,offset+pageSize-1)")
    expect(receipts).toContain("{count:'exact'}")
  })
})
