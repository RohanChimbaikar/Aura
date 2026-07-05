// import { cn } from '../../../lib/utils'

// import type {
//   AnalysisPayload,
//   SelectedAudio,
// } from '../../../types'

// import type { AdvancedTab } from '../../../screens/AnalysisPageV2'
// import {
//   ChunkDiagnosticsTab,
//   DecoderConfidenceTab,
//   MetadataTab,
//   RobustnessDiagnosticsTab,
//   WaveformDiagnosticsTab,
// } from '../../../screens/AnalysisPageV2'
// import { SpectrogramDiagnosticsTab } from './SpectogramDiagnosticsTab'


// export function AdvancedDiagnosticsWorkbench({
//   analysis,
//   selectedAudio,
//   chunkRows,
//   selectedPart,
//   onSelectPart,
//   activeTab,
//   onTabChange,
// }: {
//   analysis: AnalysisPayload
//   selectedAudio: SelectedAudio | null
//   chunkRows: AnalysisPayload['chunkTable']
//   selectedPart: number | 'all'
//   onSelectPart: (part: number | 'all') => void
//   activeTab: AdvancedTab
//   onTabChange: (tab: AdvancedTab) => void
// }) {
//   const tabs: Array<{ key: AdvancedTab; label: string }> = [
//     { key: 'waveform', label: 'Waveform' },
//     { key: 'spectrogram', label: 'Spectrogram' },
//     { key: 'chunks', label: 'Chunk Diagnostics' },
//     { key: 'robustness', label: 'Robustness Analysis' },
//     { key: 'confidence', label: 'Decoder Confidence' },
//     { key: 'metadata', label: 'Metadata' },
//   ]

//   return (
//     <section aria-label="Advanced research diagnostics">
//       <div className="mb-4">
//         <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-aura-dim">
//           Layer 4 / Advanced research diagnostics
//         </div>
//         <h2 className="mt-2 text-[28px] font-semibold tracking-normal text-aura-text">
//           Inspect one diagnostic channel at a time
//         </h2>
//       </div>

//       <div className="overflow-hidden rounded-[16px] border border-aura-border/10 bg-aura-surface/70">
//         <div className="border-b border-aura-border/10 px-3 py-3">
//           <div className="flex flex-wrap gap-1">
//             {tabs.map((tab) => (
//               <button
//                 key={tab.key}
//                 type="button"
//                 onClick={() => onTabChange(tab.key)}
//                 className={cn(
//                   'rounded-[10px] px-3 py-2 text-[12px] font-medium transition-colors',
//                   activeTab === tab.key
//                     ? 'bg-aura-text text-aura-bg'
//                     : 'text-aura-muted hover:bg-aura-surfaceSoft hover:text-aura-text',
//                 )}
//               >
//                 {tab.label}
//               </button>
//             ))}
//           </div>
//         </div>

//         <div className="p-4 lg:p-5">
//           {activeTab === 'waveform' ? <WaveformDiagnosticsTab analysis={analysis} /> : null}
//           {activeTab === 'spectrogram' ? <SpectrogramDiagnosticsTab analysis={analysis} /> : null}
//           {activeTab === 'chunks' ? (
//             <ChunkDiagnosticsTab
//               analysis={analysis}
//               chunkRows={chunkRows}
//               selectedPart={selectedPart}
//               onSelectPart={onSelectPart}
//             />
//           ) : null}
//           {activeTab === 'robustness' ? (
//             <RobustnessDiagnosticsTab analysis={analysis} chunkRows={chunkRows} />
//           ) : null}
//           {activeTab === 'confidence' ? (
//             <DecoderConfidenceTab analysis={analysis} chunkRows={chunkRows} />
//           ) : null}
//           {activeTab === 'metadata' ? (
//             <MetadataTab analysis={analysis} selectedAudio={selectedAudio} />
//           ) : null}
//         </div>
//       </div>
//     </section>
//   )
// }
