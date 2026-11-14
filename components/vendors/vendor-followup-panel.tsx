'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { api, Button, Field, Input, Notice, Select, Textarea } from '@/components/ui'
import type { AnnualRevision } from '@/lib/vendors/evaluation'
import type { VendorAnnualFollowup, VendorFollowupOwner } from '@/lib/server/vendor-evaluation'

type Form = { status:VendorAnnualFollowup['status']; responsibleUserId:string; dueDate:string; actionPlan:string; resolutionNote:string }
const fromFollowup = (f:VendorAnnualFollowup):Form => ({
  status:f.status, responsibleUserId:f.responsibleUserId??'',dueDate:f.dueDate??'',
  actionPlan:f.actionPlan??'',resolutionNote:f.resolutionNote??'',
})
const statusLabel:Record<string,string> = {open:'รอมอบหมาย',in_progress:'กำลังแก้ไข',closed:'ปิดงานแล้ว'}
export function VendorFollowupPanel({followups,owners,revisions,vendorId,canManage}:{
  followups:VendorAnnualFollowup[];owners:VendorFollowupOwner[];revisions:AnnualRevision[];
  vendorId:string;canManage:boolean
}) {
  const router=useRouter()
  const [editing,setEditing]=useState<string|null>(null)
  const [form,setForm]=useState<Form|null>(null)
  const [error,setError]=useState<string|null>(null)
  const [message,setMessage]=useState<string|null>(null)
  const [pending,startTransition]=useTransition()
  const patch=(next:Partial<Form>)=>setForm((prev)=>prev?{...prev,...next}:prev)
  const revisionMap=new Map(revisions.map((r)=>[r.id,r]))
  const sorted=[...followups].sort((a,b)=>Number(a.status==='closed')-Number(b.status==='closed') || b.createdAt.localeCompare(a.createdAt))
  function submit(f:VendorAnnualFollowup) {
    if(!form)return
    if(form.status!=='open'&&(!form.responsibleUserId||!form.dueDate||!form.actionPlan.trim())){
      setError('กรุณาเลือกผู้รับผิดชอบ วันครบกำหนด และระบุแผนแก้ไข');return
    }
    if(form.status==='closed'&&!form.resolutionNote.trim()){
      setError('กรุณาบันทึกผลการแก้ไขก่อนปิดงาน');return
    }
    setError(null);setMessage(null)
    startTransition(async()=>{
      try{
        await api('/api/vendors/'+vendorId+'/followups/'+f.id,{method:'PATCH',body:JSON.stringify({
          status:form.status,responsibleUserId:form.responsibleUserId||null,
          dueDate:form.dueDate||null,actionPlan:form.actionPlan,resolutionNote:form.resolutionNote,
          expectedUpdatedAt:f.updatedAt,
        })})
        setEditing(null);setForm(null);setMessage('บันทึกการติดตามผลแล้ว');router.refresh()
      }catch(e){setError(e instanceof Error?e.message:'บันทึกไม่สำเร็จ')}
    })
  }
  return <div className="space-y-3">
    {!followups.length&&<p className="text-sm text-[#81979c]">ไม่มีรายงานที่ประเมินไม่ผ่าน</p>}
    {sorted.map((f)=>{
      const rev=revisionMap.get(f.revisionId)
      const active=editing===f.id
      const owner=owners.find((u)=>u.id===f.responsibleUserId)
      const overdue=f.status!=='closed'&&!!f.dueDate&&f.dueDate<new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())
      return <div key={f.id} className="space-y-3 rounded-lg border border-[#d9e4e6] bg-white p-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div><Link href={'/vendors/'+vendorId+'/evaluations/'+f.revisionId} className="font-semibold text-[#0b7f76] underline">{rev?.reportNumber??'รายงานประเมิน'} · ปีงบประมาณ {f.fiscalYear}</Link>
            <p className="mt-1 text-sm text-[#58747d]">สถานะ: {statusLabel[f.status]}{overdue?' · เกินกำหนด':''} · ผู้รับผิดชอบ {owner?.name??(f.responsibleUserId?'ตามรหัสที่บันทึกไว้':'ยังไม่กำหนด')}</p>
            <p className="text-xs text-[#81979c]">ครบกำหนด: {f.dueDate??'ยังไม่กำหนด'}</p></div>
          {canManage&&<Button type="button" variant="secondary" disabled={pending} onClick={()=>{if(active){setEditing(null);setForm(null)}else{setEditing(f.id);setForm(fromFollowup(f))}setError(null)}}>{active?'ยกเลิก':'จัดการงานติดตาม'}</Button>}
        </div>
        {f.actionPlan&&!active&&<p className="whitespace-pre-wrap text-sm">แผนแก้ไข: {f.actionPlan}</p>}
        {f.resolutionNote&&!active&&<p className="whitespace-pre-wrap text-sm">ผลการแก้ไข: {f.resolutionNote}</p>}
        {active&&form&&<div className="space-y-3 border-t pt-3">
          <Field label="สถานะ"><Select value={form.status} onChange={(e)=>patch({status:e.target.value as Form['status']})}><option value="open">รอมอบหมาย</option><option value="in_progress">กำลังแก้ไข</option><option value="closed">ปิดงานแล้ว</option></Select></Field>
          <Field label="ผู้รับผิดชอบ"><Select value={form.responsibleUserId} onChange={(e)=>patch({responsibleUserId:e.target.value})}><option value="">เลือกผู้รับผิดชอบ</option>{owners.map(u=><option value={u.id} key={u.id}>{u.name}</option>)}</Select></Field>
          <Field label="วันครบกำหนด"><Input type="date" value={form.dueDate} onChange={(e)=>patch({dueDate:e.target.value})}/></Field>
          <Field label="แผนการแก้ไข"><Textarea rows={3} maxLength={4000} value={form.actionPlan} onChange={(e)=>patch({actionPlan:e.target.value})}/></Field>
          {form.status==='closed'&&<Field label="ผลการแก้ไข"><Textarea rows={3} maxLength={4000} value={form.resolutionNote} onChange={(e)=>patch({resolutionNote:e.target.value})}/></Field>}
          {error&&<Notice tone="danger">{error}</Notice>}
          <Button type="button" disabled={pending} onClick={()=>submit(f)}>{pending?'กำลังบันทึก…':'บันทึกงานติดตาม'}</Button>
        </div>}
      </div>
    })}
    {message&&<Notice tone="success">{message}</Notice>}
  </div>
}
