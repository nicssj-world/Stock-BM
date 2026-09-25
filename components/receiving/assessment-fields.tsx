'use client'

import {
  ASSESSMENT_LABELS,
  ASSESSMENT_REASON_CODES,
  REASON_LABELS,
  hasAbnormalAnswer,
  type ReceiptAssessmentAnswers,
} from '@/lib/receiving/assessment'

type Option<T> = { value: T; label: string }

function RadioGroup<T extends string | boolean>({ name, legend, options, value, onChange, invalid }: { name: string; legend: string; options: Option<T>[]; value: T | null; onChange: (value: T) => void; invalid?: boolean }) {
  return <fieldset className="space-y-2">
    <legend className={`text-sm font-bold ${invalid ? 'text-[#a83541]' : 'text-[#173d50]'}`}>{legend} *</legend>
    <div className="grid grid-cols-2 gap-2">
      {options.map((option) => {
        const checked = value === option.value
        return <label key={String(option.value)} className={`flex min-h-12 cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold ${checked ? 'border-[#0b7f76] bg-[#eef9f7] text-[#0b5f58]' : 'border-[#d3e1e3] bg-white text-[#315763]'}`}>
          <input type="radio" name={name} className="size-4 accent-[#0b7f76]" checked={checked} onChange={() => onChange(option.value)} />
          {option.label}
        </label>
      })}
    </div>
  </fieldset>
}


/** The receipt-assessment questions, reasons and note (LABCBH-Stock form). Shared by the receiving dialog and the admin revision form. */
export function AssessmentFields({ answers, onChange, invalid }: { answers: ReceiptAssessmentAnswers; onChange: (next: Partial<ReceiptAssessmentAnswers>) => void; invalid: (field: keyof ReceiptAssessmentAnswers) => boolean }) {
  const abnormal = hasAbnormalAnswer(answers)
  const L = ASSESSMENT_LABELS
  const patch = onChange
  return <>
        <RadioGroup name="assessment-product" legend={L.productCondition.title} value={answers.productCondition} invalid={invalid('productCondition')} onChange={(value) => patch({ productCondition: value })} options={[{ value: 'normal', label: L.productCondition.options.normal }, { value: 'abnormal', label: L.productCondition.options.abnormal }]} />
        <RadioGroup name="assessment-documentation" legend={L.documentation.title} value={answers.documentation} invalid={invalid('documentation')} onChange={(value) => patch({ documentation: value })} options={[{ value: 'complete', label: L.documentation.options.complete }, { value: 'incomplete', label: L.documentation.options.incomplete }]} />
        <RadioGroup name="assessment-item" legend={L.itemCorrectness.title} value={answers.itemCorrectness} invalid={invalid('itemCorrectness')} onChange={(value) => patch({ itemCorrectness: value })} options={[{ value: 'correct', label: L.itemCorrectness.options.correct }, { value: 'problem', label: L.itemCorrectness.options.problem }]} />
        <RadioGroup name="assessment-cold-chain" legend={L.coldChainApplicable.title} value={answers.coldChainApplicable} invalid={invalid('coldChainApplicable')} onChange={(value) => patch({ coldChainApplicable: value, coldChainCondition: value ? answers.coldChainCondition : null })} options={[{ value: false, label: L.coldChainApplicable.options.false }, { value: true, label: L.coldChainApplicable.options.true }]} />
        {answers.coldChainApplicable === true ? <div className="border-l-2 border-[#b8ded8] pl-3"><RadioGroup name="assessment-cold-chain-condition" legend={L.coldChainCondition.title} value={answers.coldChainCondition} invalid={invalid('coldChainCondition')} onChange={(value) => patch({ coldChainCondition: value })} options={[{ value: 'appropriate', label: L.coldChainCondition.options.appropriate }, { value: 'inappropriate', label: L.coldChainCondition.options.inappropriate }]} /></div> : null}
        <RadioGroup name="assessment-complaint" legend={L.hasComplaint.title} value={answers.hasComplaint} invalid={invalid('hasComplaint')} onChange={(value) => patch({ hasComplaint: value })} options={[{ value: false, label: L.hasComplaint.options.false }, { value: true, label: L.hasComplaint.options.true }]} />

        {abnormal ? <fieldset className="space-y-2 rounded-md border border-[#eed4a6] bg-[#fffaf0] p-3">
          <legend className={`px-1 text-sm font-bold ${invalid('reasonCodes') || invalid('otherReasonDetail') ? 'text-[#a83541]' : 'text-[#173d50]'}`}>{L.reasonCodes.title} *</legend>
          <p className="text-xs text-[#a9700f]">มีรายการผิดปกติ — เลือกเหตุผลที่ยอมรับสินค้า (เลือกได้หลายข้อ)</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {ASSESSMENT_REASON_CODES.map((code) => {
              const checked = answers.reasonCodes.includes(code)
              return <label key={code} className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm ${checked ? 'border-[#0b7f76] bg-[#eef9f7] font-semibold text-[#0b5f58]' : 'border-[#d3e1e3] bg-white text-[#315763]'}`}>
                <input type="checkbox" className="size-4 accent-[#0b7f76]" checked={checked} onChange={() => patch({ reasonCodes: checked ? answers.reasonCodes.filter((item) => item !== code) : [...answers.reasonCodes, code] })} />
                {REASON_LABELS[code]}
              </label>
            })}
          </div>
          {answers.reasonCodes.includes('other') ? <input value={answers.otherReasonDetail} onChange={(event) => patch({ otherReasonDetail: event.target.value })} maxLength={1000} placeholder="ระบุเหตุผลอื่น" aria-label="ระบุเหตุผลอื่น" className="min-h-11 w-full rounded-md border border-[#cfdee0] bg-white px-3 py-2 text-sm text-[#173d50]" /> : null}
        </fieldset> : null}

        <label className="block">
          <span className={`text-sm font-bold ${invalid('note') ? 'text-[#a83541]' : 'text-[#173d50]'}`}>{L.note.title} {abnormal ? '*' : <span className="font-normal text-[#81979c]">(ไม่บังคับ)</span>}</span>
          {abnormal ? <span className="mt-0.5 block text-xs text-[#a9700f]">มีรายการผิดปกติ — ต้องระบุรายละเอียด</span> : null}
          <textarea value={answers.note} onChange={(event) => patch({ note: event.target.value })} rows={3} maxLength={4000} className="mt-1 w-full rounded-md border border-[#cfdee0] bg-white px-3 py-2 text-sm text-[#173d50]" />
        </label>

  </>
}
