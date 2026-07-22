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

const controlLotId = 'dde57918-83be-4ec7-a407-758011a0a2d7'
const analytes = {
  '%CD3': 'bf6958ac-d033-4684-a756-3244a329ab18',
  '%CD4': 'bae6081b-974c-40f4-bf67-1ea564b75276',
  'AbsCD3': '53dc5478-2ddc-4787-b2a2-79fac3a913e1',
  'AbsCD4': 'b03b375b-7b77-4479-8360-fa334bd9126e',
}

function mean(values) {
  if (!values.length) return 0
  return values.reduce((sum, v) => sum + v, 0) / values.length
}
function sd(values) {
  if (values.length < 2) return 0
  const m = mean(values)
  const variance = values.reduce((sum, v) => sum + (v - m) ** 2, 0) / (values.length - 1)
  return Math.sqrt(variance)
}

for (const [code, analyteId] of Object.entries(analytes)) {
  const { data, error } = await admin
    .from('iqc_result_values')
    .select('id,stat_value,is_voided,status')
    .eq('control_lot_id', controlLotId)
    .eq('analyte_id', analyteId)
  if (error) throw error
  const usable = data
    .filter(row => !Boolean(row.is_voided) && String(row.status) !== 'rejected' && row.stat_value != null)
    .map(row => Number(row.stat_value))
  const m = mean(usable)
  const s = sd(usable)
  console.log(code, 'n=', usable.length, 'mean=', m, 'sd=', s, 'anyNaN=', usable.some(v => Number.isNaN(v)), 'rawValues=', JSON.stringify(usable))
}
