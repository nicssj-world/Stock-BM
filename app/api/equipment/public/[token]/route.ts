import { submitPublicEquipmentRecord } from '@/lib/server/equipment'
import { respond } from '@/lib/server/route'

export const runtime = 'nodejs'
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) { return respond(async () => ({ submission: await submitPublicEquipmentRecord((await params).token, await request.formData()) })) }
