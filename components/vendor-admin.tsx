'use client'

import { Building2, Plus, X } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import type { SupplierCandidate, Vendor } from '@/lib/receiving/types'
import { api, Button, Card, Field, Input, Notice, Textarea } from '@/components/ui'
import { ManagedList } from '@/components/managed-list'

type VendorForm = {
  code: string
  name: string
  taxId: string
  address: string
  phone: string
  email: string
  contactPerson: string
  note: string
}

const emptyForm: VendorForm = {
  code: '',
  name: '',
  taxId: '',
  address: '',
  phone: '',
  email: '',
  contactPerson: '',
  note: '',
}

export function VendorAdmin({
  vendors,
  supplierCandidates,
  onSaved,
  onError,
}: {
  vendors: Vendor[]
  supplierCandidates: SupplierCandidate[]
  onSaved: (vendors: Vendor[], text: string) => void
  onError: (text: string) => void
}) {
  const [form, setForm] = useState<VendorForm>(emptyForm)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const editingVendor = vendors.find((vendor) => vendor.id === editingId) ?? null

  function reset() {
    setEditingId(null)
    setForm(emptyForm)
  }

  function edit(vendor: Vendor) {
    setEditingId(vendor.id)
    setForm({
      code: vendor.code,
      name: vendor.name,
      taxId: vendor.taxId ?? '',
      address: vendor.address ?? '',
      phone: vendor.phone ?? '',
      email: vendor.email ?? '',
      contactPerson: vendor.contactPerson ?? '',
      note: vendor.note ?? '',
    })
  }

  async function save(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    try {
      const result = await api<{ vendors: Vendor[] }>(editingId ? `/api/vendors/${editingId}` : '/api/vendors', {
        method: editingId ? 'PATCH' : 'POST',
        body: JSON.stringify(form),
      })
      onSaved(result.vendors, editingId ? 'อัปเดต vendor แล้ว' : 'เพิ่ม vendor แล้ว')
      reset()
    } catch (error) {
      onError(error instanceof Error ? error.message : 'บันทึก vendor ไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  async function toggle(id: string, isActive: boolean) {
    try {
      const result = await api<{ vendors: Vendor[] }>(`/api/vendors/${id}`, { method: 'PATCH', body: JSON.stringify({ isActive }) })
      onSaved(result.vendors, isActive ? 'เปิดใช้ vendor แล้ว' : 'ปิดใช้งาน vendor แล้ว')
      return true
    } catch (error) {
      onError(error instanceof Error ? error.message : 'อัปเดต vendor ไม่สำเร็จ')
      return false
    }
  }

  async function remove(id: string) {
    try {
      const result = await api<{ vendors: Vendor[] }>(`/api/vendors/${id}`, { method: 'DELETE' })
      onSaved(result.vendors, 'ลบ vendor แล้ว')
      if (editingId === id) reset()
      return true
    } catch (error) {
      onError(error instanceof Error ? error.message : 'ลบ vendor ไม่สำเร็จ')
      return false
    }
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_440px]">
      <Card className="overflow-hidden">
        <div className="flex items-center gap-2 border-b border-[#e1eaeb] bg-[#fbfdfd] px-4 py-3">
          <Building2 className="size-4 text-[#0b7f76]" />
          <div>
            <h2 className="font-bold">Vendor master</h2>
            <p className="text-xs text-[#81979c]">ทะเบียนคู่ค้า · ใช้เป็น master data ก่อนเปิดรับเข้าใหม่</p>
          </div>
        </div>
        <div className="p-4">
          <ManagedList
            noun="Vendor"
            onToggle={toggle}
            onEdit={(id) => {
              const vendor = vendors.find((item) => item.id === id)
              if (vendor) edit(vendor)
            }}
            onDelete={remove}
            items={vendors.map((vendor) => ({
              id: vendor.id,
              label: vendor.code,
              sublabel: `${vendor.name}${vendor.itemCount ? ` · ${vendor.itemCount} item` : ''}`,
              isActive: vendor.isActive,
            }))}
          />
          {!vendors.length ? <p className="py-8 text-center text-sm text-[#81979c]">ยังไม่มี vendor</p> : null}
        </div>
        <div className="border-t border-[#e5eeee] bg-[#fbfdfd] p-4">
          <h3 className="text-sm font-bold text-[#315763]">รายการ supplier เดิมที่รอตรวจทาน</h3>
          <p className="mt-1 text-xs leading-5 text-[#81979c]">ระบบไม่แปลงข้อความ supplier เดิมเป็น vendor อัตโนมัติ ผู้ดูแลต้องสร้างและยืนยันเอง</p>
          <div className="mt-3 space-y-2">
            {supplierCandidates.map((candidate) => (
              <div key={candidate.supplier} className="rounded-md border border-[#e3ebec] bg-white px-3 py-2 text-xs">
                <p className="font-semibold text-[#315763]">{candidate.supplier}</p>
                <p className="mt-0.5 text-[#81979c]">{candidate.itemCount} item · {candidate.itemCodes.join(', ')}</p>
              </div>
            ))}
            {!supplierCandidates.length ? <p className="text-xs text-[#81979c]">ไม่พบ supplier text เดิม</p> : null}
          </div>
        </div>
      </Card>

      <Card className="p-4">
        <form onSubmit={save} className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-bold text-[#173d50]">{editingVendor ? 'แก้ไข vendor' : 'เพิ่ม vendor'}</h2>
              <p className="mt-1 text-xs text-[#81979c]">รหัสจะถูกทำเป็นตัวพิมพ์ใหญ่และต้องไม่ซ้ำ</p>
            </div>
            {editingVendor ? <Button type="button" variant="ghost" className="px-2 py-1 text-xs" onClick={reset}><X className="size-3.5" /> ยกเลิก</Button> : null}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Vendor code"><Input required value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value })} /></Field>
            <Field label="ชื่อ vendor"><Input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Tax ID"><Input value={form.taxId} onChange={(event) => setForm({ ...form, taxId: event.target.value })} /></Field>
            <Field label="ผู้ติดต่อ"><Input value={form.contactPerson} onChange={(event) => setForm({ ...form, contactPerson: event.target.value })} /></Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="โทรศัพท์"><Input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></Field>
            <Field label="อีเมล"><Input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></Field>
          </div>
          <Field label="ที่อยู่"><Textarea rows={3} value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} /></Field>
          <Field label="หมายเหตุ"><Textarea rows={3} value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} /></Field>
          {editingVendor ? <Notice tone="info">การปิดใช้งานจะเก็บประวัติไว้และกันไม่ให้เลือก vendor นี้ในงานรับเข้าใหม่</Notice> : null}
          <Button disabled={busy}><Plus className="size-4" />{busy ? 'กำลังบันทึก…' : editingVendor ? 'บันทึกแก้ไข' : 'เพิ่ม vendor'}</Button>
        </form>
      </Card>
    </div>
  )
}
