// GS1 payloads legitimately contain the ASCII 29 Group Separator (FNC1) as a
// literal control character. Strict JSON disallows unescaped control
// characters inside a string, which made a `.json` fixture file for this
// data fight its own content; a plain TS module has no such restriction — a
// literal control character inside a string literal is valid ECMAScript.
export const barcodeFixtures = {
  'gs1-128': {
    raw: ']C101095011015300131727123110LOT1233000012',
    symbologyId: ']C1',
    gtin: '09501101530013',
    lot: 'LOT123',
    expiry: '2027-12-31',
    quantity: 12,
  },
  'gs1-datamatrix': {
    raw: '(01)09501101530013(17)271231(10)LOT123',
    symbologyId: ']d2',
    gtin: '09501101530013',
    lot: 'LOT123',
    expiry: '2027-12-31',
  },
  'gs1-additional-ais': {
    raw: ']e00109501101530013112601011527010121SER1233103000123',
    symbologyId: ']e0',
    gtin: '09501101530013',
    manufactureDate: '2026-01-01',
    bestBeforeDate: '2027-01-01',
    serial: 'SER123',
    netWeightKg: 0.123,
  },
  'hibc-primary': {
    raw: '+A123BJC5D6E71G',
    hibcPrimary: 'A123BJC5D6E71',
  },
  'hibc-secondary': {
    raw: '+$$52001510X3GD',
    hibcSecondary: '$$52001510X3GD',
    lot: '10X3',
    expiry: '2020-01-15',
  },
  'hibc-combined': {
    raw: '+A123BJC5D6E71/$$52001510X3C',
    hibcPrimary: 'A123BJC5D6E71',
    hibcSecondary: '$$52001510X3C',
    lot: '10X3',
    expiry: '2020-01-15',
  },
  malformed: {
    raw: ']C1not-gs1',
    symbologyId: ']C1',
  },
  // A real iPhone/ZXing GS1 DataMatrix scan: the decoder always translates
  // the message's leading FNC1 codeword (a "this is GS1-formatted" flag, not
  // data) into a literal GS character, and the scanner gives us no
  // symbology identifier at all (see camera-scanner.ts). This is the exact
  // shape that used to defeat `looksLikeGs1`'s gating check.
  'gs1-datamatrix-real-scan': {
    raw: '01095011015300131727123110LOT123',
    symbologyId: null as string | null,
    gtin: '09501101530013',
    expiry: '2027-12-31',
    lot: 'LOT123',
  },
  // A variable-length AI (lot, AI 10) that is not the last field in the
  // stream, terminated by a mid-stream GS before a fixed-length AI (expiry)
  // and a trailing variable AI (serial) with no terminator needed.
  'gs1-datamatrix-real-scan-mid-stream-gs': {
    raw: '010950110153001310LOTX11727123121SER9',
    symbologyId: null as string | null,
    gtin: '09501101530013',
    lot: 'LOTX1',
    expiry: '2027-12-31',
    serial: 'SER9',
  },
} as const
