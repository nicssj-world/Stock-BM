import { requireStockOperator } from '@/lib/server/auth'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  await requireStockOperator()
  return NextResponse.redirect(new URL('/reports/stock-summary', request.url))
}
