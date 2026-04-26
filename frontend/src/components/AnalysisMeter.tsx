type Props = {
  confidence: string
  likelihood: string
}

export function AnalysisMeter({ confidence, likelihood }: Props) {
  return (
    <div className="flex items-center gap-8 rounded-[28px] border border-white/8 bg-white/[0.02] p-6">
      <div className="relative h-32 w-32 shrink-0 rounded-full border border-white/8">
        <div className="absolute inset-[10px] rounded-full border border-aura-accent/20" />
        <div className="absolute inset-0 rounded-full bg-[conic-gradient(from_220deg,rgba(93,87,255,0.15),rgba(93,87,255,0.82),rgba(114,209,199,0.42),rgba(255,255,255,0.05))]" />
        <div className="absolute inset-[16px] flex items-center justify-center rounded-full bg-aura-bg">
          <div className="text-center">
            <div className="font-mono text-lg text-aura-text">{confidence}</div>
            <div className="mt-1 text-[10px] uppercase tracking-[0.2em] text-aura-dim">
              Confidence
            </div>
          </div>
        </div>
      </div>
      <div>
        <div className="text-[11px] uppercase tracking-[0.24em] text-aura-dim">
          Payload likelihood
        </div>
        <div className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-aura-text">
          {likelihood}
        </div>
        <div className="mt-3 max-w-sm text-sm leading-6 text-aura-muted">
          Signal variance remains contained, with one region showing a deviation pattern consistent with embedded low-density payload behavior.
        </div>
      </div>
    </div>
  )
}
