import { redirect } from 'next/navigation'

// Method comparison now lives inside each Method verification record
// (the lab compares instruments only as part of verifying a replacement).
export default function InstrumentComparisonPage() {
  redirect('/method-verification')
}
