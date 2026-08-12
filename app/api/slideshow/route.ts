import { NextResponse } from "next/server";
import { buildEvidenceBrief, generateSlideshow, hasApiKey } from "@/lib/claude";
import { fallbackSlideshow } from "@/lib/fallback";
import { enrich } from "@/lib/metrics";
import { minePatterns } from "@/lib/patterns";
import { loadDataset, saveArtifact } from "@/lib/store";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  const dataset = await loadDataset();
  if (!dataset) {
    return NextResponse.json({ error: "No data loaded. Import your JSON first." }, { status: 400 });
  }

  const {
    hook,
    notes = null,
    slideCount = 7,
  } = (await request.json()) as { hook?: string; notes?: string | null; slideCount?: number };

  if (!hook?.trim()) {
    return NextResponse.json({ error: "A hook is required" }, { status: 400 });
  }

  const posts = enrich(dataset.posts);
  const findings = minePatterns(posts);
  const target = Math.max(3, Math.min(15, slideCount));

  if (!hasApiKey()) {
    return NextResponse.json({
      plan: fallbackSlideshow(posts, findings, hook, target),
      source: "fallback",
      note: "Set ANTHROPIC_API_KEY to have Claude write the slide copy and image briefs.",
    });
  }

  try {
    const brief = buildEvidenceBrief(posts, findings);
    const plan = await generateSlideshow(brief, hook, notes, target);
    await saveArtifact(`slideshow-${Date.now()}`, plan);
    return NextResponse.json({ plan, source: "claude" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Generation failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
