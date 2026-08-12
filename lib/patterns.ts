import { archetypeLabel } from "./hooks";
import { median } from "./metrics";
import type { EnrichedPost, PatternFinding } from "./types";

/**
 * Pattern mining.
 *
 * For every feature a post can carry — a hashtag, a sound, a format, a hook
 * archetype, a caption length band, a posting hour — we compare the posts that
 * have it against the posts that don't, and ask whether the difference in
 * performance is bigger than chance would explain.
 *
 * The comparison uses median outlier-multiple (views ÷ account median views)
 * rather than raw views, so a 400k-view post on a big account and a 40k-view
 * post on a small one are judged on the same scale. Significance comes from a
 * Mann–Whitney U rank-sum test, which makes no assumption that view counts are
 * normally distributed — they emphatically are not.
 */

/**
 * Five is the floor at which a group can say anything. At three, a single
 * runaway post drags its whole hashtag to an absurd lift — real accounts have
 * one 5M-view fluke among 1.6K-view typical posts, and every tag on that post
 * would otherwise be reported as a 500x winner.
 */
const MIN_GROUP_SIZE = 5;

/**
 * Shrinkage constant for the reliability-adjusted lift used for ranking. A
 * group of n posts keeps n/(n+K) of its measured effect and is pulled the rest
 * of the way back to 1.0, so a huge effect measured on five posts ranks below
 * a moderate one measured on fifty. The raw lift is what we display; this is
 * only how we decide what deserves the top of the list.
 */
const SHRINKAGE_K = 12;

export function reliableLift(lift: number, n: number): number {
  return 1 + (lift - 1) * (n / (n + SHRINKAGE_K));
}

/** Normal CDF via Abramowitz & Stegun 7.1.26 — good to ~1e-7. */
function normalCdf(z: number): number {
  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-x * x);
  return 0.5 * (1 + sign * y);
}

/**
 * Two-sided Mann–Whitney U with a normal approximation and tie correction.
 * Returns 1 (no evidence) when either group is too small to say anything.
 */
export function rankSumPValue(groupA: number[], groupB: number[]): number {
  const n1 = groupA.length;
  const n2 = groupB.length;
  if (n1 < 3 || n2 < 3) return 1;

  const combined = [
    ...groupA.map((value) => ({ value, group: 0 })),
    ...groupB.map((value) => ({ value, group: 1 })),
  ].sort((a, b) => a.value - b.value);

  // Assign midranks so ties don't inflate the statistic.
  const ranks = new Array<number>(combined.length);
  const tieGroups: number[] = [];
  let i = 0;
  while (i < combined.length) {
    let j = i;
    while (j + 1 < combined.length && combined[j + 1].value === combined[i].value) j += 1;
    const midrank = (i + j) / 2 + 1;
    for (let k = i; k <= j; k += 1) ranks[k] = midrank;
    if (j > i) tieGroups.push(j - i + 1);
    i = j + 1;
  }

  let rankSumA = 0;
  for (let k = 0; k < combined.length; k += 1) {
    if (combined[k].group === 0) rankSumA += ranks[k];
  }

  const u1 = rankSumA - (n1 * (n1 + 1)) / 2;
  const meanU = (n1 * n2) / 2;

  const n = n1 + n2;
  const tieCorrection = tieGroups.reduce((acc, size) => acc + (size ** 3 - size), 0);
  const variance = ((n1 * n2) / 12) * (n + 1 - tieCorrection / (n * (n - 1)));
  if (variance <= 0) return 1;

  const z = (u1 - meanU) / Math.sqrt(variance);
  return Math.max(0, Math.min(1, 2 * (1 - normalCdf(Math.abs(z)))));
}

/** A feature extractor: given a post, which buckets of this dimension it lands in. */
interface Dimension {
  key: string;
  label: string;
  /** Returns zero or more bucket values. Zero means "excluded from this test". */
  values: (post: EnrichedPost) => string[];
  /** Human-readable name for a bucket value. */
  format?: (value: string) => string;
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function bucketise(value: number | null, edges: number[], labels: string[]): string[] {
  if (value === null || !Number.isFinite(value)) return [];
  for (let i = 0; i < edges.length; i += 1) {
    if (value <= edges[i]) return [labels[i]];
  }
  return [labels[labels.length - 1]];
}

export const DIMENSIONS: Dimension[] = [
  {
    key: "hashtag",
    label: "Hashtag",
    values: (post) => post.hashtags,
    format: (value) => `#${value}`,
  },
  {
    key: "sound",
    label: "Sound",
    values: (post) => (post.soundName ? [post.soundName] : []),
  },
  {
    key: "format",
    label: "Format",
    values: (post) => (post.format === "unknown" ? [] : [post.format]),
    format: (value) => (value === "photo" ? "Slideshow / photo" : "Video"),
  },
  {
    key: "hookArchetype",
    label: "Hook type",
    values: (post) => post.hookArchetypes,
    format: archetypeLabel,
  },
  {
    key: "slideCount",
    label: "Slide count",
    values: (post) =>
      bucketise(post.slideCount, [3, 5, 8], ["1-3 slides", "4-5 slides", "6-8 slides", "9+ slides"]),
  },
  {
    key: "captionLength",
    label: "Caption length",
    values: (post) =>
      bucketise(
        post.captionLength || null,
        [50, 120, 250],
        ["Very short (<50)", "Short (50-120)", "Medium (120-250)", "Long (250+)"],
      ),
  },
  {
    key: "hashtagCount",
    label: "Hashtag count",
    values: (post) =>
      bucketise(post.hashtagCount, [2, 5, 9], ["0-2 tags", "3-5 tags", "6-9 tags", "10+ tags"]),
  },
  {
    key: "duration",
    label: "Video length",
    values: (post) =>
      post.format === "photo"
        ? []
        : bucketise(
            post.durationSec,
            [10, 20, 40],
            ["Under 10s", "10-20s", "20-40s", "Over 40s"],
          ),
  },
  {
    key: "postHour",
    label: "Posting hour",
    values: (post) =>
      post.postHour === null
        ? []
        : [`${String(Math.floor(post.postHour / 3) * 3).padStart(2, "0")}:00-${String(Math.floor(post.postHour / 3) * 3 + 3).padStart(2, "0")}:00`],
  },
  {
    key: "weekday",
    label: "Day of week",
    values: (post) => (post.postWeekday === null ? [] : [WEEKDAYS[post.postWeekday]]),
  },
  {
    key: "cta",
    label: "Call to action",
    values: (post) => (post.caption.trim() ? [post.hasCTA ? "Has CTA" : "No CTA"] : []),
  },
  {
    key: "question",
    label: "Question in caption",
    values: (post) => (post.caption.trim() ? [post.hasQuestion ? "Asks a question" : "No question"] : []),
  },
  {
    key: "originalSound",
    label: "Sound origin",
    values: (post) =>
      post.isOriginalSound === null ? [] : [post.isOriginalSound ? "Original sound" : "Borrowed sound"],
  },
];

export function minePatterns(posts: EnrichedPost[]): PatternFinding[] {
  const scored = posts.filter((p) => p.metrics.outlierMultiple !== null);
  if (scored.length < 2 * MIN_GROUP_SIZE) return [];

  const findings: PatternFinding[] = [];

  for (const dimension of DIMENSIONS) {
    const buckets = new Map<string, EnrichedPost[]>();
    for (const post of scored) {
      for (const value of dimension.values(post)) {
        const list = buckets.get(value) ?? [];
        list.push(post);
        buckets.set(value, list);
      }
    }

    for (const [value, group] of buckets) {
      if (group.length < MIN_GROUP_SIZE) continue;

      const groupIds = new Set(group.map((p) => p.id));
      const rest = scored.filter((p) => !groupIds.has(p.id));
      if (rest.length < MIN_GROUP_SIZE) continue;

      const groupOutliers = group.map((p) => p.metrics.outlierMultiple as number);
      const restOutliers = rest.map((p) => p.metrics.outlierMultiple as number);

      const groupMedian = median(groupOutliers);
      const restMedian = median(restOutliers);
      if (groupMedian === null || restMedian === null || restMedian <= 0) continue;

      const engagements = group
        .map((p) => p.metrics.engagementRate)
        .filter((v): v is number => v !== null);
      const views = group.map((p) => p.views).filter((v): v is number => v !== null);

      const examples = [...group]
        .sort((a, b) => (b.metrics.outlierMultiple ?? 0) - (a.metrics.outlierMultiple ?? 0))
        .slice(0, 3)
        .map((p) => p.id);

      findings.push({
        dimension: dimension.key,
        value,
        label: dimension.format ? dimension.format(value) : value,
        n: group.length,
        medianOutlier: groupMedian,
        medianEngagement: median(engagements),
        medianViews: median(views),
        lift: groupMedian / restMedian,
        pValue: rankSumPValue(groupOutliers, restOutliers),
        exampleIds: examples,
      });
    }
  }

  // Significant effects first, then by reliability-adjusted lift, so a large
  // effect measured on a handful of posts cannot outrank a solid one measured
  // across the account.
  return findings.sort((a, b) => {
    const aSig = a.pValue < 0.1 ? 1 : 0;
    const bSig = b.pValue < 0.1 ? 1 : 0;
    if (aSig !== bSig) return bSig - aSig;
    return reliableLift(b.lift, b.n) - reliableLift(a.lift, a.n);
  });
}

export function significantFindings(findings: PatternFinding[], maxP = 0.1): PatternFinding[] {
  return findings.filter((f) => f.pValue <= maxP && f.lift > 1);
}

export function drags(findings: PatternFinding[], maxP = 0.1): PatternFinding[] {
  return findings
    .filter((f) => f.pValue <= maxP && f.lift < 1)
    .sort((a, b) => a.lift - b.lift);
}

/**
 * For a single post, explains its result by naming the features it carries
 * that measurably over-perform for this account.
 */
export function explainPost(
  post: EnrichedPost,
  findings: PatternFinding[],
  limit = 5,
): PatternFinding[] {
  const relevant: PatternFinding[] = [];

  for (const finding of findings) {
    if (finding.lift <= 1.05) continue;
    const dimension = DIMENSIONS.find((d) => d.key === finding.dimension);
    if (!dimension) continue;
    if (dimension.values(post).includes(finding.value)) relevant.push(finding);
  }

  return relevant
    .sort((a, b) => reliableLift(b.lift, b.n) - reliableLift(a.lift, a.n))
    .slice(0, limit);
}

export function confidenceLabel(pValue: number, n: number): string {
  if (n < 5) return "Weak — small sample";
  if (pValue <= 0.01) return "Strong";
  if (pValue <= 0.05) return "Solid";
  if (pValue <= 0.1) return "Suggestive";
  return "Weak";
}
