import { LockKeyhole } from 'lucide-react'

type Props = {
  value: string
  onChange: (value: string) => void
  placeholder?: string
}

export function SecureKeyField({
  value,
  onChange,
  placeholder = 'Enter secure key',
}: Props) {
  return (
    <label className="block">
      <div className="mb-2 text-[10px] font-medium uppercase tracking-[0.18em] text-aura-dim">
        Secure key
      </div>

      <div className="aura-steel flex items-center gap-3 rounded-[22px] border border-aura-border/22 bg-aura-surface/45 px-4 py-3.5 transition-colors focus-within:border-aura-accent/40 focus-within:bg-aura-surface/60">
        <LockKeyhole size={15} className="text-aura-dim" />

        <input
          type="password"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className="w-full bg-transparent text-[14px] text-aura-text outline-none placeholder:text-aura-dim"
        />
      </div>
    </label>
  )
}