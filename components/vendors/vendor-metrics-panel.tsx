'use client'

import Link from 'next/link'
import type { VendorMetric } from '@/lib/vendors/metrics'
import type { VendorMetrics } from '@/lib/vendors/types'
import { METRIC_EXCLUSION_LABELS, vendorMetricLabel } from '@/lib/vendors/metric-labels'
import { Card } from '@/components/ui'

function metricValue(metric: VendorMetric) {
  if (metric.display === 'count') return String(metric.numerator)
  return metric.denominator == null ? '-' : `${metric.numerator}/${metric.denominator}`
}

const SOURCE_KIND_LABEL: Record<string, string> = { assessment: 'การประเมินรับ', receipt_line: 'รายการรับเข้า', invoice_line: 'รายการใบส่งของ', issue: 'issue' }

/**
 * Evidence-based metrics with drill-down to the receipts, assessments and
 * issues that produced each number. No score, weighting or ranking exists
 * here (P-13/P-14 unresolved).
 */
export function VendorMetricsPanel({ metrics, receiptHref = (id) => `/receiving/receipts/${id}/report`, receiptLabel }: {
  metrics: VendorMetrics
  receiptHref?: ((receiptId: string) => string | null) | null
  receiptLabel?: (receiptId: string) => string
}) {
  const quantity = metrics.quantityVsExpected
  return <div className="space-y-3">
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {Object.values(metrics.metrics).map((metric) => {
        const sources = metric.sources ?? []
        const flagged = sources.filter((source) => source.flagged)
        return <Card key={metric.key} className="p-4">
          <div className="flex items-start justify-between gap-3"><div><h3 className="font-bold text-[#315763]">{vendorMetricLabel(metric.key)}</h3><p className="mt-1 text-xs text-[#81979c]">ประชากรที่ใช้: {metric.applicablePopulation}</p></div><span className="mono text-2xl font-bold tabular-nums text-[#173d50]">{metricValue(metric)}</span></div>
          {metric.percent != null ? <p className="mt-2 text-sm font-semibold text-[#0b7f76]">{metric.percent.toFixed(1)}%</p> : null}
          {metric.provisional ? <p className="mt-2 rounded-md border border-[#eed4a6] bg-[#fff9ed] px-2 py-1.5 text-xs leading-5 text-[#99601b]">provisional — รอ policy ที่เกี่ยวข้องก่อนนำไปใช้ต่อ</p> : null}
          {metric.excluded.length ? <p className="mt-2 text-xs text-[#81979c]">ไม่นับ: {metric.excluded.map((item) => `${METRIC_EXCLUSION_LABELS[item.reason] ?? item.reason} ${item.count}`).join(' · ')}</p> : null}
          {sources.length ? <details className="mt-2 border-t border-[#e6eeee] pt-2 text-xs text-[#58747d]">
            <summary className="cursor-pointer font-semibold text-[#315763]">ที่มา {sources.length} รายการ{flagged.length ? ` · ผิดปกติ ${flagged.length}` : ''}</summary>
            <ul className="mt-1 max-h-48 space-y-1 overflow-y-auto">{(flagged.length ? flagged : sources).map((source) => {
              const href = source.receiptId && receiptHref ? receiptHref(source.receiptId) : null
              const label = source.receiptId ? (receiptLabel?.(source.receiptId) ?? `receipt ${source.receiptId.slice(0, 8)}`) : `${SOURCE_KIND_LABEL[source.kind] ?? source.kind} ${source.id.slice(0, 8)}`
              return <li key={`${source.kind}-${source.id}`} className="flex justify-between gap-2"><span>{SOURCE_KIND_LABEL[source.kind] ?? source.kind}{source.flagged ? ' · ผิดปกติ' : ''}</span>{href ? <Link href={href} className="font-semibold text-[#0b7f76] underline">{label}</Link> : <span>{label}</span>}</li>
            })}</ul>
            {flagged.length ? <p className="mt-1 text-[11px] text-[#81979c]">แสดงเฉพาะรายการผิดปกติ</p> : null}
          </details> : null}
        </Card>
      })}
    </div>
    <div className="grid gap-3 md:grid-cols-2">
      {quantity ? <Card className="p-4"><h3 className="font-bold text-[#315763]">จำนวนรับจริงเทียบที่คาดหมาย</h3><p className="mt-1 text-xs text-[#81979c]">{quantity.label}</p><p className="mt-2 text-sm text-[#173d50]">ครบ {quantity.reachedExpected} · รับบางส่วน {quantity.partiallyReceived} · ยังไม่รับ {quantity.notYetReceived}{quantity.overExpected ? ` · เกิน ${quantity.overExpected}` : ''} <span className="text-xs text-[#81979c]">(จาก {quantity.linesWithExpected} รายการคาดหมาย)</span></p></Card> : null}
      <Card className="p-4"><h3 className="font-bold text-[#315763]">Delivery Lead Time</h3><p className="mt-1 text-xs text-[#81979c]">{metrics.deliveryLeadTime.label} · sample {metrics.deliveryLeadTime.sampleSize}</p><p className="mt-2 text-sm text-[#173d50]">{metrics.deliveryLeadTime.meanDays == null ? '-' : `${metrics.deliveryLeadTime.meanDays.toFixed(1)} วันเฉลี่ย / ${metrics.deliveryLeadTime.medianDays?.toFixed(1) ?? '-'} วันมัธยฐาน`}</p></Card>
    </div>
  </div>
}
