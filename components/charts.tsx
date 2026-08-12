"use client";

import { useId, useState } from "react";

/**
 * Hand-rolled SVG charts. All marks follow the same specs: ≤24px bars with a
 * 4px rounded data-end squared at the baseline, hairline recessive gridlines,
 * text in ink tokens rather than the series color, and a hover tooltip on
 * every mark.
 */

const BAR_THICKNESS = 22;
const BAR_GAP = 10;

export interface BarDatum {
  label: string;
  value: number;
  /** Shown in the tooltip under the value. */
  detail?: string;
  /** Overrides the default single-hue fill. */
  tone?: "lift" | "drag" | "neutral";
}

interface HorizontalBarsProps {
  data: BarDatum[];
  /** Formats the value for the direct label and tooltip. */
  format: (value: number) => string;
  /** Draws a reference line at this value — e.g. 1.0x for "no effect". */
  baseline?: number;
  labelWidth?: number;
  /** When set, bars diverge left/right of `baseline` instead of growing from 0. */
  diverging?: boolean;
}

export function HorizontalBars({
  data,
  format,
  baseline,
  labelWidth = 170,
  diverging = false,
}: HorizontalBarsProps) {
  const [hover, setHover] = useState<number | null>(null);
  const clipId = useId();

  if (!data.length) {
    return <p className="muted py-6 text-sm">Not enough data to chart yet.</p>;
  }

  const plotWidth = 420;
  const valueGutter = 64;
  const width = labelWidth + plotWidth + valueGutter;
  const rowHeight = BAR_THICKNESS + BAR_GAP;
  const height = data.length * rowHeight + 24;

  const values = data.map((d) => d.value);

  // One extreme value would otherwise flatten every other bar to a stub. Cap
  // the domain around the bulk of the data and let outliers run to the edge;
  // their true value still rides the bar as a direct label, so nothing is lost.
  const sorted = [...values].sort((a, b) => a - b);
  const p90 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.9))];
  const rawMax = Math.max(...values, baseline ?? 0);
  const softMax = Math.max(p90 * 1.35, (baseline ?? 1) * 2);
  const capped = rawMax > softMax * 1.6;
  const max = (capped ? softMax : rawMax) * 1.05;

  const min = diverging ? Math.min(...values, 0) : 0;
  const span = max - min || 1;

  const x = (value: number) =>
    labelWidth + ((Math.min(Math.max(value, min), max) - min) / span) * plotWidth;
  const zeroX = x(diverging ? Math.max(min, 0) : 0);

  const ticks = [min, min + span / 2, max];

  return (
    <div className="scroll-x relative">
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Horizontal bar chart"
        style={{ maxWidth: "100%", minWidth: width }}
      >
        <defs>
          <clipPath id={clipId}>
            <rect x={labelWidth} y={0} width={plotWidth + 4} height={height} />
          </clipPath>
        </defs>

        {ticks.map((tick, i) => {
          // The baseline label wins any collision — it is the one the reader
          // needs. Drop a tick label rather than let the two overlap.
          const collides = baseline !== undefined && Math.abs(x(tick) - x(baseline)) < 34;
          return (
            <g key={i}>
              <line
                x1={x(tick)}
                y1={4}
                x2={x(tick)}
                y2={height - 20}
                stroke="var(--gridline)"
                strokeWidth={1}
              />
              {!collides && (
                <text
                  x={x(tick)}
                  y={height - 6}
                  textAnchor="middle"
                  fontSize={11}
                  fill="var(--text-muted)"
                  style={{ fontVariantNumeric: "tabular-nums" }}
                >
                  {format(tick)}
                </text>
              )}
            </g>
          );
        })}

        {/* The reference line carries meaning, so it gets a label and reads a
            step stronger than the ordinary gridlines. */}
        {baseline !== undefined && (
          <>
            <line
              x1={x(baseline)}
              y1={0}
              x2={x(baseline)}
              y2={height - 20}
              stroke="var(--text-muted)"
              strokeWidth={1}
            />
            <text
              x={x(baseline)}
              y={height - 6}
              textAnchor="middle"
              fontSize={11}
              fontWeight={500}
              fill="var(--text-secondary)"
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              {format(baseline)}
            </text>
          </>
        )}

        {data.map((datum, i) => {
          const y = i * rowHeight + 4;
          const barX = datum.value >= (diverging ? 0 : min) ? zeroX : x(datum.value);
          const barWidth = Math.max(2, Math.abs(x(datum.value) - zeroX));
          const grows = datum.value >= (diverging ? 0 : min);
          const tone =
            datum.tone === "drag"
              ? "var(--drag)"
              : datum.tone === "neutral"
                ? "var(--baseline)"
                : "var(--lift)";

          // 4px rounded data-end, square at the baseline.
          const r = 4;
          const path = grows
            ? `M ${barX} ${y} H ${barX + barWidth - r} A ${r} ${r} 0 0 1 ${barX + barWidth} ${y + r} V ${y + BAR_THICKNESS - r} A ${r} ${r} 0 0 1 ${barX + barWidth - r} ${y + BAR_THICKNESS} H ${barX} Z`
            : `M ${barX + barWidth} ${y} H ${barX + r} A ${r} ${r} 0 0 0 ${barX} ${y + r} V ${y + BAR_THICKNESS - r} A ${r} ${r} 0 0 0 ${barX + r} ${y + BAR_THICKNESS} H ${barX + barWidth} Z`;

          return (
            <g
              key={`${datum.label}-${i}`}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            >
              {/* Hit target spans the full row so hovering is forgiving. */}
              <rect x={0} y={y - BAR_GAP / 2} width={width} height={rowHeight} fill="transparent" />
              <text
                x={labelWidth - 10}
                y={y + BAR_THICKNESS / 2 + 4}
                textAnchor="end"
                fontSize={12}
                fill={hover === i ? "var(--text-primary)" : "var(--text-secondary)"}
              >
                {truncate(datum.label, 26)}
              </text>
              <g clipPath={`url(#${clipId})`}>
                <path d={path} fill={tone} opacity={hover === null || hover === i ? 1 : 0.55} />
              </g>
              {/* Marks a bar whose true value runs past the capped domain. */}
              {datum.value > max && (
                <text
                  x={barX + barWidth + 3}
                  y={y + BAR_THICKNESS / 2 + 4}
                  fontSize={12}
                  fill={tone}
                  aria-hidden="true"
                >
                  ▸
                </text>
              )}
              <text
                x={grows ? barX + barWidth + (datum.value > max ? 20 : 8) : barX - 8}
                y={y + BAR_THICKNESS / 2 + 4}
                textAnchor={grows ? "start" : "end"}
                fontSize={12}
                fill="var(--text-secondary)"
                style={{ fontVariantNumeric: "tabular-nums" }}
              >
                {format(datum.value)}
              </text>
            </g>
          );
        })}
      </svg>

      {capped && (
        <p className="muted mt-2 text-xs">
          ▸ marks a bar running past the axis — one extreme value would otherwise flatten the rest.
          The number beside each bar is always the true value.
        </p>
      )}

      {hover !== null && data[hover].detail && (
        <div
          className="card pointer-events-none absolute left-0 px-3 py-2 text-xs shadow-lg"
          style={{ top: hover * rowHeight + 30, maxWidth: 320 }}
        >
          <div className="font-medium">{data[hover].label}</div>
          <div className="muted mt-0.5">{data[hover].detail}</div>
        </div>
      )}
    </div>
  );
}

export interface StatTileProps {
  label: string;
  value: string;
  detail?: string;
  /** Signed change with a named comparison period. */
  delta?: { text: string; good: boolean };
}

export function StatTile({ label, value, detail, delta }: StatTileProps) {
  return (
    <div className="card px-4 py-3.5">
      <div className="muted text-[11px] font-medium uppercase tracking-wide">{label}</div>
      <div className="mt-1.5 text-[26px] font-semibold leading-none">{value}</div>
      {(detail || delta) && (
        <div className="mt-1.5 flex items-baseline gap-2 text-xs">
          {delta && (
            <span style={{ color: delta.good ? "var(--good)" : "var(--critical)" }}>
              {delta.text}
            </span>
          )}
          {detail && <span className="muted">{detail}</span>}
        </div>
      )}
    </div>
  );
}

/** The single number a view leads with. Exactly one per page. */
export function HeroFigure({
  value,
  label,
  sub,
}: {
  value: string;
  label: string;
  sub?: string;
}) {
  return (
    <div className="card px-6 py-6">
      <div className="muted text-[11px] font-medium uppercase tracking-wide">{label}</div>
      <div className="mt-2 text-[52px] font-semibold leading-none tracking-tight">{value}</div>
      {sub && <div className="secondary mt-2 text-sm">{sub}</div>}
    </div>
  );
}

/** 12-point sparkline for a stat tile. De-emphasised hue, accented endpoint. */
export function Sparkline({ values, width = 96, height = 26 }: { values: number[]; width?: number; height?: number }) {
  if (values.length < 2) return null;

  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const step = width / (values.length - 1);

  const points = values.map((value, i) => [i * step, height - ((value - min) / span) * (height - 6) - 3]);
  const path = points.map(([px, py], i) => `${i === 0 ? "M" : "L"} ${px.toFixed(1)} ${py.toFixed(1)}`).join(" ");
  const [lastX, lastY] = points[points.length - 1];

  return (
    <svg width={width} height={height} aria-hidden="true">
      <path d={path} fill="none" stroke="var(--baseline)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lastX} cy={lastY} r={4} fill="var(--lift)" stroke="var(--surface-1)" strokeWidth={2} />
    </svg>
  );
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}
