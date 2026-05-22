import type { AnalysisPayload } from '../types/analysis'
import type { ChunkConfidenceRow, SnrRow, CorrectionRow, ConfidenceTrendRow } from '../types/analysis'

export function buildConfidenceData(chunkRows: AnalysisPayload['chunkTable']): ChunkConfidenceRow[] {
  return chunkRows.map((row) => ({
    chunkIndex: row.chunkIndex,
    confidence: row.confidence ?? 0,
    status: row.status,
  }))
}

export function buildSnrData(chunkRows: AnalysisPayload['chunkTable']): SnrRow[] {
  return chunkRows.map((row) => ({
    chunkIndex: row.chunkIndex,
    signalQuality:
      row.snrDb ??
      (row.stftDeltaScore != null
        ? Math.max(0, 100 - row.stftDeltaScore * 1000)
        : row.mse != null
          ? Math.max(0, 100 - row.mse * 100000)
          : null),
  }))
}

export function buildCorrectionData(chunkRows: AnalysisPayload['chunkTable']): CorrectionRow[] {
  return chunkRows.map((row) => ({
    chunkIndex: row.chunkIndex,
    correctionCount: row.correctionCount,
  }))
}

export function buildConfidenceTrend(chunkRows: AnalysisPayload['chunkTable']): ConfidenceTrendRow[] {
  return chunkRows.map((row) => ({ chunkIndex: row.chunkIndex, confidence: row.confidence ?? 0 }))
}
