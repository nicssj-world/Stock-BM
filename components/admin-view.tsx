'use client'

import { useEffect, useState } from 'react'
import { KeyRound, MapPin, PackagePlus, Pencil, Plus, Tags, Trash2, UserCog, X } from 'lucide-react'
import type { AdminUserRow, BmActor, StockCategory, StockItem, StockLocation, StockWorkspace } from '@/lib/bm/types'
import { api, Button, Card, Field, Input, Loading, Notice, PageHeader, Select } from '@/components/ui'

type Tab = 'items' | 'categories' | 'locations' | 'users'

export function AdminView({ actor, initialData }: { actor: BmActor; initialData: StockWorkspace }) {
  const [tab, setTab] = useState<Tab>('items')
  const [data, setData] = useState(initialData)
  const [users, setUsers] = useState<AdminUserRow[] | null>(null)
  const [notice, setNotice] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null)

  useEffect(() => {
    if (tab === 'users' && !users) refreshUsers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

  async function refreshUsers() {
    const result = await api<{ users: AdminUserRow[] }>('/api/admin/users')
    setUsers(result.users)
  }

  function onStock(stock: StockWorkspace, text: string) {
    setData(stock)
    setNotice({ tone: 'success', text })
  }

  return (
    <div className="mx-auto max-w-[1500px] space-y-5">
      <PageHeader eyebrow="Administration" title="Admin" description={`Molecular-CBH QMS Admin · ${actor.displayName}`} />
      {notice ? <Notice tone={notice.tone}>{notice.text}</Notice> : null}
      <div className="flex flex-wrap gap-2">
        {(['items', 'categories', 'locations', 'users'] as Tab[]).map((item) => <Button key={item} variant={tab === item ? 'primary' : 'secondary'} onClick={() => setTab(item)}>{item}</Button>)}
      </div>
      {tab === 'items' ? <ItemsAdmin data={data} onSaved={onStock} onError={(text) => setNotice({ tone: 'danger', text })} /> : null}
      {tab === 'categories' ? <CategoriesAdmin categories={data.categories} onSaved={onStock} onError={(text) => setNotice({ tone: 'danger', text })} /> : null}
      {tab === 'locations' ? <LocationsAdmin locations={data.locations} onSaved={onStock} onError={(text) => setNotice({ tone: 'danger', text })} /> : null}
      {tab === 'users' ? <UsersAdmin actorId={actor.id} users={users} refreshUsers={refreshUsers} onError={(text) => setNotice({ tone: 'danger', text })} onSuccess={(text) => setNotice({ tone: 'success', text })} /> : null}
    </div>
  )
}

function ItemsAdmin({ data, onSaved, onError }: { data: StockWorkspace; onSaved: (stock: StockWorkspace, text: string) => void; onError: (text: string) => void }) {
  const emptyForm = {
    itemCode: '',
    name: '',
    categoryId: data.categories.find((category) => category.isActive)?.id ?? '',
    unit: '',
    minimumStock: '0',
    expiryWarningDays: '90',
    defaultIssueQty: '',
    storageCondition: '',
    supplier: '',
    catalogNo: '',
    manufacturer: '',
    manufacturerBarcode: '',
    trackLot: true,
    trackExpiry: true,
    isHpv: false,
  }
  const [form, setForm] = useState(emptyForm)
  const [editingItemId, setEditingItemId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const editingItem = data.items.find((item) => item.id === editingItemId) ?? null
  const categoryOptions = data.categories.filter((category) => category.isActive || category.id === form.categoryId)

  function resetForm() {
    setEditingItemId(null)
    setForm({
      ...emptyForm,
      categoryId: data.categories.find((category) => category.isActive)?.id ?? '',
    })
  }

  function edit(item: StockItem) {
    setEditingItemId(item.id)
    setForm({
      itemCode: item.itemCode,
      name: item.name,
      categoryId: item.categoryId,
      unit: item.unit,
      minimumStock: String(item.minimumStock),
      expiryWarningDays: String(item.expiryWarningDays),
      defaultIssueQty: item.defaultIssueQty == null ? '' : String(item.defaultIssueQty),
      storageCondition: item.storageCondition ?? '',
      supplier: item.supplier ?? '',
      catalogNo: item.catalogNo ?? '',
      manufacturer: item.manufacturer ?? '',
      manufacturerBarcode: item.manufacturerBarcode ?? '',
      trackLot: item.trackLot,
      trackExpiry: item.trackExpiry,
      isHpv: item.isHpv,
    })
  }

  async function save(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    try {
      const payload = { ...form, minimumStock: Number(form.minimumStock), expiryWarningDays: Number(form.expiryWarningDays), defaultIssueQty: form.defaultIssueQty === '' ? null : Number(form.defaultIssueQty) }
      const result = await api<{ stock: StockWorkspace }>(editingItemId ? `/api/admin/items/${editingItemId}` : '/api/admin/items', {
        method: editingItemId ? 'PATCH' : 'POST',
        body: JSON.stringify(payload),
      })
      onSaved(result.stock, editingItemId ? 'อัปเดต item แล้ว / Item updated' : 'เพิ่ม item แล้ว / Item created')
      resetForm()
    } catch (error) {
      onError(error instanceof Error ? error.message : 'บันทึกไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  async function toggle(item: StockItem) {
    try {
      const result = await api<{ stock: StockWorkspace }>(`/api/admin/items/${item.id}`, { method: 'PATCH', body: JSON.stringify({ isActive: !item.isActive }) })
      onSaved(result.stock, 'อัปเดต item แล้ว / Item updated')
    } catch (error) {
      onError(error instanceof Error ? error.message : 'อัปเดตไม่สำเร็จ')
    }
  }

  async function remove(item: StockItem) {
    if (!window.confirm(`ลบ item "${item.name}" ใช่ไหม?\n\nถ้ามี lot หรือ transaction อยู่จะลบไม่ได้`)) return
    try {
      const result = await api<{ stock: StockWorkspace }>(`/api/admin/items/${item.id}`, { method: 'DELETE' })
      onSaved(result.stock, 'ลบ item แล้ว')
      if (editingItemId === item.id) resetForm()
    } catch (error) {
      onError(error instanceof Error ? error.message : 'ลบไม่สำเร็จ')
    }
  }

  return <div className="grid gap-4 xl:grid-cols-[1fr_430px]">
    <Card className="overflow-hidden">
      <div className="flex items-center gap-2 border-b border-[#e1eaeb] bg-[#fbfdfd] px-4 py-3"><PackagePlus className="size-4 text-[#0b7f76]" /><h2 className="font-bold">Items</h2></div>
      <div className="max-h-[650px] divide-y divide-[#edf2f2] overflow-y-auto">
        {data.items.map((item) => <div key={item.id} className={`flex items-center justify-between gap-3 px-4 py-3 ${editingItemId === item.id ? 'bg-[#eef9f7]' : ''}`}>
          <div className="min-w-0">
            <p className="mono text-xs font-bold text-[#315763]">{item.itemCode}</p>
            <p className="mt-0.5 truncate font-semibold text-[#58727b]">{item.name}</p>
            <p className="mt-0.5 text-[10px] text-[#91a3a7]">{item.categoryName} · {item.unit} · min {item.minimumStock}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <Button type="button" variant="ghost" className="px-2 py-1 text-xs" onClick={() => edit(item)}><Pencil className="size-3.5" /> Edit</Button>
            <button onClick={() => toggle(item)} className={`rounded border px-2 py-1 text-[10px] font-bold ${item.isActive ? 'border-[#c7e0c8] bg-[#f0f8f1] text-[#518058]' : 'border-[#e0d7d8] bg-[#f7f4f4] text-[#8d7b7d]'}`}>{item.isActive ? 'ACTIVE' : 'INACTIVE'}</button>
            <Button type="button" variant="ghost" className="px-2 py-1 text-xs text-red-500 hover:text-red-700" onClick={() => remove(item)}><Trash2 className="size-3.5" /></Button>
          </div>
        </div>)}
        {!data.items.length ? <p className="px-4 py-10 text-center text-sm text-[#91a4a9]">No items</p> : null}
      </div>
    </Card>
    <Card className="p-4">
      <form onSubmit={save} className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-bold text-[#173d50]">{editingItem ? 'แก้ไข item / Edit item' : 'เพิ่ม item / Add item'}</h2>
            {editingItem ? <p className="mono mt-1 text-xs text-[#789097]">{editingItem.itemCode}</p> : null}
          </div>
          {editingItem ? <Button type="button" variant="ghost" className="px-2 py-1 text-xs" onClick={resetForm}><X className="size-3.5" /> Cancel</Button> : null}
        </div>
        <div className="grid gap-3 sm:grid-cols-2"><Field label="Item code"><Input required value={form.itemCode} onChange={(event) => setForm({ ...form, itemCode: event.target.value })} /></Field><Field label="Unit"><Input required value={form.unit} onChange={(event) => setForm({ ...form, unit: event.target.value })} /></Field></div>
        <Field label="ชื่อ / Name"><Input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></Field>
        <Field label="Category"><Select required value={form.categoryId} onChange={(event) => setForm({ ...form, categoryId: event.target.value })}>{categoryOptions.map((category) => <option key={category.id} value={category.id}>{category.name}{category.isActive ? '' : ' (inactive)'}</option>)}</Select></Field>
        <div className="grid gap-3 sm:grid-cols-2"><Field label="Minimum"><Input required type="number" min="0" step="0.001" value={form.minimumStock} onChange={(event) => setForm({ ...form, minimumStock: event.target.value })} /></Field><Field label="Expiry warning days"><Input required type="number" min="0" value={form.expiryWarningDays} onChange={(event) => setForm({ ...form, expiryWarningDays: event.target.value })} /></Field></div>
        <Field label="Default issue qty (ตัด stock prefill)"><Input type="number" min="0.001" step="0.001" value={form.defaultIssueQty} onChange={(event) => setForm({ ...form, defaultIssueQty: event.target.value })} placeholder="เว้นว่าง = ไม่ตั้ง · consumable เช่น 1" /></Field>
        <div className="grid gap-3 sm:grid-cols-2"><Field label="Storage condition"><Input value={form.storageCondition} onChange={(event) => setForm({ ...form, storageCondition: event.target.value })} /></Field><Field label="Supplier"><Input value={form.supplier} onChange={(event) => setForm({ ...form, supplier: event.target.value })} /></Field></div>
        <div className="grid gap-3 sm:grid-cols-2"><Field label="Catalog no"><Input value={form.catalogNo} onChange={(event) => setForm({ ...form, catalogNo: event.target.value })} /></Field><Field label="Manufacturer"><Input value={form.manufacturer} onChange={(event) => setForm({ ...form, manufacturer: event.target.value })} /></Field></div>
        <Field label="Manufacturer barcode"><Input value={form.manufacturerBarcode} onChange={(event) => setForm({ ...form, manufacturerBarcode: event.target.value })} /></Field>
        <label className="flex items-center gap-2 text-xs font-semibold text-[#58747d]"><input type="checkbox" checked={form.trackLot} onChange={(event) => setForm({ ...form, trackLot: event.target.checked, trackExpiry: event.target.checked ? form.trackExpiry : false })} /> Track lot</label>
        <label className="flex items-center gap-2 text-xs font-semibold text-[#58747d]"><input type="checkbox" disabled={!form.trackLot} checked={form.trackExpiry} onChange={(event) => setForm({ ...form, trackExpiry: event.target.checked })} /> Track expiry</label>
        <label className="flex items-center gap-2 text-xs font-semibold text-[#58747d]"><input type="checkbox" checked={form.isHpv} onChange={(event) => setForm({ ...form, isHpv: event.target.checked })} /> HPV Management item</label>
        {editingItem ? <Notice tone="info">ถ้า item นี้มี transaction แล้ว ระบบอาจไม่อนุญาตให้เปลี่ยน Lot/Expiry tracking เพื่อป้องกัน ledger เพี้ยน</Notice> : null}
        <Button disabled={busy || !categoryOptions.length}>{editingItem ? <Pencil className="size-4" /> : <Plus className="size-4" />}{editingItem ? 'บันทึกแก้ไข / Save edit' : 'เพิ่ม / Add'}</Button>
      </form>
    </Card>
  </div>
}

function CategoriesAdmin({ categories, onSaved, onError }: { categories: StockCategory[]; onSaved: (stock: StockWorkspace, text: string) => void; onError: (text: string) => void }) {
  const [name, setName] = useState('')
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null)
  const editingCategory = categories.find((category) => category.id === editingCategoryId) ?? null

  function resetForm() {
    setEditingCategoryId(null)
    setName('')
  }

  function edit(category: StockCategory) {
    setEditingCategoryId(category.id)
    setName(category.name)
  }

  async function save(event: React.FormEvent) {
    event.preventDefault()
    try {
      const result = await api<{ stock: StockWorkspace }>(editingCategoryId ? `/api/admin/categories/${editingCategoryId}` : '/api/admin/categories', {
        method: editingCategoryId ? 'PATCH' : 'POST',
        body: JSON.stringify({ name }),
      })
      onSaved(result.stock, editingCategoryId ? 'อัปเดต category แล้ว' : 'เพิ่ม category แล้ว')
      resetForm()
    } catch (error) {
      onError(error instanceof Error ? error.message : 'บันทึกไม่สำเร็จ')
    }
  }

  async function toggle(category: StockCategory) {
    try {
      const result = await api<{ stock: StockWorkspace }>(`/api/admin/categories/${category.id}`, { method: 'PATCH', body: JSON.stringify({ isActive: !category.isActive }) })
      onSaved(result.stock, 'อัปเดต category แล้ว')
    } catch (error) {
      onError(error instanceof Error ? error.message : 'อัปเดตไม่สำเร็จ')
    }
  }

  async function remove(category: StockCategory) {
    if (!window.confirm(`ลบ category "${category.name}" ใช่ไหม?\n\nถ้ามี item ที่ใช้ category นี้อยู่จะลบไม่ได้`)) return
    try {
      const result = await api<{ stock: StockWorkspace }>(`/api/admin/categories/${category.id}`, { method: 'DELETE' })
      onSaved(result.stock, 'ลบ category แล้ว')
      if (editingCategoryId === category.id) resetForm()
    } catch (error) {
      onError(error instanceof Error ? error.message : 'ลบไม่สำเร็จ')
    }
  }

  return <MasterList icon={<Tags />} title="Categories" selectedId={editingCategoryId} items={categories.map((item) => ({ id: item.id, title: item.name, active: item.isActive, onEdit: () => edit(item), onToggle: () => toggle(item), onDelete: () => remove(item) }))}>
    <form onSubmit={save} className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
      <Input required value={name} onChange={(event) => setName(event.target.value)} placeholder="Reagent, Consumable" />
      {editingCategory ? <Button type="button" variant="ghost" onClick={resetForm}><X className="size-4" /> Cancel</Button> : null}
      <Button><Plus className="size-4" /> {editingCategory ? 'Save edit' : 'Add'}</Button>
    </form>
  </MasterList>
}

function LocationsAdmin({ locations, onSaved, onError }: { locations: StockLocation[]; onSaved: (stock: StockWorkspace, text: string) => void; onError: (text: string) => void }) {
  const emptyForm = { code: '', name: '', storageCondition: '' }
  const [form, setForm] = useState(emptyForm)
  const [editingLocationId, setEditingLocationId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const editingLocation = locations.find((location) => location.id === editingLocationId) ?? null

  function resetForm() {
    setEditingLocationId(null)
    setForm(emptyForm)
  }

  function edit(location: StockLocation) {
    setEditingLocationId(location.id)
    setForm({
      code: location.code,
      name: location.name,
      storageCondition: location.storageCondition ?? '',
    })
  }

  async function save(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    try {
      const result = await api<{ stock: StockWorkspace }>(editingLocationId ? `/api/admin/locations/${editingLocationId}` : '/api/admin/locations', {
        method: editingLocationId ? 'PATCH' : 'POST',
        body: JSON.stringify(form),
      })
      onSaved(result.stock, editingLocationId ? 'อัปเดต location แล้ว' : 'เพิ่ม location แล้ว')
      resetForm()
    } catch (error) {
      onError(error instanceof Error ? error.message : 'บันทึกไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }

  async function toggle(location: StockLocation) {
    try {
      const result = await api<{ stock: StockWorkspace }>(`/api/admin/locations/${location.id}`, { method: 'PATCH', body: JSON.stringify({ isActive: !location.isActive }) })
      onSaved(result.stock, 'อัปเดต location แล้ว')
    } catch (error) {
      onError(error instanceof Error ? error.message : 'อัปเดตไม่สำเร็จ')
    }
  }

  async function remove(location: StockLocation) {
    if (!window.confirm(`ลบ location "${location.code} · ${location.name}" ใช่ไหม?\n\nถ้ามี stock transaction ที่อ้างถึง location นี้อยู่จะลบไม่ได้`)) return
    try {
      const result = await api<{ stock: StockWorkspace }>(`/api/admin/locations/${location.id}`, { method: 'DELETE' })
      onSaved(result.stock, 'ลบ location แล้ว')
      if (editingLocationId === location.id) resetForm()
    } catch (error) {
      onError(error instanceof Error ? error.message : 'ลบไม่สำเร็จ')
    }
  }

  return <MasterList icon={<MapPin />} title="Locations" selectedId={editingLocationId} items={locations.map((item) => ({ id: item.id, title: `${item.code} · ${item.name}`, meta: item.storageCondition ?? '', active: item.isActive, onEdit: () => edit(item), onToggle: () => toggle(item), onDelete: () => remove(item) }))}>
    <form onSubmit={save} className="grid gap-2 sm:grid-cols-[140px_1fr_1fr_auto_auto]">
      <Input required value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value })} placeholder="4C-A" />
      <Input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="ตู้เย็น 4C ชั้น A" />
      <Input value={form.storageCondition} onChange={(event) => setForm({ ...form, storageCondition: event.target.value })} placeholder="2-8C" />
      {editingLocation ? <Button type="button" variant="ghost" onClick={resetForm} disabled={busy}><X className="size-4" /> Cancel</Button> : null}
      <Button disabled={busy}><Plus className="size-4" /> {editingLocation ? 'Save edit' : 'Add'}</Button>
    </form>
  </MasterList>
}

function MasterList({ icon, title, items, children, selectedId }: { icon: React.ReactNode; title: string; selectedId?: string | null; items: { id: string; title: string; meta?: string; active: boolean; onEdit?: () => void; onToggle: () => void; onDelete?: () => void }[]; children: React.ReactNode }) {
  return <Card className="overflow-hidden">
    <div className="flex items-center gap-2 border-b border-[#e1eaeb] bg-[#fbfdfd] px-4 py-3"><span className="text-[#0b7f76] [&>svg]:size-4">{icon}</span><h2 className="font-bold">{title}</h2></div>
    <div className="p-4">{children}</div>
    <div className="divide-y divide-[#edf2f2]">{items.map((item) => <div key={item.id} className={`flex items-center justify-between gap-3 px-4 py-3 ${selectedId === item.id ? 'bg-[#eef9f7]' : ''}`}>
      <div className="min-w-0">
        <p className="truncate font-semibold text-[#315763]">{item.title}</p>
        {item.meta ? <p className="truncate text-xs text-[#81979c]">{item.meta}</p> : null}
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {item.onEdit ? <Button type="button" variant="ghost" className="px-2 py-1 text-xs" onClick={item.onEdit}><Pencil className="size-3.5" /> Edit</Button> : null}
        <button onClick={item.onToggle} className={`rounded border px-2 py-1 text-[10px] font-bold ${item.active ? 'border-[#c7e0c8] bg-[#f0f8f1] text-[#518058]' : 'border-[#e0d7d8] bg-[#f7f4f4] text-[#8d7b7d]'}`}>{item.active ? 'ACTIVE' : 'INACTIVE'}</button>
        {item.onDelete ? <Button type="button" variant="ghost" className="px-2 py-1 text-xs text-red-500 hover:text-red-700" onClick={item.onDelete}><Trash2 className="size-3.5" /></Button> : null}
      </div>
    </div>)}</div>
  </Card>
}

function UsersAdmin({ actorId, users, refreshUsers, onError, onSuccess }: { actorId: string; users: AdminUserRow[] | null; refreshUsers: () => Promise<void>; onError: (text: string) => void; onSuccess: (text: string) => void }) {
  const [form, setForm] = useState({ ephisId: '', displayName: '', password: '', stockRole: 'Staff', genomicRole: 'CBH-Staff' })
  const [busy, setBusy] = useState(false)
  async function create(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    try {
      await api('/api/admin/users', { method: 'POST', body: JSON.stringify(form) })
      await refreshUsers()
      setForm({ ephisId: '', displayName: '', password: '', stockRole: 'Staff', genomicRole: 'CBH-Staff' })
      onSuccess('เพิ่ม/ให้สิทธิ์ผู้ใช้แล้ว')
    } catch (error) {
      onError(error instanceof Error ? error.message : 'บันทึกไม่สำเร็จ')
    } finally {
      setBusy(false)
    }
  }
  async function patch(user: AdminUserRow, input: Partial<AdminUserRow>) {
    try {
      await api(`/api/admin/users/${user.id}`, { method: 'PATCH', body: JSON.stringify(input) })
      await refreshUsers()
      onSuccess('อัปเดตผู้ใช้แล้ว')
    } catch (error) {
      onError(error instanceof Error ? error.message : 'อัปเดตไม่สำเร็จ')
    }
  }
  async function reset(user: AdminUserRow) {
    const password = window.prompt(`New password for ${user.displayName}`)
    if (!password) return
    try {
      await api(`/api/admin/users/${user.id}/reset-password`, { method: 'POST', body: JSON.stringify({ password }) })
      onSuccess('Reset password แล้ว')
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Reset ไม่สำเร็จ')
    }
  }
  async function revoke(user: AdminUserRow) {
    if (!window.confirm(`ยกเลิกสิทธิ์ stock ของ "${user.displayName}" ใช่ไหม?\n\nผู้ใช้จะเข้าระบบ stock ไม่ได้อีกต่อไป`)) return
    try {
      await api(`/api/admin/users/${user.id}`, { method: 'DELETE' })
      await refreshUsers()
      onSuccess('ยกเลิกสิทธิ์ผู้ใช้แล้ว')
    } catch (error) {
      onError(error instanceof Error ? error.message : 'ยกเลิกไม่สำเร็จ')
    }
  }
  return <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
    <Card className="overflow-hidden">
      <div className="flex items-center gap-2 border-b border-[#e1eaeb] bg-[#fbfdfd] px-4 py-3"><UserCog className="size-4 text-[#0b7f76]" /><h2 className="font-bold">Users</h2></div>
      {!users ? <div className="p-6"><Loading /></div> : <div className="overflow-x-auto"><table className="w-full min-w-[780px] text-left text-sm"><thead className="bg-[#f7fafa] text-[10px] tracking-[0.08em] text-[#779097] uppercase"><tr><th className="px-4 py-2.5">User</th><th className="px-3 py-2.5">E-Phis</th><th className="px-3 py-2.5">Stock role</th><th className="px-3 py-2.5">Stock</th><th className="px-4 py-2.5"></th></tr></thead><tbody className="divide-y divide-[#edf2f2]">{users.map((user) => <tr key={user.id}><td className="px-4 py-3"><p className="font-bold text-[#45636e]">{user.displayName}</p><p className="text-[10px] text-[#8ba0a5]">{user.genomicRole}{user.id === actorId ? ' · current account' : ''}</p></td><td className="mono px-3 py-3 text-xs text-[#668088]">{user.ephisId}</td><td className="px-3 py-3"><Select className="w-auto py-1 text-xs" value={user.stockRole ?? 'Staff'} onChange={(event) => patch(user, { stockRole: event.target.value as AdminUserRow['stockRole'], stockActive: true })}><option>Staff</option><option>Admin</option></Select></td><td className="px-3 py-3"><button disabled={user.id === actorId} onClick={() => patch(user, { stockActive: !user.stockActive })} className={`rounded border px-2 py-1 text-[10px] font-bold ${user.stockActive ? 'border-[#c7e0c8] bg-[#f0f8f1] text-[#518058]' : 'border-[#e0d7d8] bg-[#f7f4f4] text-[#8d7b7d]'}`}>{user.stockActive ? 'ACTIVE' : 'INACTIVE'}</button></td><td className="px-4 py-3 text-right"><div className="flex items-center justify-end gap-1"><Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => reset(user)}><KeyRound className="size-3.5" /> Reset</Button><Button disabled={user.id === actorId} variant="ghost" className="px-2 py-1 text-xs text-red-500 hover:text-red-700 disabled:opacity-30" onClick={() => revoke(user)}><Trash2 className="size-3.5" /></Button></div></td></tr>)}</tbody></table></div>}
    </Card>
    <Card className="p-4">
      <form onSubmit={create} className="space-y-3">
        <h2 className="font-bold text-[#173d50]">เพิ่ม/ให้สิทธิ์ผู้ใช้</h2>
        <Field label="E-Phis"><Input required inputMode="numeric" value={form.ephisId} onChange={(event) => setForm({ ...form, ephisId: event.target.value })} /></Field>
        <Field label="ชื่อที่แสดง"><Input required value={form.displayName} onChange={(event) => setForm({ ...form, displayName: event.target.value })} /></Field>
        <Field label="Initial password"><Input required type="password" minLength={8} value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} /></Field>
        <div className="grid gap-3 sm:grid-cols-2"><Field label="Stock role"><Select value={form.stockRole} onChange={(event) => setForm({ ...form, stockRole: event.target.value })}><option>Staff</option><option>Admin</option></Select></Field><Field label="Genomic role"><Select value={form.genomicRole} onChange={(event) => setForm({ ...form, genomicRole: event.target.value })}><option>CBH-Staff</option><option>Admin</option></Select></Field></div>
        <Button disabled={busy}><Plus className="size-4" /> Save user</Button>
      </form>
    </Card>
  </div>
}
