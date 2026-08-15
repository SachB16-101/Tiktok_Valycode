import { median } from "./metrics";
import type { EnrichedPost, PatternFinding } from "./types";

/**
 * Critical-reading layer.
 *
 * Everything here exists to stop the pattern miner from being confidently
 * wrong. Three failure modes it guards against:
 *
 *  1. Age bias, older posts have had longer to accumulate views, so a naive
 *     comparison flatters your back catalogue and buries recent work.
 *  2. Confounding, one-feature-at-a-time testing reports a single underlying
 *     effect several times over, so you change the wrong thing.
 *  3. Conflating reach with resonance, a post can fail because nobody saw it
 *     or because everybody who saw it bounced. Those need opposite fixes.
 */

/* ------------------------------------------------------------------ *
 * 1. Age bias
 * ------------------------------------------------------------------ */

export interface AgeBiasReport {
  /** Spearman-style rank correlation between post age and views, -1 to 1. */
  correlation: number;
  /** True when age explains enough variance that raw comparison misleads. */
  material: boolean;
  medianAgeDays: number | null;
  note: string;
}

/** Rank correlation. Robust to the extreme skew of view counts. */
function rankCorrelation(pairs: [number, number][]): number {
  if (pairs.length < 8) return 0;

  const rank = (values: number[]): number[] => {
    const order = values.map((value, i) => ({ value, i })).sort((a, b) => a.value - b.value);
    const ranks = new Array<number>(values.length);
    let i = 0;
    while (i < order.length) {
      let j = i;
      while (j + 1 < order.length && order[j + 1].value === order[i].value) j += 1;
      const midrank = (i + j) / 2 + 1;
      for (let k = i; k <= j; k += 1) ranks[order[k].i] = midrank;
      i = j + 1;
    }
    return ranks;
  };

  const xs = rank(pairs.map((p) => p[0]));
  const ys = rank(pairs.map((p) => p[1]));
  const n = xs.length;
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;

  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i += 1) {
    const a = xs[i] - meanX;
    const b = ys[i] - meanY;
    num += a * b;
    dx += a * a;
    dy += b * b;
  }
  const denominator = Math.sqrt(dx * dy);
  return denominator === 0 ? 0 : num / denominator;
}

export function assessAgeBias(posts: EnrichedPost[], now = Date.now()): AgeBiasReport {
  const pairs: [number, number][] = [];
  for (const post of posts) {
    if (post.createdAt === null || post.views === null) continue;
    pairs.push([(now - post.createdAt) / 86_400_000, post.views]);
  }

  if (pairs.length < 8) {
    return {
      correlation: 0,
      material: false,
      medianAgeDays: null,
      note: "Too few dated posts to test for age bias.",
    };
  }

  const correlation = rankCorrelation(pairs);
  const medianAgeDays = median(pairs.map((p) => p[0]));
  const material = Math.abs(correlation) >= 0.25;

  let note: string;
  if (!material) {
    note =
      "Post age barely predicts views here, so comparing old and new posts directly is safe.";
  } else if (correlation > 0) {
    note =
      "Older posts out-perform newer ones. Some of that is simply more time to accumulate views, " +
      "recent work is being judged before it has finished performing. Age-adjusted scores correct for this.";
  } else {
    note =
      "Newer posts out-perform older ones even though they have had less time to accumulate. " +
      "That is a real improvement in the work, not an artefact, and it means old posts drag your baseline down.";
  }

  return { correlation, material, medianAgeDays, note };
}

/**
 * Rescales views by the account's median views for posts of similar age, so a
 * three-year-old post and a three-week-old one are judged on equal terms.
 * Falls back to the plain multiple when there is not enough dated data.
 */
export function ageAdjustedMultiples(
  posts: EnrichedPost[],
  now = Date.now(),
): Map<string, number> {
  const out = new Map<string, number>();
  const dated = posts.filter((p) => p.createdAt !== null && p.views !== null);

  if (dated.length < 20) {
    for (const post of posts) {
      if (post.metrics.outlierMultiple !== null) out.set(post.id, post.metrics.outlierMultiple);
    }
    return out;
  }

  // Quartile cohorts by age. Coarse on purpose, finer bands would just fit
  // noise on the few hundred posts a creator account actually has.
  const byAge = [...dated].sort(
    (a, b) => (now - (b.createdAt as number)) - (now - (a.createdAt as number)),
  );
  const cohortSize = Math.max(8, Math.ceil(byAge.length / 4));

  for (let start = 0; start < byAge.length; start += cohortSize) {
    const cohort = byAge.slice(start, start + cohortSize);
    const cohortMedian = median(cohort.map((p) => p.views as number));
    if (!cohortMedian || cohortMedian <= 0) continue;
    for (const post of cohort) {
      out.set(post.id, (post.views as number) / cohortMedian);
    }
  }

  for (const post of posts) {
    if (!out.has(post.id) && post.metrics.outlierMultiple !== null) {
      out.set(post.id, post.metrics.outlierMultiple);
    }
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * 2. Confounding
 * ------------------------------------------------------------------ */

export interface ConfoundPair {
  a: PatternFinding;
  b: PatternFinding;
  /** Jaccard overlap of the two findings' post sets, 0-1. */
  overlap: number;
}

/**
 * Finds pairs of findings whose posts substantially coincide. When two
 * "separate" effects sit on largely the same posts, they are one effect
 * wearing two hats, and acting on both is acting twice on a guess.
 */
export function findConfounds(
  findings: PatternFinding[],
  memberships: Map<string, Set<string>>,
  threshold = 0.6,
): ConfoundPair[] {
  const pairs: ConfoundPair[] = [];

  for (let i = 0; i < findings.length; i += 1) {
    for (let j = i + 1; j < findings.length; j += 1) {
      const a = findings[i];
      const b = findings[j];
      if (a.dimension === b.dimension) continue;
      // Only worth flagging when both point the same way.
      if (a.lift > 1 !== b.lift > 1) continue;

      const setA = memberships.get(`${a.dimension}:${a.value}`);
      const setB = memberships.get(`${b.dimension}:${b.value}`);
      if (!setA || !setB) continue;

      let intersection = 0;
      for (const id of setA) if (setB.has(id)) intersection += 1;
      const union = setA.size + setB.size - intersection;
      if (union === 0) continue;

      const overlap = intersection / union;
      if (overlap >= threshold) pairs.push({ a, b, overlap });
    }
  }

  return pairs.sort((x, y) => y.overlap - x.overlap);
}

/* ------------------------------------------------------------------ *
 * 3. Reach vs resonance
 * ------------------------------------------------------------------ */

export type Diagnosis =
  | "winner"
  | "distribution-failure"
  | "content-failure"
  | "underperformer";

export interface PostDiagnosis {
  diagnosis: Diagnosis;
  label: string;
  /** What to actually change, given which half failed. */
  advice: string;
}

const DIAGNOSIS_COPY: Record<Diagnosis, { label: string; advice: string }> = {
  winner: {
    label: "Reached and resonated",
    advice: "Both halves worked. This is the template, mine it for what to repeat.",
  },
  "distribution-failure": {
    label: "Good content, few saw it",
    advice:
      "Everyone who found this engaged hard, but the algorithm barely pushed it. The content is fine; " +
      "the hook, opening frame, tags or sound failed to earn reach. Repost it with a different hook.",
  },
  "content-failure": {
    label: "Reached, then lost them",
    advice:
      "The hook earned distribution and the payoff did not hold it. Keep the opening, rebuild what follows it.",
  },
  underperformer: {
    label: "Neither reached nor held",
    advice: "No signal to salvage here. Look at what your winners do differently rather than reviving this.",
  },
};

/**
 * Splits posts on reach (views vs account median) and resonance (engagement
 * rate vs account median). The two axes fail for opposite reasons and need
 * opposite fixes, so collapsing them into one score destroys the advice.
 */
export function diagnosePosts(posts: EnrichedPost[]): Map<string, PostDiagnosis> {
  const out = new Map<string, PostDiagnosis>();

  const byAccount = new Map<string, EnrichedPost[]>();
  for (const post of posts) {
    const list = byAccount.get(post.account) ?? [];
    list.push(post);
    byAccount.set(post.account, list);
  }

  for (const group of byAccount.values()) {
    const medianViews = median(group.map((p) => p.views).filter((v): v is number => v !== null));
    const medianEngagement = median(
      group.map((p) => p.metrics.engagementRate).filter((v): v is number => v !== null),
    );
    if (!medianViews || !medianEngagement) continue;

    for (const post of group) {
      if (post.views === null || post.metrics.engagementRate === null) continue;

      const reached = post.views >= medianViews;
      const resonated = post.metrics.engagementRate >= medianEngagement;

      const diagnosis: Diagnosis = reached
        ? resonated
          ? "winner"
          : "content-failure"
        : resonated
          ? "distribution-failure"
          : "underperformer";

      out.set(post.id, { diagnosis, ...DIAGNOSIS_COPY[diagnosis] });
    }
  }

  return out;
}

export interface DiagnosisSummary {
  counts: Record<Diagnosis, number>;
  /** The single most useful sentence about where this account's bottleneck is. */
  headline: string;
}

export function summariseDiagnoses(diagnoses: Map<string, PostDiagnosis>): DiagnosisSummary {
  const counts: Record<Diagnosis, number> = {
    winner: 0,
    "distribution-failure": 0,
    "content-failure": 0,
    underperformer: 0,
  };
  for (const entry of diagnoses.values()) counts[entry.diagnosis] += 1;

  const total = Math.max(1, diagnoses.size);
  const distribution = counts["distribution-failure"] / total;
  const content = counts["content-failure"] / total;

  let headline: string;
  if (distribution > content * 1.5 && distribution > 0.15) {
    headline =
      `Your bottleneck is distribution. ${counts["distribution-failure"]} posts held the audience they ` +
      "reached but were never pushed, the content is working and the packaging is not. Hooks, opening " +
      "frames and tags are where the gain is.";
  } else if (content > distribution * 1.5 && content > 0.15) {
    headline =
      `Your bottleneck is the payoff. ${counts["content-failure"]} posts earned reach and then lost people, ` +
      "your hooks are writing cheques the rest of the post is not cashing. Fix what comes after slide one.";
  } else {
    headline =
      "Reach and retention fail at roughly the same rate, so there is no single bottleneck, " +
      "the gains here come from repeating what your winners do rather than patching one weakness.";
  }

  return { counts, headline };
}

/* ------------------------------------------------------------------ *
 * 4. Cross-account replication
 * ------------------------------------------------------------------ */

export interface ReplicatedFinding {
  dimension: string;
  value: string;
  label: string;
  accounts: { account: string; lift: number; n: number }[];
  /** Median of the per-account lifts. Median, not mean, so one runaway account cannot carry it. */
  medianLift: number;
  /**
   * The contributing lift closest to 1.0. A replication is only as strong as
   * its weakest account, so this is what the ranking is built on, a 35x on one
   * account beside a 1.15x on another is a fluke with a witness, not a pattern.
   */
  weakestLift: number;
  direction: "helps" | "hurts";
}

/**
 * A pattern that holds independently on several accounts is far better
 * evidence than a bigger number on one. This is the closest thing to a
 * replication study the data allows, and it is the only finding class worth
 * acting on without hesitation.
 */
export function findReplicatedPatterns(
  perAccount: Map<string, PatternFinding[]>,
  minAccounts = 2,
): ReplicatedFinding[] {
  const grouped = new Map<string, { finding: PatternFinding; account: string }[]>();

  for (const [account, findings] of perAccount) {
    for (const finding of findings) {
      if (finding.n < 5) continue;
      const key = `${finding.dimension}:${finding.value}`;
      const list = grouped.get(key) ?? [];
      list.push({ finding, account });
      grouped.set(key, list);
    }
  }

  const out: ReplicatedFinding[] = [];
  for (const entries of grouped.values()) {
    if (entries.length < minAccounts) continue;

    const helps = entries.filter((e) => e.finding.lift > 1.05).length;
    const hurts = entries.filter((e) => e.finding.lift < 0.95).length;
    // Only count it as replicated when every account agrees on direction.
    if (helps < minAccounts && hurts < minAccounts) continue;

    const direction: "helps" | "hurts" = helps >= minAccounts ? "helps" : "hurts";
    const agreeing = entries.filter((e) =>
      direction === "helps" ? e.finding.lift > 1.05 : e.finding.lift < 0.95,
    );

    const lifts = agreeing.map((e) => e.finding.lift);
    const weakestLift = lifts.reduce((weakest, lift) =>
      Math.abs(lift - 1) < Math.abs(weakest - 1) ? lift : weakest,
    );

    out.push({
      dimension: agreeing[0].finding.dimension,
      value: agreeing[0].finding.value,
      label: agreeing[0].finding.label,
      accounts: agreeing.map((e) => ({
        account: e.account,
        lift: e.finding.lift,
        n: e.finding.n,
      })),
      medianLift: median(lifts) ?? 1,
      weakestLift,
      direction,
    });
  }

  return out.sort((a, b) => {
    if (a.accounts.length !== b.accounts.length) return b.accounts.length - a.accounts.length;
    // Rank on the weakest contributing account, not the loudest one.
    return Math.abs(b.weakestLift - 1) - Math.abs(a.weakestLift - 1);
  });
}
