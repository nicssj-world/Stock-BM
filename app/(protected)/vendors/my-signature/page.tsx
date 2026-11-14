import { redirect } from 'next/navigation'

// Moved: one signature page now serves EQA, equipment and vendor reports.
export default function VendorMySignaturePage() {
  redirect('/my-signature')
}
