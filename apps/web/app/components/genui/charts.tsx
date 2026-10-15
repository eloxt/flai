import { useState } from "react"

const COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"]
export const seriesColor = (i: number) => COLORS[i % COLORS.length]!

interface Series {
  name: string
  values: number[]
}

/** Props arrive incrementally while the model streams; drop incomplete entries. */
export function cleanSeries(series: unknown): Series[] {
  if (!Array.isArray(series)) return []
  return series
    .filter((s): s is { name?: unknown; values?: unknown } => Boolean(s) && typeof s === "object")
    .map((s) => ({
      name: typeof s.name === "string" ? s.name : "",
      values: Array.isArray(s.values) ? s.values.map((v) => (typeof v === "number" && Number.isFinite(v) ? v : 0)) : [],
    }))
}

export function cleanSlices(slices: unknown): { label: string; value: number }[] {
  if (!Array.isArray(slices)) return []
  return slices
    .filter((s): s is { label?: unknown; value?: unknown } => Boolean(s) && typeof s === "object")
    .map((s) => ({ label: typeof s.label === "string" ? s.label : "", value: typeof s.value === "number" ? s.value : 0 }))
}

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.map((x) => String(x ?? "")) : [])
export { strings as cleanLabels }

const fmt = (n: number) => (Math.abs(n) >= 1000 ? Intl.NumberFormat(undefined, { notation: "compact" }).format(n) : String(Math.round(n * 100) / 100))

function niceMax(max: number) {
  if (max <= 0) return 1
  const pow = 10 ** Math.floor(Math.log10(max))
  return Math.ceil(max / pow) * pow
}

function Legend({ names }: { names: string[] }) {
  if (names.length < 2) return null
  return (
    <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
      {names.map((name, i) => (
        <span key={name + i} className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm" style={{ background: seriesColor(i) }} />
          {name}
        </span>
      ))}
    </div>
  )
}

const W = 560
const H = 240
const PAD = { top: 12, right: 12, bottom: 28, left: 40 }

function Axes({ max, labels, x }: { max: number; labels: string[]; x: (i: number) => number }) {
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * max)
  const y = (v: number) => PAD.top + (H - PAD.top - PAD.bottom) * (1 - v / max)
  const step = Math.max(1, Math.ceil(labels.length / 8))
  return (
    <g className="text-[10px] fill-muted-foreground">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} className="stroke-border" strokeDasharray="3 3" />
          <text x={PAD.left - 6} y={y(t)} textAnchor="end" dominantBaseline="middle">
            {fmt(t)}
          </text>
        </g>
      ))}
      {labels.map((label, i) =>
        i % step === 0 ? (
          <text key={i} x={x(i)} y={H - 8} textAnchor="middle">
            {label.length > 12 ? `${label.slice(0, 11)}…` : label}
          </text>
        ) : null
      )}
    </g>
  )
}

export function BarChartView({ labels, series, stacked }: { labels: string[]; series: Series[]; stacked?: boolean }) {
  const [hover, setHover] = useState<number | null>(null)
  const totals = labels.map((_, i) => series.reduce((s, ser) => s + Math.max(0, ser.values[i] ?? 0), 0))
  const max = niceMax(stacked ? Math.max(0, ...totals) : Math.max(0, ...series.flatMap((s) => s.values)))
  const band = (W - PAD.left - PAD.right) / Math.max(1, labels.length)
  const x = (i: number) => PAD.left + band * i + band / 2
  const h = (v: number) => ((H - PAD.top - PAD.bottom) * Math.max(0, v)) / max
  const barW = stacked ? band * 0.6 : (band * 0.8) / Math.max(1, series.length)

  return (
    <figure className="flex flex-col gap-2">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" onMouseLeave={() => setHover(null)}>
        <Axes max={max} labels={labels} x={x} />
        {labels.map((label, i) => {
          let offset = 0
          return (
            <g key={i} onMouseEnter={() => setHover(i)}>
              <rect x={x(i) - band / 2} y={PAD.top} width={band} height={H - PAD.top - PAD.bottom} className={hover === i ? "fill-muted/60" : "fill-transparent"} />
              {series.map((s, j) => {
                const v = s.values[i] ?? 0
                const bh = h(v)
                const bx = stacked ? x(i) - barW / 2 : x(i) - (barW * series.length) / 2 + barW * j
                const by = H - PAD.bottom - bh - (stacked ? offset : 0)
                if (stacked) offset += bh
                return <rect key={j} x={bx} y={by} width={Math.max(1, barW - 2)} height={bh} rx={2} fill={seriesColor(j)}>
                  <title>{`${label} · ${s.name}: ${v}`}</title>
                </rect>
              })}
            </g>
          )
        })}
      </svg>
      <Legend names={series.map((s) => s.name)} />
    </figure>
  )
}

export function LineChartView({ labels, series }: { labels: string[]; series: Series[] }) {
  const max = niceMax(Math.max(0, ...series.flatMap((s) => s.values)))
  const span = W - PAD.left - PAD.right
  const x = (i: number) => PAD.left + (labels.length <= 1 ? span / 2 : (span * i) / (labels.length - 1))
  const y = (v: number) => PAD.top + (H - PAD.top - PAD.bottom) * (1 - Math.max(0, v) / max)
  return (
    <figure className="flex flex-col gap-2">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img">
        <Axes max={max} labels={labels} x={x} />
        {series.map((s, j) => (
          <g key={j}>
            <polyline
              fill="none"
              stroke={seriesColor(j)}
              strokeWidth={2}
              strokeLinejoin="round"
              points={s.values.map((v, i) => `${x(i)},${y(v)}`).join(" ")}
            />
            {s.values.map((v, i) => (
              <circle key={i} cx={x(i)} cy={y(v)} r={3} fill={seriesColor(j)}>
                <title>{`${labels[i] ?? ""} · ${s.name}: ${v}`}</title>
              </circle>
            ))}
          </g>
        ))}
      </svg>
      <Legend names={series.map((s) => s.name)} />
    </figure>
  )
}

export function PieChartView({ slices }: { slices: { label: string; value: number }[] }) {
  const total = slices.reduce((s, x) => s + Math.max(0, x.value), 0) || 1
  let angle = -Math.PI / 2
  const r = 80
  const c = 100
  return (
    <figure className="flex flex-wrap items-center gap-4">
      <svg viewBox="0 0 200 200" className="size-44 shrink-0" role="img">
        {slices.map((s, i) => {
          const sweep = (Math.max(0, s.value) / total) * Math.PI * 2
          const start = angle
          angle += sweep
          if (sweep >= Math.PI * 2 - 1e-6) return <circle key={i} cx={c} cy={c} r={r} fill={seriesColor(i)} />
          const large = sweep > Math.PI ? 1 : 0
          const d = `M${c},${c} L${c + r * Math.cos(start)},${c + r * Math.sin(start)} A${r},${r} 0 ${large} 1 ${c + r * Math.cos(angle)},${c + r * Math.sin(angle)} Z`
          return (
            <path key={i} d={d} fill={seriesColor(i)} className="stroke-background" strokeWidth={1.5}>
              <title>{`${s.label}: ${s.value}`}</title>
            </path>
          )
        })}
      </svg>
      <ul className="flex flex-col gap-1 text-sm">
        {slices.map((s, i) => (
          <li key={i} className="flex items-center gap-2">
            <span className="size-2.5 rounded-sm" style={{ background: seriesColor(i) }} />
            <span>{s.label}</span>
            <span className="text-muted-foreground tabular-nums">{Math.round((Math.max(0, s.value) / total) * 1000) / 10}%</span>
          </li>
        ))}
      </ul>
    </figure>
  )
}
