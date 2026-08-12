import { classifyHook, extractHook, hasCTA } from "./hooks";
import type { EnrichedPost, Post, PostMetrics } from "./types";

export function median(values: number[]): number | null {
  const clean = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!clean.length) return null;
  const mid = Math.floor(clean.length / 2);
  return clean.length % 2 ? clean[mid] : (clean[mid - 1] + clean[mid]) / 2;
}

export function sum(values: (number | null)[]): number {
  return values.reduce<number>((acc, v) => acc + (v ?? 0), 0);
}

function safeRate(numerator: number | null, denominator: number | null): number | null {
  if (numerator === null || denominator === null || denominator <= 0) return null;
  return numerator / denominator;
}

/** Percentile of `value` within an ascending-sorted array, as 0-100. */
function percentileOf(sorted: number[], value: number): number {
  if (!sorted.length) return 0;
  let below = 0;
  for (const item of sorted) {
    if (item < value) below += 1;
    else break;
  }
  return (below / sorted.length) * 100;
}

/**
 * Total engagement actions. Saves and shares are weighted up: on TikTok they
 * are the strongest distribution signals, whereas likes are close to free.
 */
function weightedEngagement(post: Post): number {
  return (
    (post.likes ?? 0) * 1 +
    (post.comments ?? 0) * 3 +
    (post.shares ?? 0) * 5 +
    (post.saves ?? 0) * 4
  );
}

/**
 * Scores a post 0-100 against its own account's baseline. Absolute view counts
 * are useless across accounts of different sizes, so everything is relative:
 * how far above this account's median did this post reach, and how hard did
 * the audience that saw it react.
 */
export function computeMetrics(post: Post, accountBaseline: AccountBaseline): PostMetrics {
  const engagementActions = weightedEngagement(post);
  const engagementRate = safeRate(engagementActions, post.views);

  const outlierMultiple =
    post.views !== null && accountBaseline.medianViews && accountBaseline.medianViews > 0
      ? post.views / accountBaseline.medianViews
      : null;

  const viewPercentile =
    post.views !== null ? percentileOf(accountBaseline.sortedViews, post.views) : null;

  // Reach half, reaction half. A post that punched above its account's weight
  // *and* held the audience it reached is what we want surfaced.
  const reachComponent = viewPercentile ?? 50;
  const engagementComponent =
    engagementRate !== null && accountBaseline.medianEngagement
      ? Math.min(100, (engagementRate / accountBaseline.medianEngagement) * 50)
      : 50;

  return {
    engagementRate,
    likeRate: safeRate(post.likes, post.views),
    commentRate: safeRate(post.comments, post.views),
    shareRate: safeRate(post.shares, post.views),
    saveRate: safeRate(post.saves, post.views),
    outlierMultiple,
    viewPercentile,
    score: Math.round(reachComponent * 0.5 + engagementComponent * 0.5),
  };
}

export interface AccountBaseline {
  account: string;
  medianViews: number | null;
  medianEngagement: number | null;
  sortedViews: number[];
  postCount: number;
}

export function buildBaselines(posts: Post[]): Map<string, AccountBaseline> {
  const groups = new Map<string, Post[]>();
  for (const post of posts) {
    const list = groups.get(post.account) ?? [];
    list.push(post);
    groups.set(post.account, list);
  }

  const baselines = new Map<string, AccountBaseline>();
  for (const [account, group] of groups) {
    const views = group.map((p) => p.views).filter((v): v is number => v !== null);
    const engagements = group
      .map((p) => safeRate(weightedEngagement(p), p.views))
      .filter((v): v is number => v !== null);

    baselines.set(account, {
      account,
      medianViews: median(views),
      medianEngagement: median(engagements),
      sortedViews: [...views].sort((a, b) => a - b),
      postCount: group.length,
    });
  }
  return baselines;
}

export function enrich(posts: Post[]): EnrichedPost[] {
  const baselines = buildBaselines(posts);
  const fallback: AccountBaseline = {
    account: "",
    medianViews: null,
    medianEngagement: null,
    sortedViews: [],
    postCount: 0,
  };

  return posts.map((post) => {
    const baseline = baselines.get(post.account) ?? fallback;
    const hook = extractHook(post.caption);
    const date = post.createdAt !== null ? new Date(post.createdAt) : null;

    return {
      ...post,
      metrics: computeMetrics(post, baseline),
      hook,
      hookArchetypes: classifyHook(hook),
      captionLength: post.caption.length,
      wordCount: post.caption.trim() ? post.caption.trim().split(/\s+/).length : 0,
      hasCTA: hasCTA(post.caption),
      hasQuestion: post.caption.includes("?"),
      hashtagCount: post.hashtags.length,
      postHour: date ? date.getHours() : null,
      postWeekday: date ? date.getDay() : null,
    };
  });
}

export function topPosts(posts: EnrichedPost[], limit = 20): EnrichedPost[] {
  return [...posts]
    .sort((a, b) => {
      const byOutlier = (b.metrics.outlierMultiple ?? 0) - (a.metrics.outlierMultiple ?? 0);
      if (Math.abs(byOutlier) > 0.001) return byOutlier;
      return b.metrics.score - a.metrics.score;
    })
    .slice(0, limit);
}

export interface DatasetSummary {
  postCount: number;
  accounts: string[];
  totalViews: number;
  totalLikes: number;
  totalComments: number;
  totalShares: number;
  totalSaves: number;
  medianViews: number | null;
  medianEngagementRate: number | null;
  slideshowShare: number | null;
  dateRange: [number, number] | null;
  /** Fields with no data at all — surfaced so the user knows what's missing. */
  missingFields: string[];
  /**
   * Share of posts whose caption is nothing but hashtags. On these the hook
   * lives on the first image, which no export contains — so hook analysis
   * covers only the remainder, and the dashboard says so.
   */
  captionlessShare: number;
  postsWithHooks: number;
}

export function summarise(posts: EnrichedPost[]): DatasetSummary {
  const views = posts.map((p) => p.views).filter((v): v is number => v !== null);
  const engagements = posts
    .map((p) => p.metrics.engagementRate)
    .filter((v): v is number => v !== null);
  const dates = posts.map((p) => p.createdAt).filter((v): v is number => v !== null);
  const known = posts.filter((p) => p.format !== "unknown");
  const withHooks = posts.filter((p) => p.hook.length > 0);

  const missingFields: string[] = [];
  const check = (label: string, present: boolean) => {
    if (!present) missingFields.push(label);
  };
  check("views", posts.some((p) => p.views !== null));
  check("likes", posts.some((p) => p.likes !== null));
  check("comments", posts.some((p) => p.comments !== null));
  check("shares", posts.some((p) => p.shares !== null));
  check("saves", posts.some((p) => p.saves !== null));
  check("sound", posts.some((p) => p.soundName !== null));
  check("post date", dates.length > 0);
  check("captions", posts.some((p) => p.caption.trim().length > 0));

  return {
    postCount: posts.length,
    accounts: [...new Set(posts.map((p) => p.account))],
    totalViews: sum(posts.map((p) => p.views)),
    totalLikes: sum(posts.map((p) => p.likes)),
    totalComments: sum(posts.map((p) => p.comments)),
    totalShares: sum(posts.map((p) => p.shares)),
    totalSaves: sum(posts.map((p) => p.saves)),
    medianViews: median(views),
    medianEngagementRate: median(engagements),
    slideshowShare: known.length
      ? known.filter((p) => p.format === "photo").length / known.length
      : null,
    dateRange: dates.length ? [Math.min(...dates), Math.max(...dates)] : null,
    missingFields,
    captionlessShare: posts.length ? 1 - withHooks.length / posts.length : 0,
    postsWithHooks: withHooks.length,
  };
}

export function formatCount(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  if (abs >= 1e9) return `${(value / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
  return String(Math.round(value));
}

export function formatPercent(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(digits)}%`;
}

export function formatMultiple(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `${value.toFixed(1)}×`;
}
