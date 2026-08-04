import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(join(process.cwd(), 'components/hpv-view.tsx'), 'utf8')

describe('HPV sample storage interface', () => {
  it('keeps a selected specimen type while scanning samples', () => {
    expect(source).toContain('specimenType, position: selectedPosition')
    expect(source).toContain('role="group" aria-label="Specimen type"')
    expect(source).toContain("onClick={() => setSpecimenType('self_collected')}")
    expect(source).toContain("onClick={() => setSpecimenType('clinician_collected')}")
    expect(source).not.toContain('<Select value={specimenType}')
  })

  it('shows specimen types on samples without retaining box types', () => {
    expect(source).toContain('sample.specimenType')
    expect(source).not.toContain('box.boxType')
  })

  it('lets staff close an open box directly from the Storage boxes list', () => {
    expect(source).toContain('<th className="px-2 py-2 text-right">Action</th>')
    expect(source).toContain("box.status === 'open' ? <button")
    expect(source).toContain('onClick={(event) => { event.stopPropagation(); void closeBox(box) }}')
    expect(source).toContain('ปิดกล่อง')
  })

  it('lets staff reopen a closed box without deleting its samples', () => {
    expect(source).toContain("body: JSON.stringify({ action: 'reopen' })")
    expect(source).toContain("box.status === 'full' ? <button")
    expect(source).toContain('เปิดกล่องกลับ')
  })

  it('keeps full or closed boxes viewable while intake falls back to an open box', () => {
    expect(source).toContain('const [viewBoxId, setViewBoxId]')
    expect(source).toContain('const [intakeBoxId, setIntakeBoxId]')
    expect(source).toContain('resolveHpvStorageBoxes(data.boxes, viewBoxId, intakeBoxId)')
    expect(source).toContain('setViewBoxId(scanBox.id)')
  })

  it('defaults the Checkout tab to samples still waiting to be delivered', () => {
    expect(source).toContain("useState<HpvCheckoutStatusFilter>('pending')")
    expect(source).toContain('filterHpvCheckoutSamples(checkedOutSamples, statusFilter, historySearch, yearFilter)')
    expect(source).toContain('ส่งมอบครบทุกตัวอย่างแล้ว')
  })

  it('lets staff narrow the Checkout history to a single checkout year', () => {
    expect(source).toContain("useState(HPV_CHECKOUT_YEAR_ALL)")
    expect(source).toContain('aria-label="กรองปีที่ checkout"')
    expect(source).toContain('checkoutYears.map((year) => <option key={year} value={year}>{year}</option>)')
  })

  it('lets staff select pending samples and hand them over as one batch', () => {
    expect(source).toContain('aria-label={`เลือก ${sample.barcode}`}')
    expect(source).toContain('onChange={toggleAll}')
    expect(source).toContain('ส่งมอบตัวอย่าง ({selectedIds.length})')
    expect(source).toContain('<HpvDeliveryDialog')
    // Only pending rows are selectable, so a delivered batch can never be re-sent.
    expect(source).toContain("filteredCheckedOutSamples.filter((sample) => sample.deliveryStatus === 'pending')")
  })

  it('shows the hand-over record and keeps undo behind an Admin check', () => {
    expect(source).toContain('พิมพ์ใบส่งมอบ')
    expect(source).toContain("label={pending ? 'รอส่งตัวอย่าง' : 'ส่งตัวอย่างแล้ว'}")
    expect(source).toContain("actor.role === 'Admin'")
    expect(source).toContain('ยกเลิกรอบส่งมอบ')
  })
})
