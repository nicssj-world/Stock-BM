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

export function clampCropPoint(point: CropPoint): CropPoint {
  return { x: clamp01(point.x), y: clamp01(point.y) }
}

export function applyCropDrag(pointer: CropPoint, offset: CropPoint): CropPoint {
  return clampCropPoint({ x: pointer.x + offset.x, y: pointer.y + offset.y })
}

export type CropDragState = {
  key: string | null
  pointerId: number | null
  offset: CropPoint | null
}

export function beginCropDrag(key: string, pointerId: number, current: CropPoint, pointer: CropPoint): CropDragState {
  return {
    key,
    pointerId,
    offset: { x: current.x - pointer.x, y: current.y - pointer.y },
  }
}

export function moveCropDrag(state: CropDragState, key: string, pointerId: number, pointer: CropPoint): CropPoint | null {
  if (state.key !== key || state.pointerId !== pointerId || !state.offset) return null
  return applyCropDrag(pointer, state.offset)
}

export function endCropDrag(state: CropDragState, key: string, pointerId: number): CropDragState {
  if (state.key !== key || state.pointerId !== pointerId) return state
  return { key: null, pointerId: null, offset: null }
}

export function calculateLoupeViewportPosition(
  pointer: CropPoint,
  viewport: ImageSize,
  loupeSize = 104,
  gap = 14,
  padding = 8,
) {
  const maxLeft = Math.max(padding, viewport.width - loupeSize - padding)
  const maxTop = Math.max(padding, viewport.height - loupeSize - padding)
  const left = clamp(pointer.x - loupeSize / 2, padding, maxLeft)
  const preferredTop = pointer.y - loupeSize - gap
  const top = clamp(preferredTop >= padding ? preferredTop : pointer.y + gap, padding, maxTop)
  return { left, top }
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

function percentile(values: number[], ratio: number) {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * ratio)))]
}

function grayscale(data: Uint8ClampedArray | Uint8Array, width: number, height: number) {
  const result = new Float32Array(width * height)
  for (let index = 0; index < result.length; index += 1) {
    const offset = index * 4
    result[index] = data[offset] * 0.299 + data[offset + 1] * 0.587 + data[offset + 2] * 0.114
  }
  return result
}

function normalizeContrast(gray: Float32Array) {
  const samples: number[] = []
  const stride = Math.max(1, Math.floor(gray.length / 20000))
  for (let index = 0; index < gray.length; index += stride) samples.push(gray[index])
  const low = percentile(samples, 0.05)
  const high = percentile(samples, 0.95)
  const range = Math.max(1, high - low)
  const normalized = new Float32Array(gray.length)
  for (let index = 0; index < gray.length; index += 1) normalized[index] = clamp((gray[index] - low) / range * 255, 0, 255)
  return normalized
}

function edgeMagnitude(gray: Float32Array, width: number, height: number) {
  const magnitude = new Float32Array(gray.length)
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const topLeft = gray[(y - 1) * width + x - 1]
      const top = gray[(y - 1) * width + x]
      const topRight = gray[(y - 1) * width + x + 1]
      const left = gray[y * width + x - 1]
      const right = gray[y * width + x + 1]
      const bottomLeft = gray[(y + 1) * width + x - 1]
      const bottom = gray[(y + 1) * width + x]
      const bottomRight = gray[(y + 1) * width + x + 1]
      const horizontal = -topLeft - 2 * left - bottomLeft + topRight + 2 * right + bottomRight
      const vertical = -topLeft - 2 * top - topRight + bottomLeft + 2 * bottom + bottomRight
      magnitude[y * width + x] = Math.hypot(horizontal, vertical)
    }
  }
  return magnitude
}

function blurGray(gray: Float32Array, width: number, height: number) {
  const blurred = new Float32Array(gray.length)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let sum = 0
      let weight = 0
      for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
        for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
          const sampleX = Math.min(width - 1, Math.max(0, x + offsetX))
          const sampleY = Math.min(height - 1, Math.max(0, y + offsetY))
          const sampleWeight = offsetX === 0 && offsetY === 0 ? 4 : Math.abs(offsetX) + Math.abs(offsetY) === 1 ? 2 : 1
          sum += gray[sampleY * width + sampleX] * sampleWeight
          weight += sampleWeight
        }
      }
      blurred[y * width + x] = sum / weight
    }
  }
  return blurred
}

function detectRegionCorners(gray: Float32Array, width: number, height: number): CropCorners | null {
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
  if (cornersPoints(normalized).some((point) => point.x <= 0.02 || point.x >= 0.98 || point.y <= 0.02 || point.y >= 0.98)) return null
  return validatePerspectiveInput(normalized, { width: 1, height: 1 }).ok ? normalized : null
}

function regionTouchesImageBoundary(gray: Float32Array, width: number, height: number) {
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
  if (Math.abs(centerMedian - borderMedian) < 18) return false
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
  if (seed < 0) return false
  const visited = new Uint8Array(width * height)
  const queue = [seed]
  let queueIndex = 0
  visited[seed] = 1
  while (queueIndex < queue.length) {
    const index = queue[queueIndex++]
    const x = index % width
    const y = Math.floor(index / width)
    if (x === 0 || y === 0 || x === width - 1 || y === height - 1) return true
    for (const next of [index - 1, index + 1, index - width, index + width]) {
      if (next < 0 || next >= width * height || visited[next]) continue
      const nextX = next % width
      if (Math.abs(nextX - x) > 1 || !matches(gray[next])) continue
      visited[next] = 1
      queue.push(next)
    }
  }
  return false
}

type HoughLine = { theta: number; rho: number; strength: number }

function houghLines(magnitude: Float32Array, width: number, height: number, threshold: number) {
  const thetaCount = 18
  const diagonal = Math.hypot(width, height)
  const rhoOffset = diagonal
  const rhoBins = Math.ceil(diagonal * 2) + 1
  const accumulator = new Float32Array(thetaCount * rhoBins)
  let edgeCount = 0
  for (let index = 0; index < magnitude.length; index += 1) if (magnitude[index] >= threshold) edgeCount += 1
  if (edgeCount < 20) return []
  const stride = Math.max(1, Math.ceil(edgeCount / 16000))
  let edgeIndex = 0
  let sampled = 0
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const value = magnitude[y * width + x]
      if (value < threshold) continue
      if (edgeIndex++ % stride !== 0) continue
      sampled += 1
      for (let thetaIndex = 0; thetaIndex < thetaCount; thetaIndex += 1) {
        const theta = thetaIndex * Math.PI / thetaCount
        const rho = Math.round(x * Math.cos(theta) + y * Math.sin(theta) + rhoOffset)
        if (rho >= 0 && rho < rhoBins) accumulator[thetaIndex * rhoBins + rho] += value
      }
    }
  }
  const lines: HoughLine[][] = Array.from({ length: thetaCount }, () => [])
  const rhoSeparation = Math.max(6, Math.min(width, height) * 0.035)
  for (let thetaIndex = 0; thetaIndex < thetaCount; thetaIndex += 1) {
    const peaks: { rho: number; strength: number }[] = []
    for (let rhoIndex = 1; rhoIndex < rhoBins - 1; rhoIndex += 1) {
      const strength = accumulator[thetaIndex * rhoBins + rhoIndex]
      if (strength <= accumulator[thetaIndex * rhoBins + rhoIndex - 1] || strength < accumulator[thetaIndex * rhoBins + rhoIndex + 1]) continue
      peaks.push({ rho: rhoIndex - rhoOffset, strength })
    }
    peaks.sort((a, b) => b.strength - a.strength)
    for (const peak of peaks) {
      if (lines[thetaIndex].some((line) => Math.abs(line.rho - peak.rho) < rhoSeparation)) continue
      lines[thetaIndex].push({ theta: thetaIndex * Math.PI / thetaCount, rho: peak.rho, strength: peak.strength / Math.max(1, sampled) })
      if (lines[thetaIndex].length >= 8) break
    }
  }
  return lines
}

function intersectLines(first: HoughLine, second: HoughLine): CropPoint | null {
  const firstCos = Math.cos(first.theta)
  const firstSin = Math.sin(first.theta)
  const secondCos = Math.cos(second.theta)
  const secondSin = Math.sin(second.theta)
  const determinant = firstCos * secondSin - firstSin * secondCos
  if (Math.abs(determinant) < 1e-5) return null
  return {
    x: (first.rho * secondSin - second.rho * firstSin) / determinant,
    y: (firstCos * second.rho - secondCos * first.rho) / determinant,
  }
}

function normalizedCandidate(points: CropPoint[], width: number, height: number) {
  if (points.some((point) => point.x < -width * 0.06 || point.x > width * 1.06 || point.y < -height * 0.06 || point.y > height * 1.06)) return null
  if (points.some((point) => point.x < width * 0.025 || point.x > width * 0.95 || point.y < height * 0.025 || point.y > height * 0.95)) return null
  const ordered = orderCorners(points)
  if (!ordered) return null
  const normalized: CropCorners = {
    topLeft: { x: clamp01(ordered.topLeft.x / Math.max(1, width - 1)), y: clamp01(ordered.topLeft.y / Math.max(1, height - 1)) },
    topRight: { x: clamp01(ordered.topRight.x / Math.max(1, width - 1)), y: clamp01(ordered.topRight.y / Math.max(1, height - 1)) },
    bottomRight: { x: clamp01(ordered.bottomRight.x / Math.max(1, width - 1)), y: clamp01(ordered.bottomRight.y / Math.max(1, height - 1)) },
    bottomLeft: { x: clamp01(ordered.bottomLeft.x / Math.max(1, width - 1)), y: clamp01(ordered.bottomLeft.y / Math.max(1, height - 1)) },
  }
  return validatePerspectiveInput(normalized, { width: 1, height: 1 }).ok ? normalized : null
}

function quadrilateralSurfaceScore(corners: CropCorners, gray: Float32Array, width: number, height: number) {
  const values: number[] = []
  for (let row = 1; row < 9; row += 1) {
    const v = row / 9
    for (let column = 1; column < 9; column += 1) {
      const u = column / 9
      const top = {
        x: corners.topLeft.x * (1 - u) + corners.topRight.x * u,
        y: corners.topLeft.y * (1 - u) + corners.topRight.y * u,
      }
      const bottom = {
        x: corners.bottomLeft.x * (1 - u) + corners.bottomRight.x * u,
        y: corners.bottomLeft.y * (1 - u) + corners.bottomRight.y * u,
      }
      const point = {
        x: clamp01(top.x * (1 - v) + bottom.x * v),
        y: clamp01(top.y * (1 - v) + bottom.y * v),
      }
      const x = Math.round(point.x * (width - 1))
      const y = Math.round(point.y * (height - 1))
      values.push(gray[y * width + x])
    }
  }
  if (!values.length) return 0
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length
  return clamp01(1 - Math.sqrt(variance) / 46)
}

function pixelEdgeSupport(corners: CropCorners, magnitude: Float32Array, width: number, height: number, threshold: number) {
  const points = cornersPoints(corners).map((point) => ({ x: point.x * (width - 1), y: point.y * (height - 1) }))
  let hits = 0
  let samples = 0
  for (let index = 0; index < points.length; index += 1) {
    const start = points[index]
    const end = points[(index + 1) % points.length]
    const length = Math.max(1, Math.hypot(end.x - start.x, end.y - start.y))
    const steps = Math.max(14, Math.round(length / 2))
    for (let step = 0; step <= steps; step += 1) {
      const t = step / steps
      const x = start.x + (end.x - start.x) * t
      const y = start.y + (end.y - start.y) * t
      let localMaximum = 0
      for (let offsetY = -2; offsetY <= 2; offsetY += 1) {
        for (let offsetX = -2; offsetX <= 2; offsetX += 1) {
          const sampleX = Math.round(x + offsetX)
          const sampleY = Math.round(y + offsetY)
          if (sampleX < 0 || sampleX >= width || sampleY < 0 || sampleY >= height) continue
          localMaximum = Math.max(localMaximum, magnitude[sampleY * width + sampleX])
        }
      }
      if (localMaximum >= threshold * 0.55) hits += 1
      samples += 1
    }
  }
  return samples ? hits / samples : 0
}

function candidateScore(corners: CropCorners, magnitude: Float32Array, width: number, height: number, threshold: number) {
  const points = cornersPoints(corners)
  const area = polygonArea(points)
  const edgeSupport = pixelEdgeSupport(corners, magnitude, width, height, threshold)
  const lengths = points.map((point, index) => {
    const next = points[(index + 1) % points.length]
    return Math.hypot((next.x - point.x) * width, (next.y - point.y) * height)
  })
  const rectangularity = points.reduce((sum, point, index) => {
    const previous = points[(index + points.length - 1) % points.length]
    const next = points[(index + 1) % points.length]
    const first = { x: previous.x - point.x, y: previous.y - point.y }
    const second = { x: next.x - point.x, y: next.y - point.y }
    const denominator = Math.max(1e-6, Math.hypot(first.x, first.y) * Math.hypot(second.x, second.y))
    return sum + 1 - Math.min(1, Math.abs((first.x * second.x + first.y * second.y) / denominator))
  }, 0) / points.length
  const aspect = Math.max(lengths[0], lengths[2], lengths[1], lengths[3]) / Math.max(1, Math.min(lengths[0], lengths[1], lengths[2], lengths[3]))
  const aspectScore = aspect > 6 ? 0 : Math.max(0, 1 - Math.abs(Math.log(aspect) - Math.log(1.5)) / 2.6)
  const margin = points.reduce((sum, point) => sum + Math.min(point.x, 1 - point.x, point.y, 1 - point.y), 0) / points.length
  const boundaryScore = Math.min(1, margin / 0.12)
  const areaScore = Math.min(1, area / 0.55)
  return edgeSupport * 0.48 + rectangularity * 0.2 + areaScore * 0.18 + aspectScore * 0.09 + boundaryScore * 0.05
}

function houghCandidates(gray: Float32Array, magnitude: Float32Array, width: number, height: number, threshold: number) {
  const thetaCount = 18
  const lines = houghLines(magnitude, width, height, threshold)
  const candidates: { corners: CropCorners; score: number }[] = []
  for (let firstIndex = 0; firstIndex < thetaCount; firstIndex += 1) {
    for (const delta of [8, 9, 10]) {
      const secondIndex = (firstIndex + delta) % thetaCount
      const firstLines = lines[firstIndex]
      const secondLines = lines[secondIndex]
      for (let firstA = 0; firstA < firstLines.length; firstA += 1) {
        for (let firstB = firstA + 1; firstB < firstLines.length; firstB += 1) {
          if (Math.abs(firstLines[firstA].rho - firstLines[firstB].rho) < Math.min(width, height) * 0.12) continue
          for (let secondA = 0; secondA < secondLines.length; secondA += 1) {
            for (let secondB = secondA + 1; secondB < secondLines.length; secondB += 1) {
              if (Math.abs(secondLines[secondA].rho - secondLines[secondB].rho) < Math.min(width, height) * 0.12) continue
              const topLeft = intersectLines(firstLines[firstA], secondLines[secondA])
              const topRight = intersectLines(firstLines[firstB], secondLines[secondA])
              const bottomRight = intersectLines(firstLines[firstB], secondLines[secondB])
              const bottomLeft = intersectLines(firstLines[firstA], secondLines[secondB])
              if (!topLeft || !topRight || !bottomRight || !bottomLeft) continue
              const corners = normalizedCandidate([topLeft, topRight, bottomRight, bottomLeft], width, height)
              if (!corners) continue
              if (polygonArea(cornersPoints(corners)) < 0.12) continue
              if (quadrilateralSurfaceScore(corners, gray, width, height) < 0.58) continue
              candidates.push({ corners, score: candidateScore(corners, magnitude, width, height, threshold) })
            }
          }
        }
      }
    }
  }
  return candidates
}

function addCandidate(candidates: { corners: CropCorners; score: number }[], corners: CropCorners | null, magnitude: Float32Array, width: number, height: number, threshold: number) {
  if (!corners) return
  const score = Math.min(1, candidateScore(corners, magnitude, width, height, threshold) + 0.15)
  if (score >= 0.42) candidates.push({ corners, score })
}

export function detectDocumentCornersFromRgba(data: Uint8ClampedArray | Uint8Array, width: number, height: number): CropCorners | null {
  if (width < 16 || height < 16 || data.length < width * height * 4) return null
  const gray = normalizeContrast(grayscale(data, width, height))
  const smoothedGray = normalizeContrast(blurGray(gray, width, height))
  const magnitude = edgeMagnitude(smoothedGray, width, height)
  const edgeSamples: number[] = []
  const sampleStride = Math.max(1, Math.floor(magnitude.length / 24000))
  for (let index = 0; index < magnitude.length; index += sampleStride) if (magnitude[index] > 0) edgeSamples.push(magnitude[index])
  if (!edgeSamples.length) return null
  const thresholds = [...new Set([0.52, 0.68, 0.82].map((ratio) => Math.max(10, percentile(edgeSamples, ratio))))]
  const candidates: { corners: CropCorners; score: number }[] = []
  addCandidate(candidates, detectRegionCorners(gray, width, height), magnitude, width, height, thresholds[0])
  if (!regionTouchesImageBoundary(gray, width, height)) {
    for (const threshold of thresholds) candidates.push(...houghCandidates(gray, magnitude, width, height, threshold))
  }
  candidates.sort((first, second) => second.score - first.score)
  return candidates[0]?.score >= 0.5 ? candidates[0].corners : null
}

export function detectDocumentCorners(source: CanvasImageSource): CropCorners | null {
  if (typeof document === 'undefined') return null
  const size = sourceSize(source)
  if (!size.width || !size.height) return null
  const scale = Math.min(1, 360 / Math.max(size.width, size.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(16, Math.round(size.width * scale))
  canvas.height = Math.max(16, Math.round(size.height * scale))
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) return null
  context.imageSmoothingEnabled = true
  context.drawImage(source, 0, 0, canvas.width, canvas.height)
  const image = context.getImageData(0, 0, canvas.width, canvas.height)
  return detectDocumentCornersFromRgba(image.data, image.width, image.height)
}
