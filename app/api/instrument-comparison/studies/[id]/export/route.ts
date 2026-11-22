import { compareInstruments, PAIR_LIMIT_MIN_PERCENT } from '@/lib/instcomp/compare'
import { requireActor } from '@/lib/server/auth'
import { getInstCompStudy } from '@/lib/server/instcomp'
import { addKeyValueSheet, addTableSheet, excelDate, exportOrError, newWorkbook, todayStamp, xlsxResponse } from '@/lib/server/xlsx-export'

/** One study as a workbook: header + statistics, then every pair with raw and computed values. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return exportOrError(async () => {
    const study = await getInstCompStudy((await params).id, await requireActor())
    const { pairs, summary } = compareInstruments(
      study.samples.map((sample) => ({ rowNo: sample.rowNo, sampleLabel: sample.sampleLabel, referenceRaw: sample.referenceRaw, candidateRaw: sample.candidateRaw })),
      { scale: study.scale, biasLimit: study.biasLimit, pairLimit: study.pairLimit, minPairs: study.minPairs },
    )
    const unit = study.scale === 'log10' ? 'log10' : '%'
    const noteByRow = new Map(study.samples.map((sample) => [sample.rowNo, sample]))
    const book = newWorkbook()

    addKeyValueSheet(book, 'Summary', [
      ['หัวข้อ', study.title],
      ['การทดสอบ', study.testName],
      ['หน่วย', study.unit],
      ['เครื่องอ้างอิง (เดิม)', study.referenceLabel],
      ['เครื่องที่ประเมิน (ใหม่)', study.candidateLabel],
      ['สเกล', study.scale],
      ['วันที่ทดสอบ', excelDate(study.performedOn)],
      ['สถานะ', study.status],
      ['เกณฑ์ bias เฉลี่ย (±)', study.biasLimit],
      ['เกณฑ์ผลต่างรายคู่ (±)', study.pairLimit],
      [`สัดส่วนคู่ในเกณฑ์ขั้นต่ำ (%)`, PAIR_LIMIT_MIN_PERCENT],
      ['จำนวนคู่ขั้นต่ำ', study.minPairs],
      ['', null],
      ['จำนวนตัวอย่าง', summary.totalRows],
      ['คู่เชิงปริมาณ (n)', summary.quantitativeN],
      [`Bias เฉลี่ย (${unit})`, summary.meanBias],
      [`SD ผลต่าง (${unit})`, summary.sdDifference],
      ['LoA ล่าง', summary.loaLower],
      ['LoA บน', summary.loaUpper],
      [`ผลต่างสูงสุด (${unit})`, summary.maxAbsDifference],
      ['คู่ในเกณฑ์รายคู่', summary.withinPairLimitN],
      ['คู่ในเกณฑ์รายคู่ (%)', summary.withinPairLimitPercent],
      ['Slope (b)', summary.slope],
      ['Intercept (a)', summary.intercept],
      ['r', summary.r],
      ['Detected/ND concordance (%)', summary.concordancePercent],
      ['ไม่ตรงกัน (discordant)', summary.discordantN],
      ['ผลการประเมิน', summary.verdict],
      ['เหตุผล', summary.reasons.join(' · ') || null],
      ['', null],
      ['สรุปผล', study.conclusion],
      ['ผู้ทำการทดสอบ', study.createdByName],
      ['ผู้ทบทวน', study.reviewedByName],
      ['วันที่ทบทวน', excelDate(study.reviewedAt)],
      ['ผู้อนุมัติ', study.approvedByName],
      ['วันที่อนุมัติ', excelDate(study.approvedAt)],
    ])

    addTableSheet(book, 'Pairs', [
      { header: '#', width: 6, value: (pair) => pair.rowNo },
      { header: 'ตัวอย่าง', width: 16, value: (pair) => pair.sampleLabel },
      { header: 'ผลเครื่องเดิม (raw)', width: 20, value: (pair) => noteByRow.get(pair.rowNo)?.referenceRaw },
      { header: 'ผลเครื่องใหม่ (raw)', width: 20, value: (pair) => noteByRow.get(pair.rowNo)?.candidateRaw },
      { header: `เดิม (${study.scale})`, numFmt: '0.0000', value: (pair) => pair.referenceStat },
      { header: `ใหม่ (${study.scale})`, numFmt: '0.0000', value: (pair) => pair.candidateStat },
      { header: 'ค่าเฉลี่ย', numFmt: '0.0000', value: (pair) => pair.mean },
      { header: `ผลต่าง (${unit})`, numFmt: '0.0000', value: (pair) => pair.difference },
      { header: 'ในเกณฑ์รายคู่', value: (pair) => (pair.withinPairLimit == null ? null : pair.withinPairLimit ? 'ใช่' : 'ไม่') },
      { header: 'ประเภท', width: 22, value: (pair) => pair.category },
      { header: 'หมายเหตุ', width: 24, value: (pair) => noteByRow.get(pair.rowNo)?.note },
    ], pairs)

    return xlsxResponse(book, `instrument-comparison_${study.testName}_${todayStamp()}.xlsx`)
  })
}
