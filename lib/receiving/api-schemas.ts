import { z } from 'zod'

const nullableText = (max: number) => z.string().trim().max(max).nullable().optional()

export const vendorCreateSchema = z.object({
  code: z.string().trim().min(1).max(80),
  name: z.string().trim().min(1).max(180),
  taxId: nullableText(80),
  address: nullableText(500),
  phone: nullableText(80),
  email: nullableText(180),
  contactPerson: nullableText(180),
  note: nullableText(1000),
})

export const vendorUpdateSchema = vendorCreateSchema.partial().extend({
  isActive: z.boolean().optional(),
})

export type VendorCreateInput = z.infer<typeof vendorCreateSchema>
export type VendorUpdateInput = z.infer<typeof vendorUpdateSchema>
