import { NextResponse } from "next/server";
import { buildEvidenceBrief, generateIdeas, hasApiKey } from "@/lib/claude";
import { fallbackIdeas } from "@/lib/fallback";
import { analyse } from "@/lib/analysis";
import { loadDataset } from "@/lib/store";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  const dataset = await loadDataset();
  if (!dataset) {
    return NextResponse.json({ error: "No data loaded. Import your JSON first." }, { status: 400 });
  }

  const { count = 8, steer = null } = (await request.json().catch(() => ({}))) as {
    count?: number;
    steer?: string | null;
  };

  const a = analyse(dataset);
  const { posts, findings } = a;
  const requested = Math.max(1, Math.min(10, count));

  if (!hasApiKey()) {
    return NextResponse.json({
      ideas: fallbackIdeas(posts, findings, requested),
      source: "fallback",
      note: "Set ANTHROPIC_API_KEY to have Claude write these from your data instead of using templates.",
    });
  }

  try {
    const brief = buildEvidenceBrief(posts, findings, {
      insights: a.insights,
      replicated: a.replicated,
      diagnosis: a.diagnosisSummary,
      confounds: a.confounds,
      ageBias: a.ageBias,
    });
    const ideas = await generateIdeas(brief, requested, steer);
    return NextResponse.json({ ideas, source: "claude" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Generation failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
