export type CropPoint = { x: number; y: number }

export type CropCorners = {
  topLeft: CropPoint
  topRight: CropPoint
  bottomRight: CropPoint
  bottomLeft: CropPoint
}

export type ImageSize = { width: number; height: number }

export type PerspectiveTransform = {
  a: number
  b: number
  c: number
  d: number
  e: number
  f: number
  g: number
  h: number
}

export type PerspectiveValidation = { ok: true } | { ok: false; reason: string }

export type RectifiedImage = {
  dataUrl: string
  width: number
  height: number
}

const DEFAULT_CORNERS: CropCorners = {
  topLeft: { x: 0.04, y: 0.04 },
  topRight: { x: 0.96, y: 0.04 },
  bottomRight: { x: 0.96, y: 0.96 },
  bottomLeft: { x: 0.04, y: 0.96 },
}

function cloneCorners(corners: CropCorners): CropCorners {
  return {
    topLeft: { ...corners.topLeft },
    topRight: { ...corners.topRight },
    bottomRight: { ...corners.bottomRight },
    bottomLeft: { ...corners.bottomLeft },
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function clamp01(value: number) {
  return clamp(value, 0, 1)
}

function finitePoint(point: CropPoint) {
  return Number.isFinite(point.x) && Number.isFinite(point.y)
}

function cornersPoints(corners: CropCorners): CropPoint[] {
  return [corners.topLeft, corners.topRight, corners.bottomRight, corners.bottomLeft]
}

function polygonArea(points: CropPoint[]) {
  return Math.abs(points.reduce((area, point, index) => {
    const next = points[(index + 1) % points.length]
    return area + point.x * next.y - next.x * point.y
  }, 0) / 2)
}

function cross(a: CropPoint, b: CropPoint, c: CropPoint) {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
}

export function orderCorners(points: CropPoint[]): CropCorners | null {
  if (points.length !== 4 || points.some((point) => !finitePoint(point))) return null
  const sum = (point: CropPoint) => point.x + point.y
  const difference = (point: CropPoint) => point.x - point.y
  const topLeft = points.reduce((best, point) => sum(point) < sum(best) ? point : best)
  const bottomRight = points.reduce((best, point) => sum(point) > sum(best) ? point : best)
  const topRight = points.reduce((best, point) => difference(point) > difference(best) ? point : best)
  const bottomLeft = points.reduce((best, point) => difference(point) < difference(best) ? point : best)
  const selected = [topLeft, topRight, bottomRight, bottomLeft]
  if (new Set(selected.map((point) => `${point.x}:${point.y}`)).size !== 4) return null
  return {
    topLeft: { ...topLeft },
    topRight: { ...topRight },
    bottomRight: { ...bottomRight },
    bottomLeft: { ...bottomLeft },
  }
}

export function validatePerspectiveInput(corners: CropCorners, imageSize: ImageSize): PerspectiveValidation {
  if (!Number.isFinite(imageSize.width) || !Number.isFinite(imageSize.height) || imageSize.width <= 0 || imageSize.height <= 0) {
    return { ok: false, reason: 'Image dimensions must be positive' }
  }
  const points = cornersPoints(corners)
  if (points.some((point) => !finitePoint(point) || point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1)) {
    return { ok: false, reason: 'Crop corners must be normalized image coordinates' }
  }
  if (new Set(points.map((point) => `${point.x}:${point.y}`)).size !== 4) return { ok: false, reason: 'Crop corners must be distinct' }
  if (polygonArea(points) < 0.005) return { ok: false, reason: 'Crop quadrilateral is too small' }
  const crosses = points.map((point, index) => cross(point, points[(index + 1) % 4], points[(index + 2) % 4]))
  const allPositive = crosses.every((value) => value > 0)
  const allNegative = crosses.every((value) => value < 0)
  if (!allPositive && !allNegative) return { ok: false, reason: 'Crop corners must form a convex quadrilateral' }
  return { ok: true }
}

export function resetCropCorners(autoCorners: CropCorners | null): CropCorners {
  return autoCorners && validatePerspectiveInput(autoCorners, { width: 1, height: 1 }).ok ? cloneCorners(autoCorners) : cloneCorners(DEFAULT_CORNERS)
}

export function displayToImagePoint(point: CropPoint, displaySize: ImageSize, imageSize: ImageSize): CropPoint {
  if (displaySize.width <= 0 || displaySize.height <= 0) return { x: 0, y: 0 }
  return {
    x: clamp(point.x, 0, displaySize.width) / displaySize.width * imageSize.width,
    y: clamp(point.y, 0, displaySize.height) / displaySize.height * imageSize.height,
  }
}

export function imageToDisplayPoint(point: CropPoint, imageSize: ImageSize, displaySize: ImageSize): CropPoint {
  if (imageSize.width <= 0 || imageSize.height <= 0) return { x: 0, y: 0 }
  return {
    x: clamp(point.x, 0, imageSize.width) / imageSize.width * displaySize.width,
    y: clamp(point.y, 0, imageSize.height) / imageSize.height * displaySize.height,
  }
}

export function orientedImageSize(imageSize: ImageSize, orientation: number): ImageSize {
  return orientation >= 5 && orientation <= 8
    ? { width: imageSize.height, height: imageSize.width }
    : { width: imageSize.width, height: imageSize.height }
}

export function normalizeExifPoint(point: CropPoint, orientation: number): CropPoint {
  switch (orientation) {
    case 2: return { x: 1 - point.x, y: point.y }
    case 3: return { x: 1 - point.x, y: 1 - point.y }
    case 4: return { x: point.x, y: 1 - point.y }
    case 5: return { x: point.y, y: point.x }
    case 6: return { x: 1 - point.y, y: point.x }
    case 7: return { x: 1 - point.y, y: 1 - point.x }
    case 8: return { x: point.y, y: 1 - point.x }
    default: return { ...point }
  }
}

function distance(a: CropPoint, b: CropPoint) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

export function rectifiedImageSize(corners: CropCorners, imageSize: ImageSize): ImageSize {
  const points = cornersPoints(corners).map((point) => ({ x: point.x * imageSize.width, y: point.y * imageSize.height }))
  return {
    width: Math.max(1, Math.round(Math.max(distance(points[0], points[1]), distance(points[3], points[2])))),
    height: Math.max(1, Math.round(Math.max(distance(points[0], points[3]), distance(points[1], points[2])))),
  }
}

function solveLinearSystem(matrix: number[][], values: number[]): number[] | null {
  const augmented = matrix.map((row, index) => [...row, values[index]])
  for (let column = 0; column < 8; column += 1) {
    let pivot = column
    for (let row = column + 1; row < 8; row += 1) {
      if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivot][column])) pivot = row
    }
    if (Math.abs(augmented[pivot][column]) < 1e-10) return null
    ;[augmented[column], augmented[pivot]] = [augmented[pivot], augmented[column]]
    const divisor = augmented[column][column]
    for (let item = column; item <= 8; item += 1) augmented[column][item] /= divisor
    for (let row = 0; row < 8; row += 1) {
      if (row === column) continue
      const factor = augmented[row][column]
      for (let item = column; item <= 8; item += 1) augmented[row][item] -= factor * augmented[column][item]
    }
  }
  return augmented.map((row) => row[8])
}

export function buildPerspectiveTransform(corners: CropCorners, imageSize: ImageSize, outputSize?: ImageSize): PerspectiveTransform | null {
  if (!validatePerspectiveInput(corners, imageSize).ok) return null
  const destination = outputSize ?? rectifiedImageSize(corners, imageSize)
  if (!Number.isFinite(destination.width) || !Number.isFinite(destination.height) || destination.width <= 0 || destination.height <= 0) return null
  const sourcePoints = cornersPoints(corners).map((point) => ({ x: point.x * imageSize.width, y: point.y * imageSize.height }))
  const destinationPoints = [
    { x: 0, y: 0 },
    { x: destination.width - 1, y: 0 },
    { x: destination.width - 1, y: destination.height - 1 },
    { x: 0, y: destination.height - 1 },
  ]
  const matrix: number[][] = []
  const values: number[] = []
  destinationPoints.forEach((point, index) => {
    const source = sourcePoints[index]
    matrix.push([point.x, point.y, 1, 0, 0, 0, -source.x * point.x, -source.x * point.y])
    values.push(source.x)
    matrix.push([0, 0, 0, point.x, point.y, 1, -source.y * point.x, -source.y * point.y])
    values.push(source.y)
  })
  const solved = solveLinearSystem(matrix, values)
  if (!solved) return null
  return { a: solved[0], b: solved[1], c: solved[2], d: solved[3], e: solved[4], f: solved[5], g: solved[6], h: solved[7] }
}

export function applyPerspectiveTransform(transform: PerspectiveTransform, point: CropPoint): CropPoint | null {
  const denominator = transform.g * point.x + transform.h * point.y + 1
  if (Math.abs(denominator) < 1e-10) return null
  return {
    x: (transform.a * point.x + transform.b * point.y + transform.c) / denominator,
    y: (transform.d * point.x + transform.e * point.y + transform.f) / denominator,
  }
}

function sourceSize(source: CanvasImageSource): ImageSize {
  const candidate = source as unknown as { naturalWidth?: number; naturalHeight?: number; videoWidth?: number; videoHeight?: number; width?: number; height?: number }
  return {
    width: candidate.naturalWidth || candidate.videoWidth || candidate.width || 0,
    height: candidate.naturalHeight || candidate.videoHeight || candidate.height || 0,
  }
}

export function rectifyPerspectiveImage(source: CanvasImageSource, corners: CropCorners, options: { maxOutputEdge?: number } = {}): RectifiedImage {
  if (typeof document === 'undefined') throw new Error('Perspective correction requires a browser canvas')
  const inputSize = sourceSize(source)
  const validation = validatePerspectiveInput(corners, inputSize)
  if (!validation.ok) throw new Error(validation.reason)
  const baseOutput = rectifiedImageSize(corners, inputSize)
  const maxOutputEdge = options.maxOutputEdge ?? 3200
  const scale = Math.min(1, maxOutputEdge / Math.max(baseOutput.width, baseOutput.height))
  const outputSize = { width: Math.max(1, Math.round(baseOutput.width * scale)), height: Math.max(1, Math.round(baseOutput.height * scale)) }
  const transform = buildPerspectiveTransform(corners, inputSize, outputSize)
  if (!transform) throw new Error('Unable to build perspective transform')

  const inputCanvas = document.createElement('canvas')
  inputCanvas.width = inputSize.width
  inputCanvas.height = inputSize.height
  const inputContext = inputCanvas.getContext('2d', { willReadFrequently: true })
  if (!inputContext) throw new Error('Unable to create image canvas')
  inputContext.drawImage(source, 0, 0, inputSize.width, inputSize.height)
  const input = inputContext.getImageData(0, 0, inputSize.width, inputSize.height)

  const outputCanvas = document.createElement('canvas')
  outputCanvas.width = outputSize.width
  outputCanvas.height = outputSize.height
  const outputContext = outputCanvas.getContext('2d')
  if (!outputContext) throw new Error('Unable to create output canvas')
  const output = outputContext.createImageData(outputSize.width, outputSize.height)
  for (let y = 0; y < outputSize.height; y += 1) {
    for (let x = 0; x < outputSize.width; x += 1) {
      const destination = applyPerspectiveTransform(transform, { x, y })
      const outputOffset = (y * outputSize.width + x) * 4
      if (!destination || destination.x < 0 || destination.y < 0 || destination.x >= inputSize.width - 1 || destination.y >= inputSize.height - 1) {
        output.data[outputOffset] = 255
        output.data[outputOffset + 1] = 255
        output.data[outputOffset + 2] = 255
        output.data[outputOffset + 3] = 255
        continue
      }
      const x0 = Math.floor(destination.x)
      const y0 = Math.floor(destination.y)
      const x1 = Math.min(inputSize.width - 1, x0 + 1)
      const y1 = Math.min(inputSize.height - 1, y0 + 1)
      const xWeight = destination.x - x0
      const yWeight = destination.y - y0
      const topLeft = (y0 * inputSize.width + x0) * 4
      const topRight = (y0 * inputSize.width + x1) * 4
      const bottomLeft = (y1 * inputSize.width + x0) * 4
      const bottomRight = (y1 * inputSize.width + x1) * 4
      for (let channel = 0; channel < 4; channel += 1) {
        const top = input.data[topLeft + channel] * (1 - xWeight) + input.data[topRight + channel] * xWeight
        const bottom = input.data[bottomLeft + channel] * (1 - xWeight) + input.data[bottomRight + channel] * xWeight
        output.data[outputOffset + channel] = top * (1 - yWeight) + bottom * yWeight
      }
    }
  }
  outputContext.putImageData(output, 0, 0)
  return { dataUrl: outputCanvas.toDataURL('image/jpeg', 0.92), width: outputSize.width, height: outputSize.height }
}

function median(values: number[]) {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

function grayscale(data: Uint8ClampedArray | Uint8Array, width: number, height: number) {
  const result = new Float32Array(width * height)
  for (let index = 0; index < result.length; index += 1) {
    const offset = index * 4
    result[index] = data[offset] * 0.299 + data[offset + 1] * 0.587 + data[offset + 2] * 0.114
  }
  return result
}

export function detectDocumentCornersFromRgba(data: Uint8ClampedArray | Uint8Array, width: number, height: number): CropCorners | null {
  if (width < 16 || height < 16 || data.length < width * height * 4) return null
  const gray = grayscale(data, width, height)
  const borderSize = Math.max(1, Math.floor(Math.min(width, height) * 0.05))
  const border: number[] = []
  const center: number[] = []
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const value = gray[y * width + x]
      if (x < borderSize || y < borderSize || x >= width - borderSize || y >= height - borderSize) border.push(value)
      if (x >= width * 0.25 && x <= width * 0.75 && y >= height * 0.25 && y <= height * 0.75) center.push(value)
    }
  }
  const borderMedian = median(border)
  const centerMedian = median(center)
  if (Math.abs(centerMedian - borderMedian) < 18) return null
  const brightPage = centerMedian > borderMedian
  const threshold = borderMedian + (centerMedian - borderMedian) * 0.45
  const matches = (value: number) => brightPage ? value >= threshold : value <= threshold
  let seed = -1
  let seedDistance = Number.POSITIVE_INFINITY
  for (let y = Math.floor(height * 0.2); y <= Math.ceil(height * 0.8); y += 1) {
    for (let x = Math.floor(width * 0.2); x <= Math.ceil(width * 0.8); x += 1) {
      const index = y * width + x
      const distanceFromCenterTone = Math.abs(gray[index] - centerMedian)
      if (matches(gray[index]) && distanceFromCenterTone < seedDistance) {
        seed = index
        seedDistance = distanceFromCenterTone
      }
    }
  }
  if (seed < 0) return null
  const visited = new Uint8Array(width * height)
  const queue = [seed]
  let queueIndex = 0
  visited[seed] = 1
  const component: CropPoint[] = []
  while (queueIndex < queue.length) {
    const index = queue[queueIndex++]
    const x = index % width
    const y = Math.floor(index / width)
    component.push({ x, y })
    for (const next of [index - 1, index + 1, index - width, index + width]) {
      if (next < 0 || next >= width * height || visited[next]) continue
      const nextX = next % width
      if (Math.abs(nextX - x) > 1 || !matches(gray[next])) continue
      visited[next] = 1
      queue.push(next)
    }
  }
  const areaRatio = component.length / (width * height)
  if (areaRatio < 0.04 || areaRatio > 0.97) return null
  const minX = Math.min(...component.map((point) => point.x))
  const maxX = Math.max(...component.map((point) => point.x))
  const minY = Math.min(...component.map((point) => point.y))
  const maxY = Math.max(...component.map((point) => point.y))
  if (maxX - minX < width * 0.25 || maxY - minY < height * 0.25) return null
  const extrema = [
    component.reduce((best, point) => point.x + point.y < best.x + best.y ? point : best),
    component.reduce((best, point) => point.x - point.y > best.x - best.y ? point : best),
    component.reduce((best, point) => point.x + point.y > best.x + best.y ? point : best),
    component.reduce((best, point) => point.x - point.y < best.x - best.y ? point : best),
  ]
  const ordered = orderCorners(extrema)
  if (!ordered) return null
  const normalized: CropCorners = {
    topLeft: { x: clamp01(ordered.topLeft.x / Math.max(1, width - 1)), y: clamp01(ordered.topLeft.y / Math.max(1, height - 1)) },
    topRight: { x: clamp01(ordered.topRight.x / Math.max(1, width - 1)), y: clamp01(ordered.topRight.y / Math.max(1, height - 1)) },
    bottomRight: { x: clamp01(ordered.bottomRight.x / Math.max(1, width - 1)), y: clamp01(ordered.bottomRight.y / Math.max(1, height - 1)) },
    bottomLeft: { x: clamp01(ordered.bottomLeft.x / Math.max(1, width - 1)), y: clamp01(ordered.bottomLeft.y / Math.max(1, height - 1)) },
  }
  return validatePerspectiveInput(normalized, { width: 1, height: 1 }).ok ? normalized : null
}

export function detectDocumentCorners(source: CanvasImageSource): CropCorners | null {
  if (typeof document === 'undefined') return null
  const size = sourceSize(source)
  if (!size.width || !size.height) return null
  const scale = Math.min(1, 320 / Math.max(size.width, size.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(16, Math.round(size.width * scale))
  canvas.height = Math.max(16, Math.round(size.height * scale))
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) return null
  context.drawImage(source, 0, 0, canvas.width, canvas.height)
  const image = context.getImageData(0, 0, canvas.width, canvas.height)
  return detectDocumentCornersFromRgba(image.data, image.width, image.height)
}
