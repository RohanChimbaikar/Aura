import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { Panel } from '../../AuraPrimitives'
import { cn } from '../../../lib/utils'
import type { AnalysisPayload } from '../types/analysis'
import { formatNumber, formatNullableBool, cardTitleClass } from '../utils/formatting'

export function AdvancedDiagnosticsSection({
  analysis,
  chunkRows,
}: {
  analysis: AnalysisPayload
  chunkRows: AnalysisPayload['chunkTable']
}) {
  const [open, setOpen] = useState(false)
  const corrections = analysis.recovery.changes

  return (
    <div className="overflow-hidden rounded-2xl border border-aura-border/8 bg-aura-surface/72">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between px-5 py-4 text-left text-sm font-semibold text-aura-text transition-colors hover:bg-aura-bg/12"
      >
        <span>Advanced Diagnostics</span>
        <ChevronDown
          size={16}
          className={cn('transition-transform duration-200', open ? 'rotate-180' : 'rotate-0')}
        />
      </button>
      <div
        className={cn(
          'grid transition-[grid-template-rows] duration-300 ease-out',
          open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
        )}
      >
        <div className="overflow-hidden">
          <div className="border-t border-aura-border/8 px-5 py-5">
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

            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <Panel className="p-4">
                <div className={cardTitleClass()}>Forensic notes</div>
                <div className="mt-3 space-y-2 text-sm leading-6 text-aura-muted">
                  <p>Header validation: {formatNullableBool(analysis.summary.headerValid)}.</p>
                  <p>Sequence anomalies: {analysis.summary.sequenceValid ? 'none detected' : 'present'}.</p>
                  <p>Ignored tail blocks: {analysis.summary.ignoredTail}.</p>
                  <p>
                    Corrections applied: {analysis.summary.correctionsApplied ? `${analysis.summary.correctionsCount} chunk adjustments recorded.` : 'none recorded.'}
                  </p>
                </div>
              </Panel>

              <Panel className="p-4">
                <div className={cardTitleClass()}>Artifact references</div>
                <div className="mt-3 space-y-2 text-sm leading-6 text-aura-muted">
                  <p>Provenance assets linked: {analysis.provenance.assets.length}.</p>
                  <p>Compare artifacts available: {analysis.charts.compareSpectrogram?.available ? 'yes' : 'no'}.</p>
                  <p>Corrections listed: {corrections.length ? corrections.length : 0}.</p>
                </div>
              </Panel>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
