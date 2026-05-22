import type { AnalysisPayload, SelectedAudio } from '../types/analysis'

export const TERMINAL_ANALYSIS_STATUSES = new Set([
  'complete',
  'completed',
  'partial',
  'failed',
  'timed_out',
  'invalid_target',
  'missing_source',
  'not_found',
  'cancelled',
])

export const SUCCESS_ANALYSIS_STATUSES = new Set(['complete', 'completed', 'partial'])

export function isTerminalStatus(status?: string) {
  return TERMINAL_ANALYSIS_STATUSES.has((status || '').toLowerCase())
}

export function isSuccessLikeStatus(status?: string) {
  return SUCCESS_ANALYSIS_STATUSES.has((status || '').toLowerCase())
}

export function hasPayloadStructure(analysis: AnalysisPayload | null) {
  const structure = analysis?.charts?.payloadStructure
  if (!structure) return false
  return (
    structure.headerBlocks +
      structure.payloadBlocks +
      structure.redundancyBlocks +
      structure.ignoredTailBlocks +
      structure.duplicateBlocks >
    0
  )
}

export function hasCompareEvidence(analysis: AnalysisPayload | null) {
  if (!analysis) return false
  return Boolean(
    analysis.provenance?.hasCoverStegoLink ||
      analysis.charts?.compareSpectrogram?.available ||
      analysis.charts?.waveformComparison?.available,
  )
}

export function hasDiagnostics(analysis: AnalysisPayload | null, chunkRows: AnalysisPayload['chunkTable']) {
  if (!analysis) return false
  return (
    chunkRows.length > 0 ||
    (analysis.recovery?.changes?.length ?? 0) > 0 ||
    (analysis.provenance?.assets?.length ?? 0) > 0
  )
}

/**
 * Aura analysis should render if *any* meaningful object exists.
 * We intentionally treat minimal backend payloads as renderable.
 */
export function hasRenderablePayload(analysis: AnalysisPayload | null) {
  if (!analysis || typeof analysis !== 'object') return false

  if (
    analysis.summary ||
    analysis.recovery ||
    analysis.verdict ||
    analysis.metrics ||
    analysis.charts ||
    (analysis.chunkTable?.length ?? 0) > 0 ||
    (analysis.provenance?.assets?.length ?? 0) > 0
  ) {
    return true
  }

  return Boolean(
    analysis.status ||
      analysis.message ||
      analysis.reason ||
      analysis.mode ||
      analysis.sourceType ||
      analysis.analysisId ||
      analysis.transmissionId ||
      analysis.elapsedMs != null ||
      analysis.filesProcessed != null ||
      analysis.filesTotal != null ||
      (analysis.missingParts?.length ?? 0) > 0,
  )
}

export function inferAudioSourceType(audio: SelectedAudio | null): 'single' | 'grouped' {
  if (!audio) return 'single'
  if (audio.analysisSourceType) return audio.analysisSourceType

  const fileName = audio.selectedPartFilename || audio.fileName || ''
  const partMatch = fileName.match(/^tx_[^_]+_part_(\d+)_of_(\d+)\.wav$/i)

  if (partMatch) {
    const totalParts = Number(partMatch[2])
    return Number.isFinite(totalParts) && totalParts > 1 ? 'grouped' : 'single'
  }

  if (audio.mode === 'multi') return 'grouped'
  if ((audio.totalSegments ?? 0) > 1) return 'grouped'
  if ((audio.segments?.length ?? 0) > 1) return 'grouped'

  return 'single'
}

export function parseTransmissionInfo(audio: SelectedAudio | null) {
  const fileName = audio?.selectedPartFilename || audio?.fileName || ''
  const match = fileName.match(/^tx_([^_]+)_part_(\d+)_of_(\d+)\.wav$/i)

  if (!match) {
    return {
      transmissionIdFromFile: null as string | null,
      partNumberFromFile: null as number | null,
      totalPartsFromFile: null as number | null,
    }
  }

  return {
    transmissionIdFromFile: match[1],
    partNumberFromFile: Number(match[2]),
    totalPartsFromFile: Number(match[3]),
  }
}

/**
 * Grouped analysis payloads should be considered valid for any selected part
 * belonging to the same transmission.
 *
 * This is the key fix that stops false "No analysis payload was returned".
 */
export function analysisMatchesAudio(analysis: AnalysisPayload | null, audio: SelectedAudio | null) {
  if (!analysis || !audio) return false

  const sourceType = inferAudioSourceType(audio)
  const fileName = audio.selectedPartFilename || audio.fileName || ''
  const { transmissionIdFromFile } = parseTransmissionInfo(audio)

  const audioTransmissionId =
    audio.transmissionId || transmissionIdFromFile || null

  const analysisTransmissionId = analysis.transmissionId || null
  const analysisMode = (analysis.mode || '').toLowerCase()
  const analysisSourceType = (analysis.sourceType || '').toLowerCase()

  if (analysis.selectedPartFilename && analysis.selectedPartFilename === fileName) {
    return true
  }

  if (
    sourceType === 'grouped' &&
    audioTransmissionId &&
    analysisTransmissionId &&
    analysisTransmissionId.toLowerCase() === audioTransmissionId.toLowerCase()
  ) {
    return true
  }

  if (
    (analysisMode === 'grouped' || analysisSourceType === 'grouped') &&
    audioTransmissionId &&
    analysisTransmissionId &&
    analysisTransmissionId.toLowerCase() === audioTransmissionId.toLowerCase()
  ) {
    return true
  }

  if (analysis.legacy?.message_id && audio.messageId) {
    if (String(analysis.legacy.message_id) === String(audio.messageId)) {
      return true
    }
  }

  if (analysis.analysisId && audio.messageId) {
    if (analysis.analysisId.includes(String(audio.messageId))) {
      return true
    }
  }

  if (analysis.analysisId && fileName && analysis.analysisId.includes(fileName)) {
    return true
  }

  return false
}

export function parseTotalParts(fileName?: string) {
  const match = (fileName || '').match(/^tx_[^_]+_part_\d+_of_(\d+)\.wav$/i)
  if (!match) return undefined
  const total = Number(match[1])
  return Number.isFinite(total) && total > 0 ? total : undefined
}
