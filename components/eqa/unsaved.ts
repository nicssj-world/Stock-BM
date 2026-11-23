'use client'

import { useEffect } from 'react'

// Forms on the EQA page that hold edits not yet saved register here, so the
// page can warn before a tab switch (which unmounts them) or leaving the page
// would throw those edits away.
const dirty = new Set<string>()

function onBeforeUnload(event: BeforeUnloadEvent) {
  if (!dirty.size) return
  event.preventDefault()
  event.returnValue = ''
}

/** Marks `key` as holding unsaved edits while `isDirty` is true. */
export function useUnsavedChanges(key: string, isDirty: boolean) {
  useEffect(() => {
    if (!isDirty) return
    dirty.add(key)
    if (dirty.size === 1) window.addEventListener('beforeunload', onBeforeUnload)
    return () => {
      dirty.delete(key)
      if (!dirty.size) window.removeEventListener('beforeunload', onBeforeUnload)
    }
  }, [key, isDirty])
}

/** True when it is fine to move on: nothing unsaved, or the user agreed to discard it. */
export function confirmDiscardUnsaved() {
  return !dirty.size || window.confirm(`มีข้อมูลที่ยังไม่บันทึก ${dirty.size} ส่วน\nถ้าออกจากหน้านี้ ข้อมูลที่แก้ไว้จะหายไป ต้องการออกต่อไหม?`)
}
