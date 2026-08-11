import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

function findMigration() {
  return readdirSync(join(process.cwd(), 'supabase/migrations')).find((name) => name.endsWith('_hiv_lab_alert.sql'))
}

function findManualPositionMigration() {
  return readdirSync(join(process.cwd(), 'supabase/migrations')).find((name) => name.endsWith('_hiv_lab_alert_manual_position.sql'))
}

describe('HIV LAB Alert migration', () => {
  it('creates a protected alert table linked to HIV DRT samples', () => {
    const migrationName = findMigration()
    expect(migrationName).toBeTruthy()
    if (!migrationName) return
    const sql = readFileSync(join(process.cwd(), 'supabase/migrations', migrationName), 'utf8')
    expect(sql).toContain('create table public.bm_hiv_lab_alerts')
    expect(sql).toContain('hiv_drt_sample_id uuid not null unique references public.bm_hiv_drt_samples(id)')
    expect(sql).toContain('patient_name_masked text not null')
    expect(sql).not.toContain('patient_name_raw')
    expect(sql).not.toContain('dob ')
    expect(sql).not.toContain('vl_copies')
  })

  it('locks the selected rack and creates the alert and storage sample atomically', () => {
    const migrationName = findMigration()
    expect(migrationName).toBeTruthy()
    if (!migrationName) return
    const sql = readFileSync(join(process.cwd(), 'supabase/migrations', migrationName), 'utf8')
    expect(sql).toContain('create or replace function public.create_hiv_lab_alert')
    expect(sql).toContain('rack_position integer')
    expect(sql).not.toContain('\n  position integer')
    expect(sql).toContain('for update')
    expect(sql).toContain("status = 'stored'")
    expect(sql).toContain('insert into public.bm_hiv_lab_alerts')
    expect(sql).toContain('revoke all on function public.create_hiv_lab_alert')
    expect(sql).toContain('grant execute on function public.create_hiv_lab_alert')
    expect(sql).toContain('create or replace function public.delete_hiv_lab_alert')
    expect(sql).toContain('line_sent_at is null')
  })
})

describe('HIV LAB Alert migration discovery', () => {
  it('will not silently skip the migration file', () => {
    expect(existsSync(join(process.cwd(), 'supabase/migrations'))).toBe(true)
  })

  it('replaces auto-fill RPC with an optional locked manual position', () => {
    const migrationName = findManualPositionMigration()
    expect(migrationName).toBeTruthy()
    if (!migrationName) return
    const sql = readFileSync(join(process.cwd(), 'supabase/migrations', migrationName), 'utf8')
    expect(sql).toContain('drop function if exists public.create_hiv_lab_alert(text, text, text, uuid, uuid)')
    expect(sql).toContain('p_position integer default null')
    expect(sql).toContain('for update')
    expect(sql).toContain('Requested HIV DRT position must be between 1 and 96')
    expect(sql).toContain('Requested HIV DRT position is already occupied')
    expect(sql).toContain('No auto-fill position is available in the selected HIV DRT Rack')
    expect(sql).toContain('greatest(coalesce(v_rack.next_position, 1), v_position + 1)')
    expect(sql).toContain('grant execute on function public.create_hiv_lab_alert(text, text, text, uuid, uuid, integer) to service_role')
  })
})
