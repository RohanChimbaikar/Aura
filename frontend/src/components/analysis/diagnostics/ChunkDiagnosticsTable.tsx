import type { AnalysisPayload } from '../types/analysis'
import { formatNumber } from '../utils/formatting'

export function ChunkDiagnosticsTable({
  chunkRows,
}: {
  chunkRows: AnalysisPayload['chunkTable']
}) {
  return (
    <div className="overflow-auto rounded-2xl border border-aura-border/8 bg-aura-bg/28">
      <table className="min-w-full text-left text-xs text-aura-text">
        <thead className="border-b border-aura-border/8 text-aura-muted">
          <tr>
            <th className="px-3 py-2">Chunk</th>
            <th className="px-3 py-2">Part</th>
            <th className="px-3 py-2">Status</th>
            <th className="px-3 py-2">Confidence</th>
            <th className="px-3 py-2">SNR</th>
            <th className="px-3 py-2">MSE</th>
            <th className="px-3 py-2">Bit agreement</th>
            <th className="px-3 py-2">Corrections</th>
            <th className="px-3 py-2">Flags</th>
          </tr>
        </thead>
        <tbody>
          {chunkRows.map((row) => (
            <tr
              key={`${row.chunkIndex}-${row.partNumber ?? 0}`}
              className="border-b border-aura-border/6 last:border-b-0"
            >
              <td className="px-3 py-2 font-mono">{row.chunkIndex}</td>
              <td className="px-3 py-2">{row.partNumber ?? '\u2014'}</td>
              <td className="px-3 py-2">{row.status}</td>
              <td className="px-3 py-2">{formatNumber(row.confidence)}</td>
              <td className="px-3 py-2">{formatNumber(row.snrDb)}</td>
              <td className="px-3 py-2">{formatNumber(row.mse, 6)}</td>
              <td className="px-3 py-2">{formatNumber(row.bitAgreement)}</td>
              <td className="px-3 py-2">{row.correctionCount}</td>
              <td className="px-3 py-2">
                {row.isMissing ? 'missing' : row.isDuplicate ? 'duplicate' : '\u2014'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
