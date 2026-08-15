import Link from "next/link";
import { Stat } from "@/components/charts";
import { analyseComments } from "@/lib/comments";
import { enrich, formatCount, formatPercent } from "@/lib/metrics";
import { loadDataset } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function AudiencePage() {
  const dataset = await loadDataset();

  if (!dataset) {
    return (
      <p className="secondary text-sm">
        No data loaded.{" "}
        <Link href="/ingest" className="underline">
          Import your JSON
        </Link>{" "}
        to get started.
      </p>
    );
  }

  if (!dataset.comments?.length) {
    return <NoComments />;
  }

  const posts = enrich(dataset.posts);
  const insights = analyseComments(posts, dataset.comments);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-[34px] leading-[1.08] font-medium tracking-[-0.035em]">Audience</h1>
        <p className="secondary mt-1 max-w-3xl text-sm">
          Your metrics say which posts won. Your comments say what people wanted next, and a
          question someone bothered to type is a content request with demand already proven.
        </p>
      </div>

      <div className="panel grid grid-cols-2 gap-x-8 gap-y-8 px-6 py-6 lg:grid-cols-4">
        <Stat label="Comments read" value={formatCount(insights.commentCount)} />
        <Stat
          label="Asking for something"
          value={formatPercent(insights.questionRate, 0)}
          detail="questions + requests"
        />
        <Stat
          label="Tagging a friend"
          value={formatPercent(insights.tagRate, 0)}
          detail="organic reach signal"
        />
        <Stat
          label="Pushing back"
          value={formatPercent(insights.objectionRate, 0)}
          detail="objections"
        />
      </div>

      {insights.unmatchedComments > 0 && (
        <p className="muted text-sm">
          {formatCount(insights.unmatchedComments)} comments could not be matched to a post in your
          export, usually because they belong to posts outside the scrape window.
        </p>
      )}

      <section className="space-y-3">
        <h2 className="text-[19px] font-medium tracking-[-0.02em]">What they are asking for</h2>
        <p className="secondary max-w-3xl text-sm">
          Ranked by likes and replies, because a question with fifty likes is fifty people asking it
          at once. These are the highest-confidence post ideas in the entire dataset, the demand is
          already measured rather than predicted.
        </p>
        <div className="panel divide-y" style={{ borderColor: "var(--line)" }}>
          {insights.demandSignals.slice(0, 15).map((signal, i) => (
            <div key={i} className="px-5 py-3" style={{ borderTop: i ? "1px solid var(--line)" : undefined }}>
              <div className="flex items-start justify-between gap-4">
                <p className="text-sm leading-snug">{signal.text}</p>
                <div className="shrink-0 text-right">
                  <div className="text-sm font-semibold" style={{ fontVariantNumeric: "tabular-nums" }}>
                    {formatCount(signal.likes)}
                  </div>
                  <div className="muted text-[10.5px]">likes</div>
                </div>
              </div>
              <p className="muted mt-1 text-xs">
                <span
                  className="mr-2 rounded-full px-2 py-0.5"
                  style={{ background: "var(--surface-sunken)", color: "var(--text-secondary)" }}
                >
                  {signal.intent}
                </span>
                {signal.postHook && <>on “{signal.postHook}”</>}
                {signal.postViews !== null && ` · ${formatCount(signal.postViews)} views`}
                {signal.replyCount > 0 && ` · ${signal.replyCount} replies`}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-[19px] font-medium tracking-[-0.02em]">Their words, not yours</h2>
        <p className="secondary max-w-3xl text-sm">
          Terms your audience uses in questions that you rarely use yourself. This gap matters
          because people search and think in their own vocabulary, a hook written in your words has
          to be translated before it lands, and most viewers will not do the translating.
        </p>
        <div className="panel scroll-x">
          <table className="w-full min-w-[420px] text-sm">
            <thead>
              <tr className="muted text-left text-[11px]">
                <th className="px-4 py-2.5 font-medium">Term</th>
                <th className="px-3 py-2.5 text-right font-medium">They say it</th>
                <th className="px-3 py-2.5 text-right font-medium">You say it</th>
              </tr>
            </thead>
            <tbody>
              {insights.vocabulary.map((term) => (
                <tr key={term.term} style={{ borderTop: "1px solid var(--line)" }}>
                  <td className="px-4 py-2 font-medium">{term.term}</td>
                  <td
                    className="secondary px-3 py-2 text-right"
                    style={{ fontVariantNumeric: "tabular-nums" }}
                  >
                    {term.audienceCount}
                  </td>
                  <td
                    className="secondary px-3 py-2 text-right"
                    style={{ fontVariantNumeric: "tabular-nums" }}
                  >
                    {term.creatorCount === 0 ? "never" : term.creatorCount}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-[19px] font-medium tracking-[-0.02em]">Most-liked comments</h2>
        <div className="panel divide-y" style={{ borderColor: "var(--line)" }}>
          {insights.topComments.map((comment, i) => (
            <div key={i} className="px-5 py-3" style={{ borderTop: i ? "1px solid var(--line)" : undefined }}>
              <div className="flex items-start justify-between gap-4">
                <p className="text-sm leading-snug">{comment.text}</p>
                <span
                  className="shrink-0 text-sm font-semibold"
                  style={{ fontVariantNumeric: "tabular-nums" }}
                >
                  {formatCount(comment.likes)}
                </span>
              </div>
              {comment.postHook && <p className="muted mt-1 text-xs">on “{comment.postHook}”</p>}
            </div>
          ))}
        </div>
      </section>

      <section className="panel flex flex-wrap items-center justify-between gap-4 px-5 py-4">
        <div>
          <h2 className="font-semibold">Turn demand into posts</h2>
          <p className="secondary text-sm">
            Hook generation now reads these questions and this vocabulary alongside your metrics.
          </p>
        </div>
        <Link
          href="/ideas"
          className="rounded-[8px] px-4 py-2 text-sm font-medium "
          style={{ background: "var(--accent)" }}
        >
          Generate hooks
        </Link>
      </section>
    </div>
  );
}

function NoComments() {
  return (
    <div className="panel mx-auto max-w-2xl px-8 py-10">
      <h1 className="text-[21px] font-medium tracking-[-0.025em]">No comments loaded</h1>
      <p className="secondary mt-3 text-sm leading-relaxed">
        Your posts export does not contain comment text, TikTok scrapers put comments in a separate
        dataset. If you are using the Apify TikTok scraper, run its{" "}
        <strong>comments</strong> actor against the same profiles and export that JSON too.
      </p>
      <p className="secondary mt-3 text-sm leading-relaxed">
        Then drop that file on the{" "}
        <Link href="/ingest" className="underline">
          Data
        </Link>{" "}
        page alongside your posts. Comment files are recognised by shape and joined to posts
        automatically, you do not have to tell it which is which.
      </p>
      <p className="secondary mt-3 text-sm leading-relaxed">
        It is worth doing. Comments are the only place your audience tells you what they want in
        their own words, and questions with a lot of likes are the highest-confidence post ideas
        available anywhere in your data.
      </p>
    </div>
  );
}
