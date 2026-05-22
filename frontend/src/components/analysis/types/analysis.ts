import type { AnalysisPayload, SelectedAudio } from '../../../types'

export type AnalysisStepState = 'pending' | 'running' | 'complete' | 'skipped' | 'failed'

export type AnalysisPipelineStep = {
  key: string
  title: string
  caption: string
  runningText: string
}

export type AnalysisPageProps = {
  analysis: AnalysisPayload | null
  selectedAudio: SelectedAudio | null
  availableAudio: SelectedAudio[]
  onAnalyzeAudio: (audio: SelectedAudio, options?: { force?: boolean }) => Promise<void> | void
  loading?: boolean
  error?: string
  hasAttempted?: boolean
  status?: 'idle' | 'loading' | 'success' | 'partial' | 'failed'
}

export type AudioOption = {
  key: string
  audio: SelectedAudio
}

export type ChunkConfidenceRow = {
  chunkIndex: number
  confidence: number
  status: string
}

export type SnrRow = {
  chunkIndex: number
  signalQuality: number | null
}

export type CorrectionRow = {
  chunkIndex: number
  correctionCount: number
}

export type ConfidenceTrendRow = {
  chunkIndex: number
  confidence: number
}

export { type AnalysisPayload, type SelectedAudio }
