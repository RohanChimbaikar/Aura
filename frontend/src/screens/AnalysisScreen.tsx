import { analysisResult } from '../data'
import { AnalysisMeter } from '../components/AnalysisMeter'
import { AudioDropzone } from '../components/AudioDropzone'
import { CollapsibleDiagnosticsPanel } from '../components/CollapsibleDiagnosticsPanel'
import { DataRow } from '../components/DataRow'
import { PrimaryActionButton } from '../components/ActionButtons'
import { SurfacePanel } from '../components/SurfacePanel'
import { WaveformStrip } from '../components/WaveformStrip'

export function AnalysisScreen() {
  return (
    <div className="grid gap-6 xl:grid-cols-[1.18fr_0.82fr]">
      <div className="space-y-6">
        <SurfacePanel className="p-7">
          <AudioDropzone
            fileName={analysisResult.fileName}
            meta={`${analysisResult.duration} · broadband voice capture`}
          />
          <div className="mt-6">
            <WaveformStrip />
          </div>
          <div className="mt-6">
            <PrimaryActionButton>Analyze</PrimaryActionButton>
          </div>
        </SurfacePanel>

        <CollapsibleDiagnosticsPanel title="Spectral Diagnostics">
          <div className="space-y-1">
            <DataRow label="Probable anomaly region" value={analysisResult.anomaly} />
            <DataRow label="Estimated payload size" value={analysisResult.payloadEstimate} />
            <DataRow label="Suspiciousness level" value={analysisResult.suspiciousness} />
          </div>
          <div className="mt-4 rounded-[22px] border border-white/8 bg-white/[0.02] p-4">
            <div className="grid h-24 grid-cols-12 gap-1">
              {Array.from({ length: 48 }).map((_, index) => (
                <span
                  key={index}
                  className="rounded-full"
                  style={{
                    background:
                      index > 17 && index < 24
                        ? 'rgba(114,209,199,0.55)'
                        : 'rgba(93,87,255,0.22)',
                    opacity: index % 3 === 0 ? 0.7 : 0.35,
                  }}
                />
              ))}
            </div>
          </div>
        </CollapsibleDiagnosticsPanel>
      </div>

      <SurfacePanel className="p-6">
        <AnalysisMeter
          confidence={analysisResult.confidence}
          likelihood={analysisResult.likelihood}
        />

        <div className="mt-6 space-y-1">
          <DataRow label="Suspiciousness level" value={analysisResult.suspiciousness} />
          <DataRow label="Anomaly regions" value={analysisResult.anomaly} />
          <DataRow label="Estimated payload size" value={analysisResult.payloadEstimate} />
        </div>
      </SurfacePanel>
    </div>
  )
}
