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

const { data, error } = await admin
  .from('bm_audit_logs')
  .select('*')
  .ilike('action', 'iqc%')
  .order('created_at', { ascending: false })
  .limit(30)
if (error) throw error
console.log('IQC AUDIT ENTRIES:', data.length)
for (const row of data) console.log(row.created_at, row.action, row.entity_type, row.entity_id)

// total audit count
const { count } = await admin.from('bm_audit_logs').select('id', { count: 'exact', head: true })
console.log('TOTAL AUDIT ROWS:', count)
