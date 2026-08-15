import { ArrowRightIcon } from "@phosphor-icons/react/dist/ssr";
import { HeroFigure, Stat } from "@/components/charts";
import { PatternBars } from "@/components/pattern-bars";
import { PostCard } from "@/components/post-card";
import { Reveal } from "@/components/reveal";
import { ButtonLink, EmptyState, Notice, Rows, Section } from "@/components/ui";
import { analyse } from "@/lib/analysis";
import { formatCount, formatPercent, topPosts } from "@/lib/metrics";
import { drags, explainPost, significantFindings } from "@/lib/patterns";
import { loadDataset } from "@/lib/store";
import type { EnrichedPost } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  const dataset = await loadDataset();

  if (!dataset) {
    return (
      <EmptyState
        title="Nothing loaded yet"
        action={<ButtonLink href="/ingest">Import your JSON</ButtonLink>}
      >
        Drop in a TikTok export, a Research API dump, or scraper output. Fields are detected
        automatically and you can correct the mapping before anything is saved.
      </EmptyState>
    );
  }

  const analysis = analyse(dataset);
  const { posts, summary, findings, diagnosisSummary, diagnoses } = analysis;
  const winners = significantFindings(findings).slice(0, 9);
  const losers = drags(findings).slice(0, 5);
  const best = topPosts(posts, 4);
  const topPost = best[0];

  return (
    <div className="space-y-16">
      <Reveal>
        <header>
          <p className="muted text-[12px]">
            {summary.postCount.toLocaleString()} posts
            {summary.accounts.length > 1
              ? ` across ${summary.accounts.length} accounts`
              : ` on ${summary.accounts[0]}`}
            {summary.dateRange && (
              <>
                {", "}
                {new Date(summary.dateRange[0]).toLocaleDateString(undefined, {
                  month: "short",
                  year: "numeric",
                })}{" "}
                to{" "}
                {new Date(summary.dateRange[1]).toLocaleDateString(undefined, {
                  month: "short",
                  year: "numeric",
                })}
              </>
            )}
          </p>
          <h1 className="mt-3 max-w-[18ch] text-[38px] leading-[1.05] font-medium tracking-[-0.035em] lg:text-[46px]">
            What your best posts have in common
          </h1>
        </header>
      </Reveal>

      {(summary.captionlessShare > 0.15 || summary.missingFields.length > 0) && (
        <Reveal delay={0.05}>
          <div className="space-y-3">
            {summary.captionlessShare > 0.15 && (
              <Notice title={`${Math.round(summary.captionlessShare * 100)}% of captions are hashtags only.`}>
                On those the hook is burned onto the first image, and no TikTok export carries that
                text. Hook analysis covers the {summary.postsWithHooks} posts with real captions.
                Format, sound, hashtags, timing and slide count still use all {summary.postCount}.
              </Notice>
            )}
            {summary.missingFields.length > 0 && (
              <Notice title="Missing from your export:">
                {summary.missingFields.join(", ")}. Anything depending on these is skipped rather
                than guessed.
              </Notice>
            )}
          </div>
        </Reveal>
      )}

      {/* Asymmetric split: the single hero number against the supporting metrics. */}
      <Reveal delay={0.1}>
        <div className="grid gap-y-12 lg:grid-cols-[minmax(0,7fr)_minmax(0,9fr)] lg:gap-x-16">
          {topPost && (
            <HeroFigure
              label="Best post, against its own account median"
              value={
                topPost.metrics.outlierMultiple
                  ? `${topPost.metrics.outlierMultiple.toFixed(1)}×`
                  : formatCount(topPost.views)
              }
              sub={describePost(topPost)}
            />
          )}

          <div className="grid grid-cols-2 gap-x-8 gap-y-9 sm:grid-cols-3 lg:pt-6">
            <Stat label="Total views" value={formatCount(summary.totalViews)} />
            <Stat label="Median views" value={formatCount(summary.medianViews)} detail="your baseline" />
            <Stat
              label="Engagement"
              value={formatPercent(summary.medianEngagementRate, 1)}
              detail="median, weighted"
            />
            <Stat label="Saves" value={formatCount(summary.totalSaves)} />
            <Stat label="Shares" value={formatCount(summary.totalShares)} />
            <Stat
              label="Slideshows"
              value={summary.slideshowShare !== null ? formatPercent(summary.slideshowShare, 0) : "n/a"}
              detail="of all posts"
            />
          </div>
        </div>
      </Reveal>

      <Reveal>
        <Section title="Where you are losing">
          {/* The finding leads. The method note earns its place underneath. */}
          <p className="max-w-[58ch] text-[19px] leading-[1.45] tracking-[-0.011em]">
            {diagnosisSummary.headline}
          </p>
          <div className="mt-10 grid grid-cols-2 gap-x-8 gap-y-8 lg:grid-cols-4">
            <Diagnosis
              label="Reached and resonated"
              count={diagnosisSummary.counts.winner}
              total={diagnoses.size}
              tone="var(--good)"
            />
            <Diagnosis
              label="Good content, few saw it"
              count={diagnosisSummary.counts["distribution-failure"]}
              total={diagnoses.size}
              tone="var(--warn)"
            />
            <Diagnosis
              label="Reached, then lost them"
              count={diagnosisSummary.counts["content-failure"]}
              total={diagnoses.size}
              tone="var(--warn)"
            />
            <Diagnosis
              label="Neither"
              count={diagnosisSummary.counts.underperformer}
              total={diagnoses.size}
              tone="var(--text-muted)"
            />
          </div>
          <p className="muted mt-8 max-w-[74ch] text-[12.5px] leading-relaxed">
            Split on reach (views against your median) and resonance (engagement against your
            median). The two fail for opposite reasons and need opposite fixes, so a single blended
            score would bury the advice.
          </p>
        </Section>
      </Reveal>

      {analysis.replicated.length > 0 && (
        <Reveal>
          <Section
            title="Holds across accounts"
            lede="Patterns that reproduced independently on more than one account. A big number on one account can be luck; the same direction on two separate audiences is much harder to explain away. These are ranked by their weakest contributing account, not their loudest."
          >
            <Rows>
              {analysis.replicated.slice(0, 7).map((item) => (
                <div
                  key={`${item.dimension}-${item.value}`}
                  className="flex flex-wrap items-baseline justify-between gap-x-8 gap-y-2 px-5 py-4"
                >
                  <div className="flex items-baseline gap-3">
                    <span className="text-[14.5px] font-medium">{item.label}</span>
                    <span
                      className="text-[12px]"
                      style={{
                        color: item.direction === "helps" ? "var(--good)" : "var(--data-drag)",
                      }}
                    >
                      {item.direction}
                    </span>
                  </div>
                  <div className="numeric muted flex flex-wrap gap-x-5 text-[11.5px]">
                    {item.accounts.map((a) => (
                      <span key={a.account}>
                        {a.account} {a.lift.toFixed(2)}× (n={a.n})
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </Rows>
          </Section>
        </Reveal>
      )}

      <Reveal>
        <Section
          title="What makes them win"
          lede="Each bar is one feature measured against every other post in the account. 1.00× means no effect. Only effects clearing a rank sum significance test appear here."
          action={
            <a href="/patterns" className="secondary inline-flex items-center gap-1.5 text-[13px]">
              All patterns <ArrowRightIcon size={13} weight="bold" />
            </a>
          }
        >
          <PatternBars findings={winners} />
        </Section>
      </Reveal>

      {losers.length > 0 && (
        <Reveal>
          <Section title="What holds them back">
            <PatternBars findings={losers} />
          </Section>
        </Reveal>
      )}

      {analysis.confounds.length > 0 && (
        <Reveal>
          <Section
            title="Read these with care"
            lede="These findings sit on largely the same posts, so they are probably one effect reported twice. Changing both would be changing one thing twice."
          >
            <Rows>
              {analysis.confounds.slice(0, 4).map((pair, i) => (
                <p key={i} className="secondary px-5 py-4 text-[13.5px] leading-relaxed">
                  <span className="font-medium" style={{ color: "var(--text-primary)" }}>
                    {pair.a.label}
                  </span>{" "}
                  and{" "}
                  <span className="font-medium" style={{ color: "var(--text-primary)" }}>
                    {pair.b.label}
                  </span>{" "}
                  overlap on {Math.round(pair.overlap * 100)}% of the same posts.
                </p>
              ))}
            </Rows>
          </Section>
        </Reveal>
      )}

      <Reveal>
        <Section
          title="Top posts, explained"
          action={
            <a href="/posts" className="secondary inline-flex items-center gap-1.5 text-[13px]">
              All posts <ArrowRightIcon size={13} weight="bold" />
            </a>
          }
        >
          <div className="grid gap-4 lg:grid-cols-2">
            {best.map((post) => (
              <PostCard key={post.id} post={post} reasons={explainPost(post, findings)} />
            ))}
          </div>
        </Section>
      </Reveal>

      <Reveal>
        <section
          className="flex flex-wrap items-center justify-between gap-6 rounded-[10px] px-7 py-7"
          style={{ background: "var(--surface-sunken)" }}
        >
          <div>
            <h2 className="text-[17px] font-medium tracking-[-0.02em]">Turn this into posts</h2>
            <p className="secondary mt-1.5 max-w-[52ch] text-[13.5px] leading-relaxed">
              Generate hooks from these patterns, then build the slideshow slide by slide.
            </p>
          </div>
          <div className="flex gap-3">
            <ButtonLink href="/ideas">Generate hooks</ButtonLink>
            <ButtonLink href="/studio" variant="ghost">
              Open studio
            </ButtonLink>
          </div>
        </section>
      </Reveal>
    </div>
  );
}

function Diagnosis({
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
    <div className="border-t pt-4" style={{ borderColor: "var(--line-strong)" }}>
      <div className="flex items-baseline gap-2">
        <span className="numeric text-[26px] leading-none font-medium" style={{ color: tone }}>
          {count}
        </span>
        <span className="numeric muted text-[12px]">{share}%</span>
      </div>
      <div className="secondary mt-2 text-[12.5px] leading-snug">{label}</div>
    </div>
  );
}

/**
 * Names a post. Two thirds of a slideshow account's captions are hashtags
 * only, so fall through the tags and the sound rather than printing "untitled".
 */
function describePost(post: EnrichedPost): string {
  const identity =
    post.hook ||
    (post.hashtags.length ? post.hashtags.slice(0, 4).map((h) => `#${h}`).join(" ") : null) ||
    (post.soundName ? post.soundName : null) ||
    "no caption text";

  return post.metrics.outlierMultiple
    ? `${formatCount(post.views)} views, that many times ${post.account}'s median. ${identity}`
    : identity;
}
