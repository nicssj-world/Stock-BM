export interface Vendor {
  id: string
  code: string
  name: string
  taxId: string | null
  address: string | null
  phone: string | null
  email: string | null
  contactPerson: string | null
  isActive: boolean
  note: string | null
  createdBy: string
  createdAt: string
  updatedAt: string
  itemCount: number
}

export interface SupplierCandidate {
  supplier: string
  itemCount: number
  itemCodes: string[]
}
