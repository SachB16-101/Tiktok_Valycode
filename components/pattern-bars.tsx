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
 * Lift is a diverging measure around 1.0, so the bars use the two data
 * semantics with a reference line at the neutral point. The colours here are
 * validated for colour vision deficiency; they are data encoding, not brand.
 */
export function PatternBars({ findings }: { findings: PatternFinding[] }) {
  if (!findings.length) {
    return (
      <p className="secondary max-w-[62ch] text-[13.5px] leading-relaxed">
        Nothing here clears significance yet. That usually means the dataset is small. Patterns
        start separating from noise at around 30 posts per account.
      </p>
    );
  }

  // Findings arrive ranked by reliability. Within the chart, order by the number
  // printed on each bar so the bars read monotonically.
  const ordered = [...findings].sort((a, b) => b.lift - a.lift);

  const data: BarDatum[] = ordered.map((finding) => ({
    label: `${DIMENSION_LABELS[finding.dimension] ?? finding.dimension}: ${finding.label}`,
    value: finding.lift,
    tone: finding.lift >= 1 ? "lift" : "drag",
    detail: `${finding.n} posts, median ${formatCount(finding.medianViews)} views. ${confidenceLabel(
      finding.pValue,
      finding.n,
    )} confidence at p = ${finding.pValue.toFixed(3)}.`,
  }));

  const hasLift = ordered.some((f) => f.lift >= 1);
  const hasDrag = ordered.some((f) => f.lift < 1);

  return (
    <>
      <HorizontalBars data={data} format={(v) => `${v.toFixed(2)}×`} baseline={1} labelWidth={210} />
      <div className="muted mt-4 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[11.5px]">
        {hasLift && <Key color="var(--data-lift)" label="Over-performs" />}
        {hasDrag && <Key color="var(--data-drag)" label="Under-performs" />}
        <span>Reference line at 1.00× is no measurable effect</span>
      </div>
    </>
  );
}

function Key({ color, label }: { color: string; label: string }) {
  return (
    <span className="secondary flex items-center gap-2">
      <span
        aria-hidden="true"
        className="inline-block h-2 w-2.5 rounded-[2px]"
        style={{ background: color }}
      />
      {label}
    </span>
  );
}
