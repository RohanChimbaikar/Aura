import {
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react'

import { OutcomeBadge } from '../recovery/OutcomeBadge'

import {
  clamp,
  formatPercentValue,
  formatRoleLabel,
  formatSnr,
  metricColor,
  pointsToPath,
} from '../utils/signalTimeline'


type WavePoint = {
  x: number
  y: number
}

type ChunkInsight = any

type Props = {
  points: WavePoint[]
  chunkInsights: ChunkInsight[]
  playbackRatio: number
}
export function SignalTimeline({
  points,
  chunkInsights,
  playbackRatio,
}: Props) {
  const width = 1200
  const height = 320
  const baseline = 165
  const amplitude = 92

  const path = pointsToPath(
    points,
    width,
    baseline,
    amplitude,
  )

  const [hoverIndex, setHoverIndex] =
    useState<number | null>(null)

  const hoverInsight =
    hoverIndex == null
      ? null
      : chunkInsights[hoverIndex]

  function handlePointerMove(
    event: ReactPointerEvent<SVGSVGElement>,
  ) {
    if (!chunkInsights.length) return

    const rect =
      event.currentTarget.getBoundingClientRect()

    const ratio = clamp(
      (event.clientX - rect.left) /
        Math.max(1, rect.width),
      0,
      1,
    )

    const next = Math.min(
      chunkInsights.length - 1,
      Math.floor(ratio * chunkInsights.length),
    )

    setHoverIndex(next)
  }

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="block h-[360px] w-full cursor-crosshair"
        onPointerMove={handlePointerMove}
        onPointerLeave={() =>
          setHoverIndex(null)
        }
      >
        <defs>
          <linearGradient
            id="analysisWaveStroke"
            x1="0"
            x2="1"
          >
            <stop
              offset="0%"
              stopColor="rgb(176,184,198)"
            />
            <stop
              offset="50%"
              stopColor="rgb(91,173,190)"
            />
            <stop
              offset="100%"
              stopColor="rgb(126,132,184)"
            />
          </linearGradient>
        </defs>

        {Array.from({ length: 9 }).map(
          (_, index) => {
            const x = (index / 8) * width

            return (
              <line
                key={`x-${index}`}
                x1={x}
                x2={x}
                y1={32}
                y2={height - 28}
                stroke="rgb(var(--aura-border) / 0.08)"
              />
            )
          },
        )}

        {[-1, -0.5, 0, 0.5, 1].map(
          (level) => {
            const y =
              baseline - level * amplitude

            return (
              <line
                key={`y-${level}`}
                x1={0}
                x2={width}
                y1={y}
                y2={y}
                stroke="rgb(var(--aura-border) / 0.09)"
              />
            )
          },
        )}

        {chunkInsights.map(
          (insight, index) => {
            const chunkWidth =
              width /
              Math.max(1, chunkInsights.length)

            const x = index * chunkWidth

            const confidence =
              insight.confidence ?? 0

            const payloadOpacity =
              insight.activePayload
                ? 0.1 + confidence * 0.2
                : 0

            const corruptionOpacity =
              insight.corruption > 0.1
                ? 0.06 +
                  insight.corruption * 0.3
                : 0

            const certaintyHeight =
              Math.max(4, confidence * 34)

            return (
              <g
                key={`${insight.row.partNumber ?? 0}-${insight.row.chunkIndex}-${insight.order}`}
              >
                <rect
                  x={x}
                  y={36}
                  width={Math.max(
                    2,
                    chunkWidth - 1,
                  )}
                  height={height - 72}
                  fill="rgba(91,173,190,0.8)"
                  opacity={payloadOpacity}
                />

                <rect
                  x={x}
                  y={36}
                  width={Math.max(
                    2,
                    chunkWidth - 1,
                  )}
                  height={height - 72}
                  fill="rgba(232,116,101,0.9)"
                  opacity={corruptionOpacity}
                />

                <rect
                  x={x + 1}
                  y={
                    height -
                    46 -
                    certaintyHeight
                  }
                  width={Math.max(
                    2,
                    chunkWidth - 3,
                  )}
                  height={certaintyHeight}
                  fill={metricColor(
                    insight.tone,
                  )}
                  opacity={0.72}
                />

                <line
                  x1={x}
                  x2={x}
                  y1={34}
                  y2={height - 28}
                  stroke="rgb(var(--aura-border) / 0.13)"
                />

                {insight.row
                  .correctionApplied ||
                insight.row
                  .correctionCount > 0 ? (
                  <line
                    x1={x + chunkWidth / 2}
                    x2={x + chunkWidth / 2}
                    y1={40}
                    y2={height - 34}
                    stroke="rgba(232,116,101,0.78)"
                    strokeDasharray="4 6"
                  />
                ) : null}
              </g>
            )
          },
        )}

        <path
          d={path}
          fill="none"
          stroke="url(#analysisWaveStroke)"
          strokeWidth={
            points.length ? 2 : 1
          }
          strokeLinejoin="round"
        />

        {points.length ? (
          <path
            d={`${path} L ${width} ${baseline} L 0 ${baseline} Z`}
            fill="rgba(91,173,190,0.06)"
          />
        ) : null}

        {playbackRatio > 0 ? (
          <line
            x1={playbackRatio * width}
            x2={playbackRatio * width}
            y1={28}
            y2={height - 20}
            stroke="rgb(var(--aura-text) / 0.72)"
            strokeWidth={1.3}
          />
        ) : null}

        {hoverIndex != null &&
        chunkInsights.length ? (
          <line
            x1={
              ((hoverIndex + 0.5) /
                chunkInsights.length) *
              width
            }
            x2={
              ((hoverIndex + 0.5) /
                chunkInsights.length) *
              width
            }
            y1={26}
            y2={height - 18}
            stroke="rgb(var(--aura-text) / 0.48)"
          />
        ) : null}
      </svg>

      {!points.length ? (
        <div className="pointer-events-none absolute inset-x-6 top-16 rounded-[12px] border border-dashed border-aura-border/12 bg-aura-bg/24 px-4 py-3 text-sm text-aura-muted">
          Amplitude samples were not emitted
          for this target. Chunk overlays
          remain available when diagnostics
          exist.
        </div>
      ) : null}

      {hoverInsight ? (
        <div className="aura-tooltip-card pointer-events-none absolute bottom-4 left-4 z-20 w-[min(330px,calc(100%-2rem))] rounded-[14px] px-3 py-3 font-mono text-[11px] text-aura-muted">
          <div className="flex items-center justify-between gap-3">
            <div className="text-aura-text">
              Chunk{' '}
              {
                hoverInsight.row
                  .chunkIndex
              }
            </div>

            <OutcomeBadge
              tone={hoverInsight.tone}
            >
              {formatRoleLabel(
                hoverInsight.role,
              )}
            </OutcomeBadge>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1">
            <span>confidence</span>

            <span className="text-aura-text">
              {formatPercentValue(
                hoverInsight.confidence,
              )}
            </span>

            <span>bit recovery</span>

            <span className="text-aura-text">
              {formatPercentValue(
                hoverInsight.bitAccuracy,
              )}
            </span>

            <span>corruption</span>

            <span className="text-aura-text">
              {formatPercentValue(
                hoverInsight.corruption,
              )}
            </span>

            <span>SNR</span>

            <span className="text-aura-text">
              {formatSnr(
                hoverInsight.row.snrDb,
              )}
            </span>

            <span>ECC</span>

            <span className="text-aura-text">
              {
                hoverInsight.row
                  .correctionCount
              }
            </span>

            <span>status</span>

            <span className="truncate text-aura-text">
              {hoverInsight.row.status ||
                'unknown'}
            </span>
          </div>
        </div>
      ) : null}
    </div>
  )
}