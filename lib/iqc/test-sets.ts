export function parseTestSets(value: string | null | undefined): string[] {
  return [...new Set((value ?? '').split(/[|,;\n]/).map((item) => item.trim()).filter(Boolean))]
}

export function hasTestSet(value: string | null | undefined, testSet: string) {
  return parseTestSets(value).includes(testSet)
}

export function normalizeTestSets(value: string | null | undefined) {
  const values = parseTestSets(value)
  return values.length ? values.join(' | ') : null
}
