/**
 * Hook extraction and archetype classification.
 *
 * A "hook" is the first thing a viewer reads, for slideshows that is the text
 * on slide one, which in practice is mirrored in the caption's opening line.
 * We classify hooks into archetypes so we can measure which *kinds* of opening
 * travel for this account, not just which exact words did.
 */

export interface HookArchetype {
  id: string;
  label: string;
  description: string;
  test: (hook: string) => boolean;
}

const NUMBER_OPENER = /^\s*(?:#?\d+|one|two|three|four|five|six|seven|eight|nine|ten)\b/i;
const QUESTION = /\?/;

export const ARCHETYPES: HookArchetype[] = [
  {
    id: "question",
    label: "Question",
    description: "Opens by asking the viewer something directly.",
    test: (h) => QUESTION.test(h) || /^(what|why|how|when|who|which|are|do|did|can|is|would)\b/i.test(h),
  },
  {
    id: "listicle",
    label: "Numbered list",
    description: "Promises a countable payload, '5 things', '3 ways'.",
    test: (h) => NUMBER_OPENER.test(h) || /\b\d+\s+(things|ways|tips|reasons|signs|steps|rules|mistakes|hacks)\b/i.test(h),
  },
  {
    id: "contrarian",
    label: "Contrarian",
    description: "Contradicts a common belief. High save + comment driver.",
    test: (h) => /\b(actually|nobody tells you|unpopular opinion|myth|wrong|stop|don'?t|never|the truth about|lied)\b/i.test(h),
  },
  {
    id: "pov",
    label: "POV / relatable",
    description: "Puts the viewer inside a scenario.",
    test: (h) => /\b(pov|when you|that moment|me when|if you|tell me you)\b/i.test(h),
  },
  {
    id: "warning",
    label: "Warning / stakes",
    description: "Frames a cost of inaction. Strong stop-scroll pressure.",
    test: (h) => /\b(warning|careful|mistake|avoid|before you|red flag|losing|wasting|costing)\b/i.test(h),
  },
  {
    id: "curiosity",
    label: "Curiosity gap",
    description: "Withholds the payoff to force a swipe.",
    test: (h) => /\b(secret|nobody|no one|hidden|this is why|here'?s why|what happened|you won'?t believe|the reason)\b/i.test(h),
  },
  {
    id: "socialproof",
    label: "Social proof",
    description: "Leans on a result or a crowd.",
    test: (h) => /\b(\d+[kmb]?\+? (followers|people|views|sales|clients)|went viral|everyone|we all|i made|i grew)\b/i.test(h),
  },
  {
    id: "transformation",
    label: "Transformation",
    description: "Before/after or a journey framing.",
    test: (h) => /\b(from .* to |before and after|how i (went|got|grew|built)|day \d+|glow ?up|transformed)\b/i.test(h),
  },
  {
    id: "direct",
    label: "Direct address",
    description: "Names the audience so the right viewer self-selects.",
    test: (h) => /\b(if you'?re|for (anyone|people|those)|you need|attention|calling all)\b/i.test(h),
  },
  {
    id: "howto",
    label: "How-to",
    description: "Promises a method. Reliable saves, softer shares.",
    test: (h) => /\b(how to|here'?s how|the easiest way|step by step|tutorial|guide)\b/i.test(h),
  },
];

/**
 * The hook is the opening line. Captions often lead with the hook and trail
 * with a hashtag block, so we strip trailing tags and take the first sentence
 * or line, whichever comes first.
 */
export function extractHook(caption: string): string {
  if (!caption) return "";

  // Hashtag runs at either end are metadata, not a hook.
  const source = caption
    .replace(/(\s*#[\p{L}\p{N}_]+)+\s*$/gu, "")
    .replace(/^(\s*#[\p{L}\p{N}_]+)+\s*/gu, "")
    .trim();

  // A caption made entirely of hashtags carries no hook. Say so rather than
  // passing the tag string off as one, on slideshow-heavy accounts the real
  // hook is burned onto the first image and simply is not in the export.
  if (!source) return "";

  const firstLine = source.split(/\n+/)[0]?.trim() ?? "";
  const candidate = firstLine || source.trim();

  // If the opening line is long, cut at the first sentence boundary.
  if (candidate.length > 90) {
    const sentence = candidate.match(/^.{10,90}?[.!?](?:\s|$)/);
    if (sentence) return sentence[0].trim();
    return `${candidate.slice(0, 90).trim()}…`;
  }

  return candidate;
}

export function classifyHook(hook: string): string[] {
  if (!hook) return [];
  const matches = ARCHETYPES.filter((archetype) => archetype.test(hook)).map((a) => a.id);
  return matches.length ? matches : ["statement"];
}

export function archetypeLabel(id: string): string {
  if (id === "statement") return "Plain statement";
  return ARCHETYPES.find((a) => a.id === id)?.label ?? id;
}

export function archetypeDescription(id: string): string {
  if (id === "statement") return "A declarative opening with no explicit hook device.";
  return ARCHETYPES.find((a) => a.id === id)?.description ?? "";
}

const CTA_PATTERN =
  /\b(follow|comment|save this|share this|link in bio|tap in|drop a|dm me|check out|swipe|subscribe|sign up)\b/i;

export function hasCTA(caption: string): boolean {
  return CTA_PATTERN.test(caption);
}
