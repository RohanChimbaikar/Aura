import type { AnalysisPayload } from '../types/analysis'
import { DebugDisclosure } from './DebugDisclosure'
import { ChunkDiagnosticsTable } from './ChunkDiagnosticsTable'
import { ForensicNotesPanel } from './ForensicNotesPanel'
import { ArtifactReferencesPanel } from './ArtifactReferencesPanel'

export function AdvancedDiagnosticsSection({
  analysis,
  chunkRows,
}: {
  analysis: AnalysisPayload
  chunkRows: AnalysisPayload['chunkTable']
}) {
  return (
    <DebugDisclosure title="Advanced Diagnostics">
      <ChunkDiagnosticsTable chunkRows={chunkRows} />

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <ForensicNotesPanel analysis={analysis} />
        <ArtifactReferencesPanel analysis={analysis} />
      </div>
    </DebugDisclosure>
  )
}
