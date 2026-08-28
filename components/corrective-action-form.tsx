'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { AlertCircle, CheckCircle2, ChevronDown, ChevronUp } from 'lucide-react'
import {
  actionOptionsFor,
  CORRECTION_OUTCOME_OPTIONS,
  createEmptyReviewFindings,
  ERROR_TYPE_OPTIONS,
  issueOptionsFor,
  REVIEW_STATUS_OPTIONS,
  reviewCategoriesFor,
  validateCorrectiveAction,
  type CorrectiveActionDraft,
  type CorrectiveModule,
  type CorrectiveReviewCategoryKey,
  type CorrectiveReviewStatus,
  type CorrectiveValidationIssue,
} from '@/lib/corrective-actions'
import { Button, Card, Field, Input, Notice, Select, Textarea } from '@/components/ui'

export type CorrectiveActionSubmitIntent = 'draft' | 'complete'

export interface CorrectiveActionFormProps {
  module: CorrectiveModule
  mode: 'create' | 'edit'
  idPrefix?: string
  context: ReactNode
  systemSignals?: string[]
  suggestedIssueTypes?: string[]
  ownerOptions: Array<{ id: string; displayName: string }>
  initialValue?: Partial<CorrectiveActionDraft>
  busy?: boolean
  onSubmit: (value: CorrectiveActionDraft, intent: CorrectiveActionSubmitIntent) => void | Promise<void>
  onCancel?: () => void
}

function initialDraft(module: CorrectiveModule, initial: Partial<CorrectiveActionDraft> | undefined, suggestedIssueTypes: string[]) {
  return {
    problem: initial?.problem ?? '',
    issueTypes: [...(initial?.issueTypes ?? suggestedIssueTypes)],
    probableErrorType: initial?.probableErrorType ?? 'unknown',
    probableErrorNote: initial?.probableErrorNote ?? '',
    reviewFindings: createEmptyReviewFindings(module, initial?.reviewFindings ?? {}),
    rootCause: initial?.rootCause ?? '',
    actionTypes: [...(initial?.actionTypes ?? [])],
    actionTaken: initial?.actionTaken ?? '',
    correctionOutcome: initial?.correctionOutcome ?? '',
    correctionOutcomeNote: initial?.correctionOutcomeNote ?? '',
    preventiveAction: initial?.preventiveAction ?? '',
    ownerId: initial?.ownerId ?? '',
    dueDate: initial?.dueDate ?? '',
  } satisfies CorrectiveActionDraft
}

function normalizeDraft(value: CorrectiveActionDraft, module: CorrectiveModule): CorrectiveActionDraft {
  return {
    ...value,
    problem: value.problem.trim(),
    issueTypes: [...value.issueTypes],
    probableErrorNote: value.probableErrorNote.trim(),
    reviewFindings: Object.fromEntries(reviewCategoriesFor(module).map((category) => {
      const finding = value.reviewFindings[category.key]
      return [category.key, { status: finding?.status ?? 'not-reviewed', note: finding?.note?.trim() || null }]
    })),
    rootCause: value.rootCause.trim(),
    actionTypes: [...value.actionTypes],
    actionTaken: value.actionTaken.trim(),
    correctionOutcomeNote: value.correctionOutcomeNote.trim(),
    preventiveAction: value.preventiveAction.trim(),
    ownerId: value.ownerId || '',
    dueDate: value.dueDate || '',
  }
}

function fieldId(field: string) {
  return field.replace(/[^a-zA-Z0-9_-]+/g, '-')
}

type CorrectiveSectionKey = 'problem' | 'review' | 'actions' | 'ownership'

const CORRECTIVE_SECTION_KEYS: CorrectiveSectionKey[] = ['problem', 'review', 'actions', 'ownership']

function sectionForField(field: string): CorrectiveSectionKey {
  if (field.startsWith('reviewFindings.')) return 'review'
  if (['rootCause', 'actionTypes', 'actionTaken', 'correctionOutcome', 'correctionOutcomeNote', 'preventiveAction'].some((name) => field === name || field.startsWith(`${name}.`))) return 'actions'
  if (field === 'ownerId' || field === 'dueDate') return 'ownership'
  return 'problem'
}

function CorrectiveSection({ section, sectionId, label, summary, open, hasError, onToggle, children }: {
  section: CorrectiveSectionKey
  sectionId: string
  label: string
  summary: string
  open: boolean
  hasError: boolean
  onToggle: (section: CorrectiveSectionKey) => void
  children: ReactNode
}) {
  const toggleId = `${sectionId}-toggle`
  const panelId = `${sectionId}-panel`
  return (
    <section className="border-t border-[#e5eeee] pt-2">
      <button
        id={toggleId}
        type="button"
        className="flex min-h-12 w-full items-center justify-between gap-3 rounded-md px-2 text-left transition hover:bg-[#f7fbfb] focus-visible:ring-2 focus-visible:ring-[#0b7f76] focus-visible:outline-none"
        onClick={() => onToggle(section)}
        aria-expanded={open}
        aria-controls={panelId}
      >
        <span className="min-w-0">
          <span className="block text-sm font-bold text-[#315763]">{label}</span>
          <span className={`mt-0.5 block text-[11px] ${hasError ? 'font-semibold text-[#c02a37]' : 'text-[#789097]'}`}>
            {hasError ? 'ต้องตรวจสอบข้อมูล · ' : null}{summary}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-2 text-[#789097]">
          {hasError ? <AlertCircle className="size-4 text-[#c02a37]" aria-hidden="true" /> : null}
          {open ? <ChevronUp className="size-4" aria-hidden="true" /> : <ChevronDown className="size-4" aria-hidden="true" />}
        </span>
      </button>
      {open ? <div id={panelId} role="region" aria-labelledby={toggleId} className="px-1 pb-1 pt-3">{children}</div> : null}
    </section>
  )
}

export function CorrectiveActionForm({
  module,
  mode,
  idPrefix,
  context,
  systemSignals = [],
  suggestedIssueTypes = [],
  ownerOptions,
  initialValue,
  busy = false,
  onSubmit,
  onCancel,
}: CorrectiveActionFormProps) {
  const [value, setValue] = useState<CorrectiveActionDraft>(() => initialDraft(module, initialValue, suggestedIssueTypes))
  const [errors, setErrors] = useState<CorrectiveValidationIssue[]>([])
  const [openSections, setOpenSections] = useState<Set<CorrectiveSectionKey>>(() => new Set(['problem']))
  const errorSummaryRef = useRef<HTMLDivElement>(null)
  const formIdPrefix = fieldId(idPrefix ?? `${module}-${mode}`)
  const categories = useMemo(() => reviewCategoriesFor(module), [module])
  const issueOptions = useMemo(() => issueOptionsFor(module), [module])
  const actionOptions = useMemo(() => actionOptionsFor(module), [module])

  useEffect(() => {
    if (errors.length) errorSummaryRef.current?.focus()
  }, [errors])

  function update<K extends keyof CorrectiveActionDraft>(key: K, next: CorrectiveActionDraft[K]) {
    setValue((current) => ({ ...current, [key]: next }))
  }

  function toggleList(key: 'issueTypes' | 'actionTypes', item: string) {
    update(key, value[key].includes(item) ? value[key].filter((entry) => entry !== item) : [...value[key], item])
  }

  function updateReview(key: CorrectiveReviewCategoryKey, status: CorrectiveReviewStatus, note?: string) {
    update('reviewFindings', {
      ...value.reviewFindings,
      [key]: {
        status,
        note: note === undefined ? value.reviewFindings[key]?.note ?? null : note,
      },
    })
  }

  function errorFor(field: string) {
    return errors.find((issue) => issue.field === field || issue.field.startsWith(`${field}.`))?.message
  }

  function focusField(field: string) {
    const section = sectionForField(field)
    setOpenSections((current) => {
      if (current.has(section)) return current
      const next = new Set(current)
      next.add(section)
      return next
    })
    const target = field.startsWith('reviewFindings.')
      ? fieldId(`${formIdPrefix}-reviewFindings-${field.split('.')[1]}`)
      : fieldId(`${formIdPrefix}-${field}`)
    window.setTimeout(() => document.getElementById(target)?.focus(), 0)
  }

  function controlId(name: string) {
    return fieldId(`${formIdPrefix}-${name}`)
  }

  async function submit(intent: CorrectiveActionSubmitIntent) {
    const nextErrors = validateCorrectiveAction(value, module, intent)
    setErrors(nextErrors)
    if (nextErrors.length) {
      setOpenSections((current) => {
        const next = new Set(current)
        nextErrors.forEach((issue) => next.add(sectionForField(issue.field)))
        return next
      })
      return
    }
    await onSubmit(normalizeDraft(value, module), intent)
  }

  function toggleSection(section: CorrectiveSectionKey) {
    setOpenSections((current) => {
      const next = new Set(current)
      if (next.has(section)) next.delete(section)
      else next.add(section)
      return next
    })
  }

  function setAllSections(open: boolean) {
    setOpenSections(open ? new Set(CORRECTIVE_SECTION_KEYS) : new Set())
  }

  function onFormSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void submit('draft')
  }

  const reviewedCount = categories.filter((category) => {
    const status = value.reviewFindings[category.key]?.status
    return status && status !== 'not-reviewed'
  }).length
  const sectionHasError = (section: CorrectiveSectionKey) => errors.some((issue) => sectionForField(issue.field) === section)
  const actionsSummary = `${value.actionTypes.length} รายการแก้ไข · ${value.preventiveAction.trim() ? 'มีแนวทางป้องกันแล้ว' : 'ยังไม่มีแนวทางป้องกัน'}`
  const ownerSummary = value.ownerId || value.dueDate ? `${value.ownerId ? 'กำหนดผู้รับผิดชอบแล้ว' : 'ยังไม่กำหนดผู้รับผิดชอบ'} · ${value.dueDate ? 'กำหนด Due date แล้ว' : 'ยังไม่กำหนด Due date'}` : 'ยังไม่กำหนดผู้รับผิดชอบหรือ Due date'

  return (
    <Card className="space-y-4 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-bold text-[#173d50]">{mode === 'create' ? 'เปิด Corrective Action' : 'แก้ไข Corrective Action'}</h2>
          <p className="mt-1 text-xs leading-5 text-[#6a838c]">
            บันทึกแบบร่างได้ก่อน แล้วเติมหลักฐานให้ครบก่อนส่งตรวจ/ปิดงาน · {reviewedCount}/{categories.length} หมวดได้รับการทบทวน
          </p>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full border border-[#d6e2e3] bg-[#f8fbfb] px-2.5 py-1 text-[11px] font-semibold text-[#55727c]">
          <CheckCircle2 className="size-3.5" /> {module.toUpperCase()}
        </span>
      </div>

      {context}

      {systemSignals.length ? (
        <Notice tone="warning">
          <div>
            <p className="font-semibold">ข้อมูลผิดปกติจากระบบ</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs">
              {systemSignals.map((signal) => <li key={signal}>{signal}</li>)}
            </ul>
            <p className="mt-1 text-xs">กรุณายืนยันหรือเพิ่มเติมรายละเอียดจากการสอบทวนจริง</p>
          </div>
        </Notice>
      ) : null}

      {errors.length ? (
        <div ref={errorSummaryRef} tabIndex={-1} role="alert" aria-live="assertive" className="rounded-md border border-[#efc7cc] bg-[#fff5f6] p-3 text-sm text-[#a83541]">
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <div>
              <p className="font-bold">ตรวจสอบข้อมูลก่อนดำเนินการต่อ ({errors.length} รายการ)</p>
              <ul className="mt-1 list-disc space-y-1 pl-4 text-xs">
                {errors.map((issue) => <li key={`${issue.field}-${issue.message}`}><button type="button" className="text-left underline underline-offset-2" onClick={() => focusField(issue.field)}>{issue.message}</button></li>)}
              </ul>
            </div>
          </div>
        </div>
      ) : null}

      <form className="space-y-4" onSubmit={onFormSubmit} noValidate>
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[#dce7e8] bg-[#fbfefe] px-3 py-2">
          <p className="text-xs font-semibold text-[#58747d]">{openSections.size}/{CORRECTIVE_SECTION_KEYS.length} หัวข้อกำลังแสดง</p>
          <div className="flex flex-wrap gap-1">
            <button type="button" className="min-h-11 rounded-md px-2.5 text-xs font-semibold text-[#0b7f76] hover:bg-[#eaf7f5] focus-visible:ring-2 focus-visible:ring-[#0b7f76] focus-visible:outline-none" onClick={() => setAllSections(true)}>แสดงทั้งหมด</button>
            <button type="button" className="min-h-11 rounded-md px-2.5 text-xs font-semibold text-[#58747d] hover:bg-white focus-visible:ring-2 focus-visible:ring-[#0b7f76] focus-visible:outline-none" onClick={() => setAllSections(false)}>ซ่อนทั้งหมด</button>
          </div>
        </div>

        <CorrectiveSection section="problem" sectionId={controlId('section-problem')} label="1. ปัญหาและการจำแนกเหตุผิดปกติ" summary={`${value.issueTypes.length} ประเภทปัญหา · ${value.problem.trim() ? 'มีรายละเอียดปัญหาแล้ว' : 'ยังไม่มีรายละเอียดปัญหา'}`} open={openSections.has('problem')} hasError={sectionHasError('problem')} onToggle={toggleSection}>
          <fieldset className="space-y-3">
            <Field label="ปัญหาที่พบ / Problem">
              <Textarea id={controlId('problem')} rows={3} value={value.problem} onChange={(event) => update('problem', event.target.value)} aria-invalid={Boolean(errorFor('problem'))} aria-describedby={errorFor('problem') ? `${controlId('problem')}-error` : undefined} placeholder="สรุปเหตุการณ์ที่พบและผลกระทบต่อการควบคุมคุณภาพ" required />
              {errorFor('problem') ? <span id={`${controlId('problem')}-error`} className="mt-1 block text-xs text-[#c02a37]">{errorFor('problem')}</span> : null}
            </Field>
            <div>
              <p className="mb-1 text-xs font-semibold text-[#58747d]">ประเภทปัญหา <span className="font-normal text-[#8ba0a5]">(เลือกได้มากกว่า 1)</span></p>
              <div id={controlId('issueTypes')} tabIndex={-1} className="grid gap-2 rounded-md focus-visible:ring-2 focus-visible:ring-[#0b7f76] focus-visible:outline-none sm:grid-cols-2">
                {issueOptions.map((option) => <label key={option.value} className="flex min-h-11 items-center gap-2 rounded-md border border-[#dce7e8] bg-[#fbfefe] px-3 py-2 text-xs text-[#3f5c64] hover:bg-[#f3f9f9]">
                  <input type="checkbox" checked={value.issueTypes.includes(option.value)} onChange={() => toggleList('issueTypes', option.value)} />
                  <span>{option.label}</span>
                </label>)}
              </div>
              {errorFor('issueTypes') ? <p className="mt-1 text-xs text-[#c02a37]">{errorFor('issueTypes')}</p> : null}
            </div>
            <div className="grid gap-3 md:grid-cols-[220px_minmax(0,1fr)]">
              <Field label="ประเภทสาเหตุที่คาดการณ์">
                <Select id={controlId('probableErrorType')} value={value.probableErrorType} onChange={(event) => update('probableErrorType', event.target.value as CorrectiveActionDraft['probableErrorType'])} aria-invalid={Boolean(errorFor('probableErrorType'))}>
                  {ERROR_TYPE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </Select>
              </Field>
              <Field label="รายละเอียดสาเหตุที่คาดการณ์" hint="ใช้เมื่อเลือก Other หรือเมื่อต้องการอธิบายเพิ่มเติม">
                <Textarea id={controlId('probableErrorNote')} rows={2} value={value.probableErrorNote} onChange={(event) => update('probableErrorNote', event.target.value)} aria-invalid={Boolean(errorFor('probableErrorNote'))} />
                {errorFor('probableErrorNote') ? <span className="mt-1 block text-xs text-[#c02a37]">{errorFor('probableErrorNote')}</span> : null}
              </Field>
            </div>
          </fieldset>
        </CorrectiveSection>

        <CorrectiveSection section="review" sectionId={controlId('section-review')} label="2. ผลการสอบทวน" summary={`${reviewedCount}/${categories.length} หมวดได้รับการทบทวน`} open={openSections.has('review')} hasError={sectionHasError('review')} onToggle={toggleSection}>
          <fieldset className="space-y-3">
            <p className="text-xs leading-5 text-[#789097]">เลือกสถานะให้ครบทุกหมวดที่แสดง หากผิดปกติหรือไม่เกี่ยวข้องให้ระบุหลักฐาน/เหตุผล</p>
            <div className="space-y-2">
              {categories.map((category) => {
                const finding = value.reviewFindings[category.key] ?? { status: 'not-reviewed' as const, note: null }
                const reviewError = errorFor(`reviewFindings.${category.key}`)
                const noteError = errorFor(`reviewFindings.${category.key}.note`)
                return <fieldset key={category.key} className="rounded-md border border-[#dce7e8] bg-[#fbfefe] p-3">
                  <legend className="px-1 text-xs font-bold text-[#3f5c64]">{category.label}</legend>
                  {category.helper ? <p className="mb-2 text-[11px] text-[#8ba0a5]">{category.helper}</p> : null}
                  <div className="space-y-3">
                    <div id={controlId(`reviewFindings-${category.key}`)} tabIndex={-1} className="grid grid-cols-2 gap-2 rounded-md focus-visible:ring-2 focus-visible:ring-[#0b7f76] focus-visible:outline-none">
                      {REVIEW_STATUS_OPTIONS.map((option) => <label key={option.value} className={`flex min-h-11 min-w-0 items-center gap-2 rounded-md border px-3 py-2 text-xs font-semibold leading-4 ${finding.status === option.value ? 'border-[#0b7f76] bg-[#e6f5f2] text-[#08766e]' : 'border-[#dce7e8] bg-white text-[#58747d]'}`}>
                        <input type="radio" name={`review-${module}-${category.key}`} value={option.value} checked={finding.status === option.value} onChange={() => updateReview(category.key, option.value)} />
                        <span className="min-w-0">{option.label}</span>
                      </label>)}
                    </div>
                    <div className="min-w-0">
                      <Textarea rows={2} value={finding.note ?? ''} onChange={(event) => updateReview(category.key, finding.status, event.target.value)} placeholder="หลักฐาน / หมายเหตุ" aria-label={`หมายเหตุ ${category.label}`} aria-invalid={Boolean(noteError)} />
                      {reviewError ? <p className="mt-1 text-xs text-[#c02a37]">{reviewError}</p> : null}
                      {!reviewError && noteError ? <p className="mt-1 text-xs text-[#c02a37]">{noteError}</p> : null}
                    </div>
                  </div>
                </fieldset>
              })}
            </div>
          </fieldset>
        </CorrectiveSection>

        <CorrectiveSection section="actions" sectionId={controlId('section-actions')} label="3–5. Root cause, การแก้ไข และการป้องกันเกิดซ้ำ" summary={actionsSummary} open={openSections.has('actions')} hasError={sectionHasError('actions')} onToggle={toggleSection}>
          <fieldset className="space-y-4">
            <Field label="สาเหตุราก / Root cause">
              <Textarea id={controlId('rootCause')} rows={3} value={value.rootCause} onChange={(event) => update('rootCause', event.target.value)} aria-invalid={Boolean(errorFor('rootCause'))} placeholder="อธิบายสาเหตุที่ยืนยัน/พบจากการสอบทวน" />
              {errorFor('rootCause') ? <span className="mt-1 block text-xs text-[#c02a37]">{errorFor('rootCause')}</span> : null}
            </Field>
            <div>
              <p className="mb-1 text-xs font-semibold text-[#58747d]">การแก้ไขที่ดำเนินการ <span className="font-normal text-[#8ba0a5]">(เลือกได้มากกว่า 1)</span></p>
              <div id={controlId('actionTypes')} tabIndex={-1} className="grid gap-2 rounded-md focus-visible:ring-2 focus-visible:ring-[#0b7f76] focus-visible:outline-none sm:grid-cols-2">
                {actionOptions.map((option) => <label key={option.value} className="flex min-h-11 items-center gap-2 rounded-md border border-[#dce7e8] bg-[#fbfefe] px-3 py-2 text-xs text-[#3f5c64] hover:bg-[#f3f9f9]">
                  <input type="checkbox" checked={value.actionTypes.includes(option.value)} onChange={() => toggleList('actionTypes', option.value)} />
                  <span>{option.label}</span>
                </label>)}
              </div>
              {errorFor('actionTypes') ? <p className="mt-1 text-xs text-[#c02a37]">{errorFor('actionTypes')}</p> : null}
            </div>
            <Field label="รายละเอียดการแก้ไข / Action taken">
              <Textarea id={controlId('actionTaken')} rows={3} value={value.actionTaken} onChange={(event) => update('actionTaken', event.target.value)} aria-invalid={Boolean(errorFor('actionTaken'))} placeholder="ระบุสิ่งที่ทำ ผู้ดำเนินการ และผลที่ได้" />
              {errorFor('actionTaken') ? <span className="mt-1 block text-xs text-[#c02a37]">{errorFor('actionTaken')}</span> : null}
            </Field>
            <div className="grid gap-3 md:grid-cols-[220px_minmax(0,1fr)]">
              <Field label="ผลการแก้ไขทันที">
                <Select id={controlId('correctionOutcome')} value={value.correctionOutcome} onChange={(event) => update('correctionOutcome', event.target.value as CorrectiveActionDraft['correctionOutcome'])} aria-invalid={Boolean(errorFor('correctionOutcome'))}>
                  <option value="">— เลือกผลการแก้ไข —</option>
                  {CORRECTION_OUTCOME_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </Select>
                {errorFor('correctionOutcome') ? <span className="mt-1 block text-xs text-[#c02a37]">{errorFor('correctionOutcome')}</span> : null}
              </Field>
              <Field label="รายละเอียดผลการแก้ไข" hint="จำเป็นเมื่อเลือก Monitoring หรือ Other">
                <Textarea id={controlId('correctionOutcomeNote')} rows={2} value={value.correctionOutcomeNote} onChange={(event) => update('correctionOutcomeNote', event.target.value)} aria-invalid={Boolean(errorFor('correctionOutcomeNote'))} placeholder="เช่น ผลหลังทำซ้ำ, เกณฑ์ที่จะติดตาม หรือเหตุผลที่ยังแก้ไม่ได้" />
                {errorFor('correctionOutcomeNote') ? <span className="mt-1 block text-xs text-[#c02a37]">{errorFor('correctionOutcomeNote')}</span> : null}
              </Field>
            </div>
            <Field label="แนวทางป้องกันการเกิดซ้ำ / Preventive action">
              <Textarea id={controlId('preventiveAction')} rows={3} value={value.preventiveAction} onChange={(event) => update('preventiveAction', event.target.value)} aria-invalid={Boolean(errorFor('preventiveAction'))} placeholder="ระบุการปรับ SOP, training, checklist, monitoring หรือ control plan ที่จะป้องกันไม่ให้เกิดซ้ำ" />
              {errorFor('preventiveAction') ? <span className="mt-1 block text-xs text-[#c02a37]">{errorFor('preventiveAction')}</span> : null}
            </Field>
          </fieldset>
        </CorrectiveSection>

        <CorrectiveSection section="ownership" sectionId={controlId('section-ownership')} label="6. ผู้รับผิดชอบและกำหนดเสร็จ" summary={ownerSummary} open={openSections.has('ownership')} hasError={sectionHasError('ownership')} onToggle={toggleSection}>
          <fieldset className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="ผู้รับผิดชอบ">
                <Select id={controlId('ownerId')} value={value.ownerId} onChange={(event) => update('ownerId', event.target.value)}>
                  <option value="">— ยังไม่กำหนด —</option>
                  {ownerOptions.map((owner) => <option key={owner.id} value={owner.id}>{owner.displayName}</option>)}
                </Select>
              </Field>
              <Field label="กำหนดเสร็จ / Due date">
                <Input id={controlId('dueDate')} type="date" value={value.dueDate} onChange={(event) => update('dueDate', event.target.value)} />
              </Field>
            </div>
          </fieldset>
        </CorrectiveSection>

        <div className="flex flex-wrap justify-end gap-2 border-t border-[#e5eeee] pt-4">
          {onCancel ? <Button type="button" variant="ghost" disabled={busy} onClick={onCancel}>ยกเลิก</Button> : null}
          <Button type="submit" variant="secondary" disabled={busy}>{busy ? 'กำลังบันทึก…' : 'บันทึกแบบร่าง'}</Button>
          {mode === 'edit' ? <Button type="button" disabled={busy} onClick={() => void submit('complete')}>{busy ? 'กำลังตรวจสอบ…' : 'ตรวจครบและปิดงาน'}</Button> : null}
        </div>
      </form>
    </Card>
  )
}
