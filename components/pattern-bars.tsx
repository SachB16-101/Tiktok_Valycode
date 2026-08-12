"use client";

import { HorizontalBars, type BarDatum } from "./charts";
import { formatCount } from "@/lib/metrics";
import { confidenceLabel } from "@/lib/patterns";
import type { PatternFinding } from "@/lib/types";

const DIMENSION_LABELS: Record<string, string> = {
  hashtag: "Hashtag",
  sound: "Sound",
  format: "Format",
  hookArchetype: "Hook type",
  slideCount: "Slide count",
  captionLength: "Caption length",
  hashtagCount: "Hashtag count",
  duration: "Video length",
  postHour: "Posting hour",
  weekday: "Day of week",
  cta: "Call to action",
  question: "Question",
  originalSound: "Sound origin",
};

/**
 * Lift is a diverging measure around 1.0 — above is a boost, below is a drag —
 * so the bars use the validated blue/red diverging pair with a reference line
 * at the neutral point.
 */
export function PatternBars({ findings }: { findings: PatternFinding[] }) {
  if (!findings.length) {
    return (
      <p className="muted py-4 text-sm">
        No statistically distinguishable patterns yet. This usually means the dataset is small —
        around 30+ posts is where effects start separating from noise.
      </p>
    );
  }

  // Findings arrive ranked by reliability-adjusted lift, which is the right way
  // to choose *which* ones to show. Within the chart, order by the number
  // actually printed on each bar so the bars read monotonically.
  const ordered = [...findings].sort((a, b) => b.lift - a.lift);

  const data: BarDatum[] = ordered.map((finding) => ({
    label: `${DIMENSION_LABELS[finding.dimension] ?? finding.dimension}: ${finding.label}`,
    value: finding.lift,
    tone: finding.lift >= 1 ? "lift" : "drag",
    detail: [
      `${finding.n} posts · median ${formatCount(finding.medianViews)} views`,
      `${confidenceLabel(finding.pValue, finding.n)} confidence (p = ${finding.pValue.toFixed(3)})`,
    ].join(" · "),
  }));

  return (
    <>
      <HorizontalBars
        data={data}
        format={(v) => `${v.toFixed(2)}×`}
        baseline={1}
        labelWidth={210}
      />
      <div className="mt-3 flex flex-wrap gap-4 text-xs">
        {findings.some((f) => f.lift >= 1) && <LegendKey color="var(--lift)" label="Over-performs" />}
        {findings.some((f) => f.lift < 1) && <LegendKey color="var(--drag)" label="Under-performs" />}
        <span className="muted">Reference line at 1.00× = no measurable effect</span>
      </div>
    </>
  );
}

function LegendKey({ color, label }: { color: string; label: string }) {
  return (
    <span className="secondary flex items-center gap-1.5">
      <span
        aria-hidden="true"
        className="inline-block h-2.5 w-2.5 rounded-sm"
        style={{ background: color }}
      />
      {label}
    </span>
  );
}
