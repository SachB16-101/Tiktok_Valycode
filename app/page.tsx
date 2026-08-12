import Link from "next/link";
import { HeroFigure, StatTile } from "@/components/charts";
import { PostCard } from "@/components/post-card";
import { PatternBars } from "@/components/pattern-bars";
import { enrich, formatCount, formatPercent, summarise, topPosts } from "@/lib/metrics";
import type { EnrichedPost } from "@/lib/types";
import { drags, explainPost, minePatterns, significantFindings } from "@/lib/patterns";
import { loadDataset } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const dataset = await loadDataset();

  if (!dataset) return <EmptyState />;

  const posts = enrich(dataset.posts);
  const summary = summarise(posts);
  const findings = minePatterns(posts);
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
