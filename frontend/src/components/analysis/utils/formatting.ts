export function formatVerdict(status: string | null | undefined, hasRecoveredText: boolean) {
  if (!status) return hasRecoveredText ? 'Recovered' : 'No recovery available'
  return status
    .split('_')
    .join(' ')
    .replace(/\b\w/g, (char: string) => char.toUpperCase())
}

export function formatNullableBool(value: boolean | null | undefined) {
  if (value == null) return '\u2014'
  return value ? 'Yes' : 'No'
}

export function formatNumber(value: number | null | undefined, digits = 2) {
  if (value == null || Number.isNaN(value)) return '\u2014'
  return value.toFixed(digits)
}

export function cardTitleClass() {
  return 'text-[11px] font-semibold uppercase tracking-[0.18em] text-aura-dim/90'
}

export function cardSubtitleClass() {
  return 'mt-1 text-sm leading-6 text-aura-muted'
}
