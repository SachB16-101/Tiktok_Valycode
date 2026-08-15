"use client";

import { useId, useState } from "react";

/**
 * Hand-drawn SVG charts. Marks follow fixed specs: bars capped at 20px with a
 * 4px rounded data end squared at the baseline, hairline gridlines that stay
 * recessive, numerals in mono, and text in ink tokens rather than the series
 * colour. Every mark carries a hover tooltip.
 */

const BAR_THICKNESS = 20;
const BAR_GAP = 12;

export interface BarDatum {
  label: string;
  value: number;
  detail?: string;
  tone?: "lift" | "drag" | "neutral";
}

interface HorizontalBarsProps {
  data: BarDatum[];
  format: (value: number) => string;
  /** Reference line, e.g. 1.0x for no effect. */
  baseline?: number;
  labelWidth?: number;
}

export function HorizontalBars({ data, format, baseline, labelWidth = 200 }: HorizontalBarsProps) {
  const [hover, setHover] = useState<number | null>(null);
  const clipId = useId();

  if (!data.length) {
    return (
      <p className="muted py-8 text-center text-sm">Not enough data to chart this yet.</p>
    );
  }

  const plotWidth = 400;
  const valueGutter = 76;
  const width = labelWidth + plotWidth + valueGutter;
  const rowHeight = BAR_THICKNESS + BAR_GAP;
  const height = data.length * rowHeight + 26;

  const values = data.map((d) => d.value);

  // One extreme value would flatten every other bar to a stub, so the domain is
  // capped near the bulk of the data and outliers run to the edge. Their true
  // value still rides the bar as a label, so nothing is hidden.
  const sorted = [...values].sort((a, b) => a - b);
  const p90 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.9))];
  const rawMax = Math.max(...values, baseline ?? 0);
  const softMax = Math.max(p90 * 1.35, (baseline ?? 1) * 2);
  const capped = rawMax > softMax * 1.6;
  const max = (capped ? softMax : rawMax) * 1.05;
  const span = max || 1;

  const x = (value: number) => labelWidth + (Math.min(Math.max(value, 0), max) / span) * plotWidth;
  const ticks = [0, max / 2, max];

  return (
    <div className="relative">
      <div className="scroll-x">
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label="Bar chart"
          style={{ maxWidth: "100%", minWidth: width }}
        >
          <defs>
            <clipPath id={clipId}>
              <rect x={labelWidth} y={0} width={plotWidth + 4} height={height} />
            </clipPath>
          </defs>

          {ticks.map((tick, i) => {
            const collides = baseline !== undefined && Math.abs(x(tick) - x(baseline)) < 36;
            return (
              <g key={i}>
                <line
                  x1={x(tick)}
                  y1={2}
                  x2={x(tick)}
                  y2={height - 22}
                  stroke="var(--line)"
                  strokeWidth={1}
                />
                {!collides && (
                  <text
                    x={x(tick)}
                    y={height - 7}
                    textAnchor="middle"
                    fontSize={10.5}
                    fill="var(--text-muted)"
                    className="numeric"
                  >
                    {format(tick)}
                  </text>
                )}
              </g>
            );
          })}

          {/* The reference line carries meaning, so it reads a step stronger
              than the ordinary gridlines and gets a label. */}
          {baseline !== undefined && (
            <>
              <line
                x1={x(baseline)}
                y1={0}
                x2={x(baseline)}
                y2={height - 22}
                stroke="var(--line-strong)"
                strokeWidth={1}
              />
              <text
                x={x(baseline)}
                y={height - 7}
                textAnchor="middle"
                fontSize={10.5}
                fill="var(--text-secondary)"
                className="numeric"
              >
                {format(baseline)}
              </text>
            </>
          )}

          {data.map((datum, i) => {
            const y = i * rowHeight + 4;
            const barWidth = Math.max(2, x(datum.value) - x(0));
            const tone =
              datum.tone === "drag"
                ? "var(--data-drag)"
                : datum.tone === "neutral"
                  ? "var(--data-neutral)"
                  : "var(--data-lift)";

            const r = 4;
            const bx = x(0);
            const path = `M ${bx} ${y} H ${bx + barWidth - r} A ${r} ${r} 0 0 1 ${bx + barWidth} ${y + r} V ${y + BAR_THICKNESS - r} A ${r} ${r} 0 0 1 ${bx + barWidth - r} ${y + BAR_THICKNESS} H ${bx} Z`;
            const overflows = datum.value > max;
            const focused = hover === null || hover === i;

            return (
              <g
                key={`${datum.label}-${i}`}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
              >
                <rect x={0} y={y - BAR_GAP / 2} width={width} height={rowHeight} fill="transparent" />
                <text
                  x={labelWidth - 14}
                  y={y + BAR_THICKNESS / 2 + 4}
                  textAnchor="end"
                  fontSize={12.5}
                  fill={hover === i ? "var(--text-primary)" : "var(--text-secondary)"}
                  style={{ transition: "fill 0.15s ease" }}
                >
                  {truncate(datum.label, 28)}
                </text>
                <g clipPath={`url(#${clipId})`}>
                  <path
                    d={path}
                    fill={tone}
                    opacity={focused ? 1 : 0.42}
                    style={{ transition: "opacity 0.15s ease" }}
                  />
                </g>
                {overflows && (
                  <text
                    x={bx + barWidth + 4}
                    y={y + BAR_THICKNESS / 2 + 4}
                    fontSize={11}
                    fill={tone}
                    aria-hidden="true"
                  >
                    ▸
                  </text>
                )}
                <text
                  x={bx + barWidth + (overflows ? 20 : 10)}
                  y={y + BAR_THICKNESS / 2 + 4}
                  fontSize={12}
                  fill="var(--text-secondary)"
                  className="numeric"
                >
                  {format(datum.value)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {capped && (
        <p className="muted mt-3 text-xs">
          The arrow marks a bar running past the axis. One extreme value would otherwise flatten
          the rest. Numbers beside each bar are always the true value.
        </p>
      )}

      {hover !== null && data[hover].detail && (
        <div
          className="panel-raised pointer-events-none absolute left-0 z-10 px-3 py-2 text-xs"
          style={{ top: hover * rowHeight + 34, maxWidth: 340 }}
        >
          <div className="font-medium">{data[hover].label}</div>
          <div className="muted mt-1">{data[hover].detail}</div>
        </div>
      )}
    </div>
  );
}

/**
 * A metric with no container. Cards are reserved for things that genuinely sit
 * on their own plane; a row of numbers reads better separated by rule and space.
 */
export function Stat({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="py-1">
      <div className="muted text-[11.5px] font-medium">{label}</div>
      <div className="numeric mt-1.5 text-[25px] leading-none font-medium tracking-[-0.02em]">
        {value}
      </div>
      {detail && <div className="muted mt-1.5 text-[11.5px]">{detail}</div>}
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
    <div>
      <div className="muted text-[11.5px] font-medium">{label}</div>
      <div className="numeric mt-3 text-[64px] leading-[0.9] font-medium tracking-[-0.045em]">
        {value}
      </div>
      {sub && <p className="secondary mt-4 max-w-[42ch] text-[13.5px] leading-relaxed">{sub}</p>}
    </div>
  );
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}
