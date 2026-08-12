import Link from "next/link";
import { PostsTable } from "@/components/posts-table";
import { enrich } from "@/lib/metrics";
import { explainPost, minePatterns } from "@/lib/patterns";
import { loadDataset } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function PostsPage() {
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

  const posts = enrich(dataset.posts);
  const findings = minePatterns(posts);

  const rows = posts.map((post) => ({
    id: post.id,
    hook:
      post.hook ||
      (post.hashtags.length ? post.hashtags.slice(0, 4).map((h) => `#${h}`).join(" ") : "") ||
      (post.soundName ? `sound: ${post.soundName}` : "no caption text"),
    url: post.url,
    format: post.format,
    slideCount: post.slideCount,
    createdAt: post.createdAt,
    views: post.views,
    likes: post.likes,
    comments: post.comments,
    shares: post.shares,
    saves: post.saves,
    engagementRate: post.metrics.engagementRate,
    outlierMultiple: post.metrics.outlierMultiple,
    score: post.metrics.score,
    soundName: post.soundName,
    hashtags: post.hashtags,
    // Format is already shown in its own column, so citing the format lift here
    // would just repeat it.
    reasons: explainPost(post, findings, 4)
      .filter((r) => r.dimension !== "format")
      .slice(0, 3)
      .map((r) => `${r.label} (${r.lift.toFixed(2)}×)`),
  }));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">All posts</h1>
        <p className="secondary mt-1 text-sm">
          {rows.length.toLocaleString()} posts. Sort any column; the multiple compares each post to
          your own account median rather than to some global benchmark.
        </p>
      </div>
      <PostsTable rows={rows} />
    </div>
  );
}
