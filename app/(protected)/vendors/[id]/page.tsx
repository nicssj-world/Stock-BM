import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { VendorPerformanceView } from '@/components/vendors/vendor-performance'
import { requireFullPageActor } from '@/lib/server/auth'
import { getVendorPerformance } from '@/lib/server/vendors'
import { vendorFiscalYearFor } from '@/lib/vendors/fiscal-year'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  return { title: `Vendor Performance ${(await params).id}` }
}

export default async function VendorPerformancePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ fiscalYear?: string }> }) {
  await requireFullPageActor()
  const { id } = await params
  const query = await searchParams
  const fiscalYear = query.fiscalYear && /^\d{4}$/.test(query.fiscalYear) ? query.fiscalYear : vendorFiscalYearFor(new Date().toISOString().slice(0, 10))
  try {
    return <VendorPerformanceView initialPerformance={await getVendorPerformance(id, fiscalYear)} />
  } catch (error) {
    if (error instanceof Error && 'status' in error && (error as { status?: number }).status === 404) notFound()
    throw error
  }
}
