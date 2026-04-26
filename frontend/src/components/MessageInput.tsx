type Props = {
  value: string
  onChange: (value: string) => void
}

export function MessageInput({ value, onChange }: Props) {
  return (
    <label className="block">
      <div className="mb-2 text-[10px] font-medium uppercase tracking-[0.18em] text-aura-dim">
        Secret message
      </div>

      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={5}
        placeholder="Keep the payload short and deliberate."
        className="aura-steel w-full resize-none rounded-[22px] border border-aura-border/22 bg-aura-surface/45 px-5 py-4 text-[14px] leading-6 text-aura-text outline-none transition-colors placeholder:text-aura-dim focus:border-aura-accent/40 focus:bg-aura-surface/60"
      />
    </label>
  )
}