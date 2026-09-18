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
  // Real product label: Roche cobas TPUC3, REF 08058679190. AI order as
  // printed/scanned on this real label: (240) REF-style additional product
  // ID, (01) GTIN, (10) lot, plus (17) expiry and (11) manufacture date,
  // which the label also encodes. AI 240 here is NOT copied into `catalog`
  // — it only becomes a proposed `catalogCandidate`, and only because this
  // GTIN prefix is a known Roche cobas one (see
  // AI240_CATALOG_CANDIDATE_GTIN_PREFIXES in barcode.ts).
  'gs1-datamatrix-roche-cobas-tpuc3': {
    raw: '240' + '08058679190' + '' + '01' + '07613336121535' + '10' + '94146701' + '' + '17' + '270531' + '11' + '251229',
    symbologyId: ']d2',
    gtin: '07613336121535',
    lot: '94146701',
    expiry: '2027-05-31',
    manufactureDate: '2025-12-29',
    additionalProductId: '08058679190',
    catalogCandidateValue: '08058679190',
  },
  // Real product label (second reagent), given AI order (01)(17)(10)(240).
  // This GTIN prefix has no known AI-240-as-REF manufacturer mapping, so
  // AI 240 must surface only as `additionalProductId` — no catalogCandidate.
  'gs1-datamatrix-second-reagent': {
    raw: '01' + '00382903403837' + '17' + '270531' + '10' + '06696' + '' + '240' + '0933',
    symbologyId: ']d2',
    gtin: '00382903403837',
    lot: '06696',
    expiry: '2027-05-31',
    additionalProductId: '0933',
  },
  // Same fields as the second reagent fixture above, but with AI 240 first
  // and a different overall order — the parser must reach the same result
  // regardless of AI ordering.
  'gs1-datamatrix-second-reagent-reordered': {
    raw: '240' + '0933' + '' + '10' + '06696' + '' + '01' + '00382903403837' + '17' + '270531',
    symbologyId: ']d2',
    gtin: '00382903403837',
    lot: '06696',
    expiry: '2027-05-31',
    additionalProductId: '0933',
  },
  // Two variable-length AIs back to back (lot, then serial), each needing
  // its own GS terminator since neither is last in the stream.
  'gs1-datamatrix-multiple-variable-fields': {
    raw: '01' + '00382903403837' + '10' + '06696' + '' + '21' + 'SERABC1' + '' + '17' + '270531',
    symbologyId: ']d2',
    gtin: '00382903403837',
    lot: '06696',
    serial: 'SERABC1',
    expiry: '2027-05-31',
  },
  // ]d2 supplied only as out-of-band metadata (never as embedded text) with
  // NO leading GS in the decoded text at all — the payload begins directly
  // with a recognized AI. This is the "leading FNC1 is absent from decoded
  // text" / "]d2 comes from metadata only" case.
  'gs1-datamatrix-metadata-only-symbology': {
    raw: '01' + '00382903403837' + '17' + '270531' + '10' + '06696',
    symbologyId: ']d2',
    gtin: '00382903403837',
    expiry: '2027-05-31',
    lot: '06696',
  },
  // A payload that starts with an AI the parser does not know about, so the
  // diagnostic parser must fail safely and report a specific reason instead
  // of a silent empty result.
  'gs1-datamatrix-unrecognized-ai': {
    raw: '99UNKNOWNAI0109501101530013',
    symbologyId: ']d2' as string | null,
  },
} as const
