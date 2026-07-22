import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter(l => l.includes('='))
    .map(l => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim().replace(/^﻿/, ''), l.slice(i + 1).trim()]
    })
)

const admin = createClient(env.NEXT_PUBLIC_BM_SUPABASE_URL, env.BM_SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })

const { data: lot, error: lotErr } = await admin.from('iqc_control_lots').select('*').eq('lot_number', 'BM0526L').maybeSingle()
if (lotErr) throw lotErr
console.log('LOT:', JSON.stringify(lot, null, 2))

const { data: specs, error: specErr } = await admin.from('iqc_control_specs').select('*').eq('control_lot_id', lot.id)
if (specErr) throw specErr
console.log('SPECS COUNT:', specs.length)
for (const s of specs) {
  console.log(JSON.stringify(s))
}

const { data: analytes } = await admin.from('iqc_analytes').select('id,code,name').in('id', specs.map(s => s.analyte_id))
console.log('ANALYTES:', JSON.stringify(analytes, null, 2))

const { data: results, error: resErr } = await admin.from('iqc_result_values').select('analyte_id,is_voided,status,stat_value').eq('control_lot_id', lot.id)
if (resErr) throw resErr
const byAnalyte = {}
for (const r of results) {
  byAnalyte[r.analyte_id] = byAnalyte[r.analyte_id] || { total: 0, usable: 0, voided: 0, rejected: 0 }
  byAnalyte[r.analyte_id].total++
  if (r.is_voided) byAnalyte[r.analyte_id].voided++
  else if (r.status === 'rejected') byAnalyte[r.analyte_id].rejected++
  else if (r.stat_value != null) byAnalyte[r.analyte_id].usable++
}
console.log('RESULTS BY ANALYTE:', JSON.stringify(byAnalyte, null, 2))
