import type { AnalysisPayload } from '../types/analysis'

export function verdictTone(status: AnalysisPayload['summary']['recoveryStatus']) {
  if (status === 'failed') return 'danger'
  if (status === 'partial') return 'accent'
  return 'safe'
}

export function subtleIssueMessage(status: AnalysisPayload['summary']['recoveryStatus']) {
  if (status === 'partial')
    return 'Some segments were not fully recoverable. Review chunk evidence before trusting the full transmission.'
  if (status === 'recovered_with_corrections')
    return 'Recovery required corrective passes. Confidence remains high, but repaired regions are marked below.'
  if (status === 'failed')
    return 'Recovery could not be verified from the available signal evidence.'
  return ''
}

export function recoveryNote(status: AnalysisPayload['summary']['recoveryStatus']) {
  if (status === 'partial')
    return 'Partial recovery. The text below may exclude missing or weak regions.'
  if (status === 'recovered_with_corrections')
    return 'Recovered with correction passes. Review correction impact for repaired chunks.'
  return ''
}
