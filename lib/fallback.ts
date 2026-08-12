import { archetypeLabel } from "./hooks";
import { formatCount } from "./metrics";
import { confidenceLabel } from "./patterns";
import type { EnrichedPost, HookIdea, PatternFinding, SlideshowPlan } from "./types";

/**
 * Evidence-only generators used when no Anthropic API key is configured.
 *
 * These do not write new copy — they recombine the account's own winning
 * patterns into templates. Weaker than the model path, but they keep the app
 * useful offline and make the underlying evidence visible, since every
 * suggestion is a literal restatement of a measured lift.
 */

const TEMPLATES: Record<string, (topic: string) => string> = {
  question: (topic) => `What nobody tells you about ${topic}?`,
  listicle: (topic) => `5 things about ${topic} I wish I knew sooner`,
  contrarian: (topic) => `Stop doing ${topic} like this`,
  pov: (topic) => `POV: you finally understand ${topic}`,
  warning: (topic) => `The ${topic} mistake costing you the most`,
  curiosity: (topic) => `The ${topic} thing nobody talks about`,
  socialproof: (topic) => `How ${topic} changed everything for me`,
  transformation: (topic) => `From zero to confident with ${topic}`,
  direct: (topic) => `If you struggle with ${topic}, read this`,
  howto: (topic) => `How to fix ${topic} in one swipe`,
  statement: (topic) => `${topic}, explained properly`,
};

/** Guesses the account's subject from the hashtags that appear most often. */
function inferTopics(posts: EnrichedPost[], limit = 6): string[] {
  const counts = new Map<string, number>();
  const generic = new Set([
    "fyp",
    "foryou",
    "foryoupage",
    "viral",
    "trending",
    "tiktok",
    "fy",
    "xyzbca",
    "explore",
  ]);

  for (const post of posts) {
    for (const tag of post.hashtags) {
      if (generic.has(tag) || tag.length < 3) continue;
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([tag]) => tag);
}

export function fallbackIdeas(
  posts: EnrichedPost[],
  findings: PatternFinding[],
  count: number,
): HookIdea[] {
  const topics = inferTopics(posts);
  const fallbackTopic = topics[0] ?? "this";

  const archetypeLifts = findings
    .filter((f) => f.dimension === "hookArchetype" && f.lift > 1)
    .sort((a, b) => b.lift - a.lift);

  const hashtagLifts = findings
    .filter((f) => f.dimension === "hashtag" && f.lift > 1)
    .slice(0, 6)
    .map((f) => f.value);

  const soundLifts = findings
    .filter((f) => f.dimension === "sound" && f.lift > 1)
    .slice(0, 3)
    .map((f) => f.value);

  const formatFinding = findings.find((f) => f.dimension === "format" && f.lift > 1);

  const ideas: HookIdea[] = [];
  const pool = archetypeLifts.length
    ? archetypeLifts
    : [{ value: "curiosity", lift: 1, n: 0, pValue: 1 } as PatternFinding];

  for (let i = 0; i < count; i += 1) {
    const finding = pool[i % pool.length];
    const topic = topics[i % Math.max(topics.length, 1)] ?? fallbackTopic;
    const template = TEMPLATES[finding.value] ?? TEMPLATES.statement;

    const evidence: string[] = [];
    if (finding.n > 0) {
      evidence.push(
        `${archetypeLabel(finding.value)} hooks run ${finding.lift.toFixed(2)}× the account median across ${finding.n} posts (${confidenceLabel(finding.pValue, finding.n)} confidence).`,
      );
    }
    if (formatFinding) {
      evidence.push(
        `${formatFinding.label} posts run ${formatFinding.lift.toFixed(2)}× median (n=${formatFinding.n}, median ${formatCount(formatFinding.medianViews)} views).`,
      );
    }
    if (!evidence.length) {
      evidence.push("Not enough data yet for a measured lift — treat this as a starting hypothesis.");
    }

    ideas.push({
      hook: template(topic),
      format: formatFinding?.value === "photo" ? "Slideshow" : "Video",
      angle: `Built on the ${archetypeLabel(finding.value).toLowerCase()} pattern applied to #${topic}.`,
      rationale: `This account's strongest measured hook pattern is ${archetypeLabel(finding.value).toLowerCase()}, and #${topic} is one of its most-used subjects. Combining the two keeps the opening in proven territory while the subject stays on-brand.`,
      evidence,
      suggestedSounds: soundLifts,
      suggestedHashtags: hashtagLifts.length ? hashtagLifts : topics,
      confidence: Math.min(85, Math.round(40 + (finding.lift - 1) * 40)),
    });
  }

  return ideas;
}

export function fallbackSlideshow(
  posts: EnrichedPost[],
  findings: PatternFinding[],
  hook: string,
  slideCount: number,
): SlideshowPlan {
  const topics = inferTopics(posts);
  const hashtagLifts = findings
    .filter((f) => f.dimension === "hashtag" && f.lift > 1)
    .slice(0, 8)
    .map((f) => f.value);
  const soundLift = findings.find((f) => f.dimension === "sound" && f.lift > 1);

  const count = Math.max(3, Math.min(12, slideCount));
  const slides = Array.from({ length: count }, (_, i) => {
    const index = i + 1;
    if (index === 1) {
      return {
        index,
        onImageText: hook,
        subText: "swipe →",
        imageBrief:
          "High-contrast establishing shot with generous empty space in the upper third for the hook text. Single clear subject, no visual clutter competing with the words.",
        purpose: "Stops the scroll and opens the loop. Everything else depends on this slide landing.",
      };
    }
    if (index === count) {
      return {
        index,
        onImageText: "Save this for later",
        subText: "Which one hit hardest? 👇",
        imageBrief:
          "Clean closing frame that visually echoes slide 1 so the set feels bookended. Leave room at the bottom for the comment prompt.",
        purpose: "Converts attention into saves and comments, both of which push redistribution.",
      };
    }
    return {
      index,
      onImageText: `Point ${index - 1}`,
      subText: null,
      imageBrief: `Supporting image for point ${index - 1}${topics[0] ? `, on the subject of ${topics[0]}` : ""}. Keep framing consistent with the other middle slides so the set reads as one piece.`,
      purpose: "Pays off the previous slide, then opens a small question the next slide answers.",
    };
  });

  return {
    title: hook.slice(0, 60),
    hook,
    slides,
    caption: `${hook}\n\n${hashtagLifts.map((t) => `#${t}`).join(" ")}`,
    hashtags: hashtagLifts.length ? hashtagLifts : topics,
    soundSuggestion: soundLift?.value ?? "A trending sound with a low-key beat under 90 BPM",
    strategy:
      "Template scaffold generated without a model — set ANTHROPIC_API_KEY to have Claude write the actual slide copy and image briefs from your data. Slide count and hashtags are still drawn from your measured lifts.",
  };
}
