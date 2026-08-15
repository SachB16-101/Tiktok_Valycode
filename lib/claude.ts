import Anthropic from "@anthropic-ai/sdk";
import { archetypeDescription, archetypeLabel } from "./hooks";
import { formatCount, formatPercent } from "./metrics";
import { confidenceLabel } from "./patterns";
import type {
  CommentInsights,
  EnrichedPost,
  HookIdea,
  PatternFinding,
  SlideshowPlan,
} from "./types";
import type {
  AgeBiasReport,
  ConfoundPair,
  DiagnosisSummary,
  ReplicatedFinding,
} from "./diagnose";

export const MODEL = "claude-opus-5";

export function hasApiKey(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

function client(): Anthropic {
  // Zero-arg constructor resolves ANTHROPIC_API_KEY, ANTHROPIC_AUTH_TOKEN, or
  // an `ant auth login` profile, all three work without code changes.
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
  extras?: {
    insights?: CommentInsights | null;
    replicated?: ReplicatedFinding[];
    diagnosis?: DiagnosisSummary | null;
    confounds?: ConfoundPair[];
    ageBias?: AgeBiasReport | null;
  },
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

  // Replication across independent accounts is the strongest evidence class in
  // the dataset, so it is stated before anything single-account.
  if (extras?.replicated?.length) {
    lines.push("");
    lines.push("## Replicated across accounts (strongest evidence, these held independently)");
    for (const item of extras.replicated.slice(0, 10)) {
      const detail = item.accounts
        .map((a) => `${a.account} ${a.lift.toFixed(2)}x (n=${a.n})`)
        .join(", ");
      lines.push(
        `- ${item.label} ${item.direction}: ${detail}. Weakest contributing account ${item.weakestLift.toFixed(2)}x, ` +
          "judge the strength of this replication on that figure, not the largest one.",
      );
    }
  }

  if (extras?.confounds?.length) {
    lines.push("");
    lines.push("## Confounded pairs, do NOT treat these as separate effects");
    for (const pair of extras.confounds.slice(0, 6)) {
      lines.push(
        `- "${pair.a.label}" and "${pair.b.label}" sit on ${Math.round(pair.overlap * 100)}% the same posts. ` +
          "They are probably one effect; attribute to one, not both.",
      );
    }
  }

  if (extras?.diagnosis) {
    lines.push("");
    lines.push("## Where this account is losing");
    lines.push(extras.diagnosis.headline);
    const c = extras.diagnosis.counts;
    lines.push(
      `Counts, reached and resonated: ${c.winner}; good content few saw: ${c["distribution-failure"]}; ` +
        `reached then lost them: ${c["content-failure"]}; neither: ${c.underperformer}.`,
    );
  }

  if (extras?.ageBias?.material) {
    lines.push("");
    lines.push("## Caveat on post age");
    lines.push(extras.ageBias.note);
  }

  // Comments are the only place demand is measured rather than inferred.
  if (extras?.insights?.commentCount) {
    const insights = extras.insights;
    lines.push("");
    lines.push("## What the audience is asking for (from comments, demand already proven)");
    for (const signal of insights.demandSignals.slice(0, 20)) {
      lines.push(
        `- [${signal.likes} likes, ${signal.replyCount} replies] "${signal.text}"` +
          (signal.postHook ? `, asked on: "${signal.postHook}"` : ""),
      );
    }

    if (insights.vocabulary.length) {
      lines.push("");
      lines.push("## The audience's own vocabulary (words they use that the creator rarely does)");
      lines.push(
        insights.vocabulary
          .slice(0, 18)
          .map((v) => `${v.term} (${v.audienceCount}x them / ${v.creatorCount}x creator)`)
          .join(", "),
      );
      lines.push(
        "Write hooks in these words where it fits naturally. People search and think in their own " +
          "vocabulary, not the creator's.",
      );
    }

    lines.push("");
    lines.push(
      `Comment mix: ${formatPercent(insights.questionRate, 0)} asking for something, ` +
        `${formatPercent(insights.tagRate, 0)} tagging a friend, ` +
        `${formatPercent(insights.objectionRate, 0)} pushing back.`,
    );
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
- A hook is the first line a viewer reads, for a slideshow, the text on slide one. Write hooks that can be read in under two seconds and that create a reason to swipe.
- Prefer hook archetypes that measurably over-perform in the data over ones that are merely fashionable.
- Evidence is not all equal. Rank it: replicated across accounts > large-sample single-account lift > small-sample lift > your own judgement. Say which tier you are relying on.
- If the brief flags two findings as confounded, do not cite both as independent reasons.
- Where the audience asked a question directly, that is the strongest possible signal, a hook answering a highly-liked question beats one extrapolated from metrics. Lead with those.
- Use the audience's own vocabulary where it fits naturally.
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
- imageBrief: a concrete, shootable description of the picture, subject, framing, mood, colour. Specific enough that the creator can shoot it or find it in a stock library today. Never vague.
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

Target roughly ${slideCount} slides, deviate if the content genuinely needs more or fewer, and say why in 'strategy'.${
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
