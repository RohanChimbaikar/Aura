// import { resolveUrl } from '../../../services/api'

// import type {
//   AnalysisPayload,
//   SpectrogramMatrix,
// } from '../../../types'

// import {
//   SpectrogramCanvas,
//   UnavailablePanel,
//   hasSpectrogramValues,
// } from '../../../screens/AnalysisPageV2'


// export function SpectrogramDiagnosticsTab({ analysis }: { analysis: AnalysisPayload }) {
//   const compare = analysis.charts.compareSpectrogram
//   const matrices = [
//     { title: 'Cover spectrogram', matrix: compare?.spectrograms?.cover, variant: 'signal' as const },
//     {
//       title: 'Stego spectrogram',
//       matrix: compare?.spectrograms?.stego || analysis.charts.signalSpectrogram || analysis.legacy?.signal.spectrogram,
//       variant: 'signal' as const,
//     },
//     {
//       title: 'Residual difference map',
//       matrix: compare?.residualAnalysis?.residualSpectrogram || compare?.spectrograms?.residual,
//       variant: 'residual' as const,
//     },
//   ].filter((item): item is { title: string; matrix: SpectrogramMatrix; variant: 'signal' | 'residual' } =>
//     hasSpectrogramValues(item.matrix),
//   )

//   const backendImages = [
//     { title: 'Cover spectrogram', src: compare?.coverImageUrl },
//     { title: 'Stego spectrogram', src: compare?.stegoImageUrl },
//     { title: 'Residual difference map', src: compare?.diffImageUrl },
//   ].filter((item): item is { title: string; src: string } => Boolean(item.src))

//   if (!matrices.length && !backendImages.length) {
//     return (
//       <UnavailablePanel
//         title="No real STFT data returned"
//         message="Aura only renders spectrograms when the analysis response contains generated STFT matrices or persisted spectrogram artifacts."
//       />
//     )
//   }

//   return (
//     <div className="space-y-3">
//       {matrices.length ? (
//         <div className="grid gap-3 xl:grid-cols-3">
//           {matrices.map((item) => (
//             <SpectrogramCanvas
//               key={item.title}
//               title={item.title}
//               matrix={item.matrix}
//               variant={item.variant}
//             />
//           ))}
//         </div>
//       ) : null}

//       {!matrices.length && backendImages.length ? (
//         <div className="grid gap-3 xl:grid-cols-3">
//           {backendImages.map((item) => (
//             <div key={item.title} className="overflow-hidden rounded-[12px] border border-aura-border/10 bg-aura-bg/20">
//               <div className="border-b border-aura-border/10 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.16em] text-aura-dim">
//                 {item.title}
//               </div>
//               <img src={resolveUrl(item.src)} alt={item.title} className="aspect-[16/9] w-full object-cover" />
//             </div>
//           ))}
//         </div>
//       ) : null}
//     </div>
//   )
// }