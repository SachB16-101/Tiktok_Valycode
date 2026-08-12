import Link from "next/link";
import { HeroFigure, StatTile } from "@/components/charts";
import { PostCard } from "@/components/post-card";
import { PatternBars } from "@/components/pattern-bars";
import { analyse } from "@/lib/analysis";
import { formatCount, formatPercent, topPosts } from "@/lib/metrics";
import type { EnrichedPost } from "@/lib/types";
import { drags, explainPost, significantFindings } from "@/lib/patterns";
import { loadDataset } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const dataset = await loadDataset();

  if (!dataset) return <EmptyState />;

  const analysis = analyse(dataset);
  const { posts, summary, findings } = analysis;
  const winners = significantFindings(findings).slice(0, 10);
  const losers = drags(findings).slice(0, 5);
  const best = topPosts(posts, 6);

  const topPost = best[0];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Performance dashboard</h1>
        <p className="secondary mt-1 text-sm">
          {summary.postCount.toLocaleString()} posts across{" "}
          {summary.accounts.length === 1 ? summary.accounts[0] : `${summary.accounts.length} accounts`}
          {summary.dateRange && (
            <>
              {" · "}
              {new Date(summary.dateRange[0]).toLocaleDateString()} –{" "}
              {new Date(summary.dateRange[1]).toLocaleDateString()}
            </>
          )}
        </p>
      </div>

      {summary.captionlessShare > 0.15 && (
        <div className="card px-4 py-3 text-sm" style={{ borderColor: "var(--warning)" }}>
          <span className="font-medium">
            {Math.round(summary.captionlessShare * 100)}% of your captions are hashtags only.{" "}
          </span>
          <span className="secondary">
            On those posts the hook is burned onto the first image, and no TikTok export contains
            that text — so hook analysis below covers the {summary.postsWithHooks} posts that do
            have caption text. Everything else (format, sound, hashtags, timing, slide count) still
            uses all {summary.postCount}.
          </span>
        </div>
      )}

      {summary.missingFields.length > 0 && (
        <div
          className="card px-4 py-3 text-sm"
          style={{ borderColor: "var(--warning)" }}
        >
          <span className="font-medium">Missing from your export: </span>
          <span className="secondary">
            {summary.missingFields.join(", ")}. Analyses that depend on these are skipped rather
            than guessed. You can remap fields on the{" "}
            <Link href="/ingest" className="underline">
              Data
            </Link>{" "}
            page.
          </span>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        {topPost && (
          <HeroFigure
            label="Best performing post"
            value={
              topPost.metrics.outlierMultiple
                ? `${topPost.metrics.outlierMultiple.toFixed(1)}×`
                : formatCount(topPost.views)
            }
            sub={describePost(topPost, true)}
          />
        )}

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <StatTile label="Total views" value={formatCount(summary.totalViews)} />
          <StatTile
            label="Median views"
            value={formatCount(summary.medianViews)}
            detail="your baseline"
          />
          <StatTile
            label="Median engagement"
            value={formatPercent(summary.medianEngagementRate, 2)}
            detail="weighted"
          />
          <StatTile label="Total saves" value={formatCount(summary.totalSaves)} />
          <StatTile label="Total shares" value={formatCount(summary.totalShares)} />
          <StatTile
            label="Slideshows"
            value={summary.slideshowShare !== null ? formatPercent(summary.slideshowShare, 0) : "—"}
            detail="of posts"
          />
        </div>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">Where you are losing</h2>
        <div className="card space-y-4 px-5 py-5">
          <p className="text-sm leading-relaxed">{analysis.diagnosisSummary.headline}</p>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <DiagnosisTile
              label="Reached and resonated"
              count={analysis.diagnosisSummary.counts.winner}
              total={analysis.diagnoses.size}
              tone="var(--good)"
            />
            <DiagnosisTile
              label="Good content, few saw it"
              count={analysis.diagnosisSummary.counts["distribution-failure"]}
              total={analysis.diagnoses.size}
              tone="var(--warning)"
            />
            <DiagnosisTile
              label="Reached, then lost them"
              count={analysis.diagnosisSummary.counts["content-failure"]}
              total={analysis.diagnoses.size}
              tone="var(--warning)"
            />
            <DiagnosisTile
              label="Neither"
              count={analysis.diagnosisSummary.counts.underperformer}
              total={analysis.diagnoses.size}
              tone="var(--text-muted)"
            />
          </div>
          <p className="muted text-xs">
            Split on reach (views vs your median) and resonance (engagement vs your median). The two
            fail for opposite reasons and need opposite fixes, so one blended score would hide the
            advice.
          </p>
        </div>
      </section>

      {analysis.replicated.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold tracking-tight">Holds across accounts</h2>
          <p className="secondary max-w-3xl text-sm">
            Patterns that reproduced independently on more than one of your accounts. This is the
            strongest evidence in the dataset — a big number on one account can be luck, the same
            direction on two separate audiences much less so. Act on these first.
          </p>
          <div className="card divide-y" style={{ borderColor: "var(--border)" }}>
            {analysis.replicated.slice(0, 8).map((item, i) => (
              <div
                key={`${item.dimension}-${item.value}`}
                className="flex flex-wrap items-baseline justify-between gap-3 px-5 py-3"
                style={{ borderTop: i ? "1px solid var(--border)" : undefined }}
              >
                <div>
                  <span className="font-medium">{item.label}</span>
                  <span
                    className="ml-2 text-sm"
                    style={{ color: item.direction === "helps" ? "var(--good)" : "var(--critical)" }}
                  >
                    {item.direction}
                  </span>
                </div>
                <span className="muted text-xs">
                  {item.accounts
                    .map((a) => `${a.account} ${a.lift.toFixed(2)}× (n=${a.n})`)
                    .join("  ·  ")}
                  <span className="ml-2">— weakest {item.weakestLift.toFixed(2)}×</span>
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {analysis.confounds.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold tracking-tight">Read these with care</h2>
          <div className="card space-y-2 px-5 py-4 text-sm">
            <p className="secondary">
              These findings sit on largely the same posts, so they are probably one effect being
              reported several times. Changing both would be changing one thing twice.
            </p>
            <ul className="space-y-1">
              {analysis.confounds.slice(0, 5).map((pair, i) => (
                <li key={i} className="secondary flex gap-2">
                  <span
                    aria-hidden="true"
                    className="mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ background: "var(--warning)" }}
                  />
                  <span>
                    <strong className="text-[var(--text-primary)]">{pair.a.label}</strong> and{" "}
                    <strong className="text-[var(--text-primary)]">{pair.b.label}</strong> overlap on{" "}
                    {Math.round(pair.overlap * 100)}% of the same posts.
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {analysis.ageBias.material && (
        <div className="card px-4 py-3 text-sm" style={{ borderColor: "var(--warning)" }}>
          <span className="font-medium">Post age is skewing the comparison. </span>
          <span className="secondary">{analysis.ageBias.note}</span>
        </div>
      )}

      <section className="space-y-3">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-lg font-semibold tracking-tight">What makes them win</h2>
          <Link href="/patterns" className="secondary text-sm underline">
            All patterns
          </Link>
        </div>
        <p className="secondary max-w-3xl text-sm">
          Each bar is a feature measured against every other post in your account. 1.0× means no
          effect; 2.0× means posts carrying that feature reach twice your median. Only effects that
          clear a rank-sum significance test are shown.
        </p>
        <div className="card px-5 py-5">
          <PatternBars findings={winners} />
        </div>
      </section>

      {losers.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold tracking-tight">What holds them back</h2>
          <div className="card px-5 py-5">
            <PatternBars findings={losers} />
          </div>
        </section>
      )}

      <section className="space-y-3">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-lg font-semibold tracking-tight">Top posts, explained</h2>
          <Link href="/posts" className="secondary text-sm underline">
            All posts
          </Link>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {best.map((post) => (
            <PostCard key={post.id} post={post} reasons={explainPost(post, findings)} />
          ))}
        </div>
      </section>

      <section className="card flex flex-wrap items-center justify-between gap-4 px-5 py-4">
        <div>
          <h2 className="font-semibold">Turn this into posts</h2>
          <p className="secondary text-sm">
            Generate hooks from these patterns, then build the slideshow slide by slide.
          </p>
        </div>
        <div className="flex gap-3 text-sm">
          <Link
            href="/ideas"
            className="rounded-lg px-4 py-2 font-medium text-white"
            style={{ background: "var(--lift)" }}
          >
            Generate hooks
          </Link>
          <Link href="/studio" className="rounded-lg border px-4 py-2 font-medium" style={{ borderColor: "var(--border)" }}>
            Slideshow studio
          </Link>
        </div>
      </section>
    </div>
  );
}

function DiagnosisTile({
  label,
  count,
  total,
  tone,
}: {
  label: string;
  count: number;
  total: number;
  tone: string;
}) {
  const share = total ? Math.round((count / total) * 100) : 0;
  return (
    <div className="rounded-lg px-3 py-2.5" style={{ border: "1px solid var(--border)" }}>
      <div className="flex items-baseline gap-2">
        <span className="text-xl font-semibold" style={{ color: tone }}>
          {count}
        </span>
        <span className="muted text-xs">{share}%</span>
      </div>
      <div className="secondary mt-1 text-xs leading-snug">{label}</div>
    </div>
  );
}

/**
 * Names a post for display. Two thirds of a slideshow account's captions are
 * hashtags only, so fall back through the tags and the sound rather than
 * printing "untitled" at people.
 */
function describePost(post: EnrichedPost, withViews: boolean): string {
  const identity =
    post.hook ||
    (post.hashtags.length ? post.hashtags.slice(0, 4).map((h) => `#${h}`).join(" ") : null) ||
    (post.soundName ? `sound: ${post.soundName}` : null) ||
    "no caption text";

  const prefix =
    withViews && post.metrics.outlierMultiple
      ? `${formatCount(post.views)} views — that many times ${post.account}'s median. `
      : "";

  return `${prefix}${identity}`;
}

function EmptyState() {
  return (
    <div className="card mx-auto max-w-2xl px-8 py-12 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">No data loaded yet</h1>
      <p className="secondary mx-auto mt-3 max-w-md text-sm">
        Drop in your TikTok JSON — an official data export, a Research API dump, or a scraper
        output. Fields are detected automatically and you can correct the mapping afterwards.
      </p>
      <Link
        href="/ingest"
        className="mt-6 inline-block rounded-lg px-5 py-2.5 text-sm font-medium text-white"
        style={{ background: "var(--lift)" }}
      >
        Import your JSON
      </Link>
    </div>
  );
}
