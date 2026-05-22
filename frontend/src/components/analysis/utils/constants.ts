import type { AnalysisPipelineStep } from '../types/analysis'

export const ANALYSIS_PIPELINE_STEPS: AnalysisPipelineStep[] = [
  {
    key: 'target_accept',
    title: 'Target accepted',
    caption: 'The selected audio or transmission has been locked for analysis.',
    runningText: 'Locking the selected Aura target for forensic analysis...',
  },
  {
    key: 'source_classification',
    title: 'Source classification',
    caption: 'Classify the target as single audio, grouped transmission, or normalized single-part.',
    runningText: 'Classifying source semantics and transmission shape...',
  },
  {
    key: 'transmission_resolution',
    title: 'Transmission resolution',
    caption: 'Resolve the analysis scope, sibling parts, and ordered sequence.',
    runningText: 'Resolving grouped transmission and collecting ordered parts...',
  },
  {
    key: 'signal_loading',
    title: 'Signal loading',
    caption: 'Load the required audio file or grouped carrier segments.',
    runningText: 'Loading carrier signal data for inspection...',
  },
  {
    key: 'recovery_inspection',
    title: 'Recovery inspection',
    caption: 'Inspect decode and recovery evidence across the selected scope.',
    runningText: 'Inspecting recovery evidence across the sequence...',
  },
  {
    key: 'metrics_extraction',
    title: 'Metrics extraction',
    caption: 'Build chunk confidence, integrity, payload structure, and signal metrics.',
    runningText: 'Extracting chunk confidence and integrity metrics...',
  },
  {
    key: 'compare_artifacts',
    title: 'Compare artifact generation',
    caption: 'Prepare cover/stego compare views when provenance is available.',
    runningText: 'Preparing compare artifacts where provenance is available...',
  },
  {
    key: 'final_verdict',
    title: 'Final verdict',
    caption: 'Build the final renderable forensic object for the UI.',
    runningText: 'Finalizing forensic verdict...',
  },
]

export const TOOLTIP_STYLE = {
  backgroundColor: 'rgba(17, 20, 22, 0.96)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: '14px',
  color: 'rgb(236,242,244)',
}
