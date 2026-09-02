export interface LocalEquipmentIdentity {
  id: string
  portal_equipment_id: string | null
  code: string | null
  asset_number: string | null
  serial_number: string | null
  sync_state: string | null
  status: string | null
}

export interface PortalEquipmentIdentity {
  portal_equipment_id: string
  cbh_code?: string | null
  hospital_asset_no?: string | null
  serial_number?: string | null
}

export interface EquipmentMatchIssue {
  issue_type: 'ambiguous_match' | 'identity_conflict'
  reason: string
  candidate_local_ids: string[]
}

export interface EquipmentMatchResult {
  localEquipmentId: string | null
  matchedBy: 'portal_equipment_id' | 'code' | 'asset_number' | 'serial_number' | null
  issue: EquipmentMatchIssue | null
}

function identityKey(value: unknown) {
  const normalized = String(value ?? '').trim().replace(/\s+/g, ' ')
  if (!normalized || ['-', '--', '—', '–', 'n/a', 'na', 'null'].includes(normalized.toLowerCase())) return ''
  return normalized.toLocaleLowerCase('en-US')
}

/**
 * Match only deterministic identities. A duplicate or conflicting identity is
 * deliberately returned as an issue; this function never uses fuzzy matching.
 */
export function matchPortalEquipment(
  portal: PortalEquipmentIdentity,
  locals: readonly LocalEquipmentIdentity[],
): EquipmentMatchResult {
  const identityFields = [
    { key: 'code' as const, value: portal.cbh_code, label: 'Code' },
    { key: 'asset_number' as const, value: portal.hospital_asset_no, label: 'Asset No.' },
    { key: 'serial_number' as const, value: portal.serial_number, label: 'Serial Number' },
  ]

  // LAB code is the business identity entered by the Stock-BM user. Check it
  // before Portal's UUID so an item is linked by the visible code users know.
  const codeKey = identityKey(portal.cbh_code)
  if (codeKey) {
    const codeMatches = locals.filter((local) => identityKey(local.code) === codeKey)
    if (codeMatches.length > 1) {
      return {
        localEquipmentId: null,
        matchedBy: null,
        issue: {
          issue_type: 'ambiguous_match',
          reason: 'LAB Code ตรงกับข้อมูล Stock-BM มากกว่าหนึ่งรายการ',
          candidate_local_ids: codeMatches.map((local) => local.id),
        },
      }
    }
    if (codeMatches.length === 1) {
      const candidate = codeMatches[0]
      if (candidate.portal_equipment_id && candidate.portal_equipment_id !== portal.portal_equipment_id) {
        return {
          localEquipmentId: null,
          matchedBy: null,
          issue: {
            issue_type: 'identity_conflict',
            reason: 'LAB Code นี้ผูกกับ Portal item อื่นอยู่แล้ว',
            candidate_local_ids: [candidate.id],
          },
        }
      }
      return { localEquipmentId: candidate.id, matchedBy: 'code', issue: null }
    }
  }

  // A previously linked row can still be found if an administrator changes
  // the LAB code in Portal. This is only a fallback; new links always use LAB
  // code first.
  const portalIdMatches = locals.filter((local) => local.portal_equipment_id === portal.portal_equipment_id)
  if (portalIdMatches.length > 1) {
    return {
      localEquipmentId: null,
      matchedBy: null,
      issue: {
        issue_type: 'ambiguous_match',
        reason: 'Portal equipment id ตรงกับข้อมูล Stock-BM มากกว่าหนึ่งรายการ',
        candidate_local_ids: portalIdMatches.map((local) => local.id),
      },
    }
  }
  if (portalIdMatches.length === 1) {
    return { localEquipmentId: portalIdMatches[0].id, matchedBy: 'portal_equipment_id', issue: null }
  }

  const matches: { field: (typeof identityFields)[number]['key']; ids: string[]; label: string }[] = []
  for (const field of identityFields) {
    if (field.key === 'code') continue
    const key = identityKey(field.value)
    if (!key) continue
    const ids = locals
      .filter((local) => identityKey(local[field.key]) === key)
      .map((local) => local.id)
    if (ids.length) matches.push({ field: field.key, ids, label: field.label })
  }

  const ambiguous = matches.find((match) => match.ids.length > 1)
  if (ambiguous) {
    return {
      localEquipmentId: null,
      matchedBy: null,
      issue: {
        issue_type: 'ambiguous_match',
        reason: `${ambiguous.label} ตรงกับข้อมูล Stock-BM มากกว่าหนึ่งรายการ`,
        candidate_local_ids: [...new Set(matches.flatMap((match) => match.ids))],
      },
    }
  }

  const candidateIds = [...new Set(matches.flatMap((match) => match.ids))]
  if (candidateIds.length > 1) {
    return {
      localEquipmentId: null,
      matchedBy: null,
      issue: {
        issue_type: 'identity_conflict',
        reason: 'Code, Asset No. หรือ Serial Number ตรงกับคนละเครื่องใน Stock-BM',
        candidate_local_ids: candidateIds,
      },
    }
  }
  if (candidateIds.length === 1) {
    const candidate = locals.find((local) => local.id === candidateIds[0])
    if (candidate?.portal_equipment_id && candidate.portal_equipment_id !== portal.portal_equipment_id) {
      return {
        localEquipmentId: null,
        matchedBy: null,
        issue: {
          issue_type: 'identity_conflict',
          reason: 'ข้อมูลระบุตัวตนตรงกับเครื่องที่ผูก Portal item อื่นอยู่แล้ว',
          candidate_local_ids: [candidate.id],
        },
      }
    }
    const matchedBy = matches.find((match) => match.ids[0] === candidateIds[0])?.field ?? null
    return { localEquipmentId: candidateIds[0], matchedBy, issue: null }
  }

  // A genuinely new Portal row is safe to create because its Portal UUID is
  // the authoritative identity. Legacy Stock-BM rows are handled separately
  // as unmatched_local issues by the sync operation builder.
  return { localEquipmentId: null, matchedBy: null, issue: null }
}

export interface EquipmentSyncOperation<T extends PortalEquipmentIdentity> {
  portal: T
  local_equipment_id: string | null
  issue?: EquipmentMatchIssue
}

export function buildSyncOperations<T extends PortalEquipmentIdentity>(
  snapshot: readonly T[],
  locals: readonly LocalEquipmentIdentity[],
) {
  const operations: EquipmentSyncOperation<T>[] = snapshot.map((portal) => {
    const match = matchPortalEquipment(portal, locals)
    return {
      portal,
      local_equipment_id: match.issue ? null : match.localEquipmentId,
      ...(match.issue ? { issue: match.issue } : {}),
    }
  })

  // Do not let two Portal items claim one local row when legacy identifiers are
  // duplicated. Both entries become review issues until an admin decides.
  const localClaims = new Map<string, number[]>()
  operations.forEach((operation, index) => {
    if (!operation.local_equipment_id) return
    const list = localClaims.get(operation.local_equipment_id) ?? []
    list.push(index)
    localClaims.set(operation.local_equipment_id, list)
  })
  for (const [localId, indexes] of localClaims) {
    if (indexes.length < 2) continue
    for (const index of indexes) {
      operations[index] = {
        portal: operations[index].portal,
        local_equipment_id: null,
        issue: {
          issue_type: 'identity_conflict',
          reason: 'Portal Snapshot มากกว่าหนึ่งรายการอ้างถึงเครื่องมือ Stock-BM เดียวกัน',
          candidate_local_ids: [localId],
        },
      }
    }
  }

  const claimedLocalIds = new Set(
    operations
      .map((operation) => operation.local_equipment_id)
      .filter((id): id is string => Boolean(id)),
  )
  const issueCandidateLocalIds = new Set(
    operations.flatMap((operation) => operation.issue?.candidate_local_ids ?? []),
  )
  const unmatchedLocalIds = locals
    .filter(
      (local) =>
        !local.portal_equipment_id &&
        local.sync_state !== 'archived' &&
        !claimedLocalIds.has(local.id) &&
        !issueCandidateLocalIds.has(local.id),
    )
    .map((local) => local.id)
  return { operations, unmatchedLocalIds }
}
