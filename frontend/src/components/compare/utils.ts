import type { AnalysisPayload, MetricTone, PayloadRole } from '../../types'

export type WavePoint = { x: number; y: number }

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

export function normalizePercent(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null
  return clamp(value > 1 ? value / 100 : value, 0, 1)
}

export function pointsToPath(points: WavePoint[], width: number, baseline: number, amplitude: number) {
  if (!points || !points.length) return `M 0 ${baseline} L ${width} ${baseline}`

  return points
    .map((point, index) => {
      const x = (index / Math.max(1, points.length - 1)) * width
      const y = baseline - clamp(point.y, -1, 1) * amplitude
      return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`
    })
    .join(' ')
}

export interface ChunkInsight {
  row: AnalysisPayload['chunkTable'][number]
  order: number
  role: PayloadRole
  activePayload: boolean
  confidence: number | null
  bitAccuracy: number | null
  corruption: number
  tone: MetricTone
}

export function getPayloadRole(
  order: number,
  row: AnalysisPayload['chunkTable'][number],
  structure: AnalysisPayload['charts']['payloadStructure']
): PayloadRole {
  if (row.isDuplicate) return 'duplicate'
  const headerEnd = Math.max(0, structure.headerBlocks)
  const payloadEnd = headerEnd + Math.max(0, structure.payloadBlocks)
  const redundancyEnd = payloadEnd + Math.max(0, structure.redundancyBlocks)
  const tailEnd = redundancyEnd + Math.max(0, structure.ignoredTailBlocks)

  if (order < headerEnd) return 'header'
  if (order < payloadEnd) return 'payload'
  if (order < redundancyEnd) return 'redundancy'
  if (order < tailEnd) return 'tail'
  return 'unknown'
}

export function getChunkTone(
  row: AnalysisPayload['chunkTable'][number],
  confidence: number | null,
  corruption: number
): MetricTone {
  if (row.isMissing || row.isDuplicate || row.status === 'missing' || corruption >= 0.62) return 'danger'
  if (row.status === 'low_confidence' || corruption >= 0.3 || (confidence != null && confidence < 0.72)) {
    return 'warning'
  }
  if (confidence != null) return 'safe'
  return 'neutral'
}

export function getChunkInsights(
  chunkRows: AnalysisPayload['chunkTable'],
  structure: AnalysisPayload['charts']['payloadStructure']
): ChunkInsight[] {
  if (!chunkRows) return []
  return chunkRows.map((row, order) => {
    const confidence = typeof row.confidence === 'number' ? normalizePercent(row.confidence) : null
    const bitAccuracy = typeof row.bitAgreement === 'number' ? normalizePercent(row.bitAgreement) : null
    const role = getPayloadRole(order, row, structure)
    const correctionPressure = clamp((row.correctionCount || 0) / 4, 0, 1)
    const bitPressure = bitAccuracy == null ? 0 : 1 - bitAccuracy
    const confidencePressure = confidence == null ? 0 : 1 - confidence
    const stftPressure =
      typeof row.stftDeltaScore === 'number' ? clamp(row.stftDeltaScore * 5, 0, 1) : 0
    const structuralPressure = row.isMissing || row.isDuplicate ? 1 : 0
    const statusPressure = row.status === 'low_confidence' || row.status === 'missing' ? 0.35 : 0
    const corruption = clamp(
      structuralPressure ||
        confidencePressure * 0.36 +
          bitPressure * 0.44 +
          correctionPressure * 0.16 +
          stftPressure * 0.18 +
          statusPressure,
      0,
      1
    )

    return {
      row,
      order,
      role,
      activePayload: role === 'header' || role === 'payload' || role === 'redundancy',
      confidence,
      bitAccuracy,
      corruption,
      tone: getChunkTone(row, confidence, corruption),
    }
  })
}

export type DiffType = 'match' | 'insert' | 'delete'

export interface DiffToken {
  value: string
  type: DiffType
}

/**
 * Computes an LCS-based difference between expected and recovered payload text.
 * Falls back to character-by-character comparison if the text contains no spaces
 * and is long (e.g. raw hex payload).
 */
export function diffPayloads(expected: string, recovered: string): DiffToken[] {
  const expStr = expected || ''
  const recStr = recovered || ''

  // Decide if we should do word-level or char-level split
  const isWordExp = expStr.trim().includes(' ')
  const isWordRec = recStr.trim().includes(' ')
  const doWordDiff = isWordExp || isWordRec

  const exp = doWordDiff ? expStr.split(/(\s+)/) : expStr.split('')
  const rec = doWordDiff ? recStr.split(/(\s+)/) : recStr.split('')

  const n = exp.length
  const m = rec.length

  // Standard LCS DP Table
  const dp: number[][] = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0))

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      if (exp[i - 1] === rec[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1])
      }
    }
  }

  const diff: DiffToken[] = []
  let i = n
  let j = m

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && exp[i - 1] === rec[j - 1]) {
      diff.unshift({ value: exp[i - 1], type: 'match' })
      i--
      j--
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      diff.unshift({ value: rec[j - 1], type: 'insert' })
      j--
    } else {
      diff.unshift({ value: exp[i - 1], type: 'delete' })
      i--
    }
  }

  return diff
}

export function formatSnr(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return 'Not reported'
  return `${value.toFixed(1)} dB`
}

export function formatNullableDecimal(value: number | null | undefined, fractionDigits = 4) {
  if (value == null || !Number.isFinite(value)) return 'Not reported'
  return value.toFixed(fractionDigits)
}

export function formatPercentValue(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return 'Not reported'
  return `${(value * 100).toFixed(0)}%`
}

