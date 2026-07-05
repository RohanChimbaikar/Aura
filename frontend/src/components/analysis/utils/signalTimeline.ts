type MetricTone =
  | 'safe'
  | 'neutral'
  | 'warning'
  | 'danger'

type PayloadRole =
  | 'payload'
  | 'carrier'
  | 'tail'
  | string

type WavePoint = {
  x: number
  y: number
}

export function clamp(
  value: number,
  min: number,
  max: number,
) {
  return Math.max(
    min,
    Math.min(max, value),
  )
}

export function formatPercentValue(
  value: number | null | undefined,
) {
  if (
    value == null ||
    !Number.isFinite(value)
  ) {
    return 'Not reported'
  }

  return `${Math.round(
    clamp(value, 0, 1) * 100,
  )}%`
}

export function metricColor(
  tone: MetricTone,
) {
  if (tone === 'safe') {
    return 'rgb(91,173,190)'
  }

  if (tone === 'warning') {
    return 'rgb(126,132,184)'
  }

  if (tone === 'danger') {
    return 'rgb(232,116,101)'
  }

  return 'rgb(176,184,198)'
}

export function formatRoleLabel(
  role: PayloadRole,
) {
  if (role === 'tail') {
    return 'Ignored tail'
  }

  return role.replace('_', ' ')
}

export function formatSnr(
  value: number | null | undefined,
) {
  if (
    value == null ||
    !Number.isFinite(value)
  ) {
    return 'Not reported'
  }

  return `${value.toFixed(1)} dB`
}

export function pointsToPath(
  points: WavePoint[],
  width: number,
  baseline: number,
  amplitude: number,
) {
  if (!points.length) {
    return `M 0 ${baseline} L ${width} ${baseline}`
  }

  return points
    .map((point, index) => {
      const x =
        (index /
          Math.max(
            1,
            points.length - 1,
          )) *
        width

      const y =
        baseline -
        clamp(point.y, -1, 1) *
          amplitude

      return `${
        index === 0 ? 'M' : 'L'
      } ${x.toFixed(
        2,
      )} ${y.toFixed(2)}`
    })
    .join(' ')
}