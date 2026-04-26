type Props = {
  tone?: 'accent' | 'reveal'
  dense?: boolean
}

const accentBars = [
  18, 32, 24, 46, 20, 38, 58, 34, 22, 42, 28, 56,
  26, 36, 52, 24, 34, 48, 30, 44, 22, 40, 54, 28,
  18, 26, 38, 22, 34, 46, 26, 20,
]

const revealBars = [
  14, 22, 18, 30, 16, 24, 32, 28, 20, 26, 18, 34,
  16, 24, 30, 20, 28, 36, 18, 26, 22, 32, 20, 24,
  14, 20, 28, 18, 24, 30, 20, 16,
]

export function WaveformStrip({ tone = 'accent', dense = false }: Props) {
  const bars = tone === 'accent' ? accentBars : revealBars

  const glow =
    tone === 'accent'
      ? 'rgba(93,87,255,0.22)'
      : 'rgba(114,209,199,0.18)'

  const fill =
    tone === 'accent'
      ? 'bg-aura-accent/85'
      : 'bg-aura-reveal/80'

  return (
    <div className="relative overflow-hidden rounded-[22px] border border-white/10 bg-white/[0.03] px-4 py-4">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_0%,rgba(255,255,255,0.05),transparent_34%)]" />
      <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-white/[0.03]" />

      <div
        className={`relative flex items-end ${
          dense ? 'h-[72px] gap-[3px]' : 'h-[96px] gap-[4px]'
        }`}
      >
        {bars.map((value, index) => (
          <span
            key={`${value}-${index}`}
            className={`${fill} block rounded-full`}
            style={{
              width: dense ? 3 : 4,
              height: `${value}%`,
              boxShadow: `0 0 0 1px rgba(255,255,255,0.03), 0 0 10px ${glow}`,
              opacity: 0.95 - index * 0.008,
            }}
          />
        ))}
      </div>

      <div
        className={`mt-3 flex items-center justify-between font-mono ${
          dense ? 'text-[10px]' : 'text-[11px]'
        } text-aura-dim`}
      >
        <span>00:00</span>
        <span className="uppercase tracking-[0.08em]">
          protected signal envelope
        </span>
        <span>01:12</span>
      </div>
    </div>
  )
}