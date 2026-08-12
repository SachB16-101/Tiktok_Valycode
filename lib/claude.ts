import Anthropic from "@anthropic-ai/sdk";
import { archetypeDescription, archetypeLabel } from "./hooks";
import { formatCount, formatPercent } from "./metrics";
import { confidenceLabel } from "./patterns";
import type { EnrichedPost, HookIdea, PatternFinding, SlideshowPlan } from "./types";

export const MODEL = "claude-opus-5";

export function hasApiKey(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

function client(): Anthropic {
  // Zero-arg constructor resolves ANTHROPIC_API_KEY, ANTHROPIC_AUTH_TOKEN, or
  // an `ant auth login` profile — all three work without code changes.
  return new Anthropic();
}

/**
 * The evidence pack. Everything the model is allowed to reason from is
 * assembled here from the user's own measured data, so every claim it makes
 * about "why this will work" is traceable to a number in their account.
 */
export function buildEvidenceBrief(
  posts: EnrichedPost[],
  findings: PatternFinding[],
  topN = 12,
): string {
  const lines: string[] = [];

  const winners = [...posts]
    .sort((a, b) => (b.metrics.outlierMultiple ?? 0) - (a.metrics.outlierMultiple ?? 0))
    .slice(0, topN);

  lines.push("## Top performing posts (measured against this account's own median)");
  for (const post of winners) {
    const parts = [
      `id=${post.id}`,
      `${formatCount(post.views)} views`,
      post.metrics.outlierMultiple
        ? `${post.metrics.outlierMultiple.toFixed(1)}x account median`
        : null,
      `engagement ${formatPercent(post.metrics.engagementRate, 2)}`,
      post.format !== "unknown" ? post.format : null,
      post.slideCount ? `${post.slideCount} slides` : null,
      post.soundName ? `sound: ${post.soundName}` : null,
    ].filter(Boolean);
    lines.push(`- [${parts.join(" | ")}]`);
    lines.push(`  hook: "${post.hook || "(none)"}"`);
    lines.push(
      `  hook types: ${post.hookArchetypes.map(archetypeLabel).join(", ")} | hashtags: ${
        post.hashtags.slice(0, 8).map((h) => `#${h}`).join(" ") || "none"
      }`,
    );
  }

  const positives = findings.filter((f) => f.lift > 1 && f.pValue <= 0.15).slice(0, 20);
  if (positives.length) {
    lines.push("");
    lines.push("## Measured lifts (feature vs. every other post in the account)");
    for (const finding of positives) {
      lines.push(
        `- ${finding.label} (${finding.dimension}): ${finding.lift.toFixed(2)}x lift, ` +
          `n=${finding.n}, p=${finding.pValue.toFixed(3)}, ` +
          `confidence ${confidenceLabel(finding.pValue, finding.n)}, ` +
          `median ${formatCount(finding.medianViews)} views`,
      );
    }
  }

  const negatives = findings.filter((f) => f.lift < 0.85 && f.pValue <= 0.15).slice(0, 8);
  if (negatives.length) {
    lines.push("");
    lines.push("## Measured drags (features that under-perform for this account)");
    for (const finding of negatives) {
      lines.push(
        `- ${finding.label} (${finding.dimension}): ${finding.lift.toFixed(2)}x, n=${finding.n}, p=${finding.pValue.toFixed(3)}`,
      );
    }
  }

  const archetypes = new Set(findings.filter((f) => f.dimension === "hookArchetype").map((f) => f.value));
  if (archetypes.size) {
    lines.push("");
    lines.push("## Hook archetype reference");
    for (const id of archetypes) {
      lines.push(`- ${archetypeLabel(id)}: ${archetypeDescription(id)}`);
    }
  }

  return lines.join("\n");
}

const IDEAS_SCHEMA = {
  type: "object",
  properties: {
    ideas: {
      type: "array",
      items: {
        type: "object",
        properties: {
          hook: { type: "string" },
          format: { type: "string" },
          angle: { type: "string" },
          rationale: { type: "string" },
          evidence: { type: "array", items: { type: "string" } },
          suggestedSounds: { type: "array", items: { type: "string" } },
          suggestedHashtags: { type: "array", items: { type: "string" } },
          confidence: { type: "integer" },
        },
        required: [
          "hook",
          "format",
          "angle",
          "rationale",
          "evidence",
          "suggestedSounds",
          "suggestedHashtags",
          "confidence",
        ],
        additionalProperties: false,
      },
    },
  },
  required: ["ideas"],
  additionalProperties: false,
} as const;

const IDEAS_SYSTEM = `You are a short-form content strategist working from one creator's own measured TikTok performance data.

Your job is to propose hooks with the highest chance of travelling for THIS account specifically.

Rules that matter:
- Ground every recommendation in the supplied evidence. When you claim something will work, name the measured lift, the sample size, or the specific post id that supports it.
- Never invent a statistic. If the evidence does not support a claim, say what you are extrapolating from instead.
- A hook is the first line a viewer reads — for a slideshow, the text on slide one. Write hooks that can be read in under two seconds and that create a reason to swipe.
- Prefer hook archetypes that measurably over-perform in the data over ones that are merely fashionable.
- Vary the archetypes across your ideas. Do not return five variations of the same opening.
- Be specific to the account's actual subject matter, drawn from its existing captions and hashtags. Generic advice is worthless here.
- 'confidence' is your honest 0-100 read of viral potential given the evidence strength, not a sales pitch.
- Keep rationale to two or three sentences. Lead with the mechanism, not a preamble.`;

export async function generateIdeas(
  brief: string,
  count: number,
  steer: string | null,
): Promise<HookIdea[]> {
  const response = await client().messages.create({
    model: MODEL,
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    output_config: {
      effort: "high",
      format: { type: "json_schema", schema: IDEAS_SCHEMA },
    },
    system: IDEAS_SYSTEM,
    messages: [
      {
        role: "user",
        content: `Here is the measured performance data for this account:

${brief}

Generate exactly ${count} distinct hook ideas with the highest viral potential for this account.${
          steer ? `\n\nThe creator has asked you to focus on: ${steer}` : ""
        }`,
      },
    ],
  });

  if (response.stop_reason === "refusal") {
    throw new Error("The request was declined. Try rephrasing your focus note.");
  }

  const text = response.content.find((block) => block.type === "text");
  if (!text || text.type !== "text") throw new Error("No response content returned");

  const parsed = JSON.parse(text.text) as { ideas: HookIdea[] };
  return parsed.ideas;
}

const SLIDESHOW_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    hook: { type: "string" },
    slides: {
      type: "array",
      items: {
        type: "object",
        properties: {
          index: { type: "integer" },
          onImageText: { type: "string" },
          subText: { type: ["string", "null"] },
          imageBrief: { type: "string" },
          purpose: { type: "string" },
        },
        required: ["index", "onImageText", "subText", "imageBrief", "purpose"],
        additionalProperties: false,
      },
    },
    caption: { type: "string" },
    hashtags: { type: "array", items: { type: "string" } },
    soundSuggestion: { type: "string" },
    strategy: { type: "string" },
  },
  required: ["title", "hook", "slides", "caption", "hashtags", "soundSuggestion", "strategy"],
  additionalProperties: false,
} as const;

const SLIDESHOW_SYSTEM = `You build TikTok slideshow posts, slide by slide, for one specific creator using their own measured performance data.

How a slideshow earns distribution:
- Slide 1 is the whole ballgame. It must stop the scroll and create an open loop. Six to ten words maximum, readable at a glance.
- Every middle slide must both pay off the previous slide and open the next one. A slide that resolves everything ends the swipe.
- The final slide converts attention: a save-worthy summary, a question that earns comments, or a clear next step. Not a limp "follow for more".
- Text burned on the image should be short. Long text belongs in the caption.

For each slide produce:
- onImageText: the exact words to burn onto the image. Short, punchy, no hashtags.
- subText: an optional smaller supporting line, or null when the slide is stronger without one.
- imageBrief: a concrete, shootable description of the picture — subject, framing, mood, colour. Specific enough that the creator can shoot it or find it in a stock library today. Never vague.
- purpose: one sentence on why this slide sits at this point in the sequence.

Rules:
- Match the creator's existing subject matter and voice, inferred from their captions.
- Use the measured evidence to choose slide count, hook archetype, and hashtags. Name your reasoning in 'strategy'.
- Never invent statistics about the creator's performance.`;

export async function generateSlideshow(
  brief: string,
  hook: string,
  notes: string | null,
  slideCount: number,
): Promise<SlideshowPlan> {
  const response = await client().messages.create({
    model: MODEL,
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    output_config: {
      effort: "high",
      format: { type: "json_schema", schema: SLIDESHOW_SCHEMA },
    },
    system: SLIDESHOW_SYSTEM,
    messages: [
      {
        role: "user",
        content: `Measured performance data for this account:

${brief}

Build a complete slideshow post, slide by slide, built around this hook:

"${hook}"

Target roughly ${slideCount} slides — deviate if the content genuinely needs more or fewer, and say why in 'strategy'.${
          notes ? `\n\nAdditional direction from the creator: ${notes}` : ""
        }`,
      },
    ],
  });

  if (response.stop_reason === "refusal") {
    throw new Error("The request was declined. Try rephrasing your hook or notes.");
  }

  const text = response.content.find((block) => block.type === "text");
  if (!text || text.type !== "text") throw new Error("No response content returned");

  return JSON.parse(text.text) as SlideshowPlan;
}
