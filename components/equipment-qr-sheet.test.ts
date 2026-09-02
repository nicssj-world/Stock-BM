import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const sheet = readFileSync(join(process.cwd(), "components/equipment-qr-sheet.tsx"), "utf8")

describe("equipment QR sheet", () => {
  it("prints separate technician and Routine Maintenance QR destinations", () => {
    expect(sheet).toContain("QR ช่าง")
    expect(sheet).toContain("QR Routine")
    expect(sheet).toContain("${origin}/service/equipment/${item.qrToken}")
    expect(sheet).toContain("${origin}/equipment/routine/${item.qrToken}")
    expect(sheet).toContain('flex w-full max-w-[220px] flex-col gap-4')
  })
})
