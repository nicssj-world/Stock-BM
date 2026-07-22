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

const { data, error } = await admin
  .from('bm_audit_logs')
  .select('*')
  .eq('entity_id', controlLotId)
  .order('created_at', { ascending: true })
if (error) throw error
console.log('MATCHES:', data.length)
for (const row of data) console.log(JSON.stringify(row))

// Also broad recent lock-ish actions today
const { data: recent, error: err2 } = await admin
  .from('bm_audit_logs')
  .select('*')
  .in('action', ['iqc.spec.lockLab','iqc.lot.lockAndClose','iqc.spec.unlockLab','iqc.spec.unlockLot'])
  .order('created_at', { ascending: false })
  .limit(20)
if (err2) throw err2
console.log('RECENT LOCK ACTIONS:', recent.length)
for (const row of recent) console.log(JSON.stringify(row))
