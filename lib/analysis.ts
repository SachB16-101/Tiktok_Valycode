import { analyseComments } from "./comments";
import {
  assessAgeBias,
  diagnosePosts,
  findConfounds,
  findReplicatedPatterns,
  summariseDiagnoses,
  type AgeBiasReport,
  type ConfoundPair,
  type DiagnosisSummary,
  type PostDiagnosis,
  type ReplicatedFinding,
} from "./diagnose";
import { enrich, summarise, type DatasetSummary } from "./metrics";
import { DIMENSIONS, minePatterns } from "./patterns";
import type { CommentInsights, Dataset, EnrichedPost, PatternFinding } from "./types";

/**
 * One pass over a dataset producing everything the app displays. Centralised so
 * the dashboard, the API routes and the generators cannot drift apart and start
 * quoting each other different numbers.
 */
export interface Analysis {
  posts: EnrichedPost[];
  summary: DatasetSummary;
  findings: PatternFinding[];
  /** Findings computed per account, for replication testing. */
  perAccount: Map<string, PatternFinding[]>;
  replicated: ReplicatedFinding[];
  confounds: ConfoundPair[];
  diagnoses: Map<string, PostDiagnosis>;
  diagnosisSummary: DiagnosisSummary;
  ageBias: AgeBiasReport;
  insights: CommentInsights | null;
}

/** Post ids carrying each `dimension:value`, used for confound detection. */
function buildMemberships(posts: EnrichedPost[]): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const dimension of DIMENSIONS) {
    for (const post of posts) {
      for (const value of dimension.values(post)) {
        const key = `${dimension.key}:${value}`;
        const set = out.get(key) ?? new Set<string>();
        set.add(post.id);
        out.set(key, set);
      }
    }
  }
  return out;
}

export function analyse(dataset: Dataset): Analysis {
  const posts = enrich(dataset.posts);
  const findings = minePatterns(posts);

  const accounts = [...new Set(posts.map((p) => p.account))];
  const perAccount = new Map<string, PatternFinding[]>();
  if (accounts.length > 1) {
    for (const account of accounts) {
      const subset = posts.filter((p) => p.account === account);
      // Below ~25 posts an account cannot contribute usable evidence.
      if (subset.length >= 25) perAccount.set(account, minePatterns(subset));
    }
  }

  const diagnoses = diagnosePosts(posts);
  const comments = dataset.comments ?? [];

  return {
    posts,
    summary: summarise(posts),
    findings,
    perAccount,
    replicated: findReplicatedPatterns(perAccount),
    confounds: findConfounds(findings.slice(0, 40), buildMemberships(posts)),
    diagnoses,
    diagnosisSummary: summariseDiagnoses(diagnoses),
    ageBias: assessAgeBias(posts),
    insights: comments.length ? analyseComments(posts, comments) : null,
  };
}
