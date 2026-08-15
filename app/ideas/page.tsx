"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRightIcon, MusicNotesIcon } from "@phosphor-icons/react";
import { SkeletonRows } from "@/components/ui";
import type { HookIdea } from "@/lib/types";

export default function IdeasPage() {
  const [ideas, setIdeas] = useState<HookIdea[]>([]);
  const [count, setCount] = useState(8);
  const [steer, setSteer] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function generate() {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const response = await fetch("/api/ideas", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ count, steer: steer.trim() || null }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Generation failed");
      setIdeas(data.ideas);
      if (data.note) setNote(data.note);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-10">
      <header>
        <h1 className="text-[34px] leading-[1.08] font-medium tracking-[-0.035em]">Hook ideas</h1>
        <p className="secondary mt-3 max-w-[64ch] text-[14px] leading-relaxed">
          Written from your measured patterns: the archetypes, subjects, sounds and formats that
          over-perform on your account. Every idea carries the evidence behind it.
        </p>
      </header>

      <div className="panel flex flex-wrap items-end gap-5 px-5 py-5">
        <label className="flex flex-col gap-2">
          <span className="muted text-[11.5px] font-medium">How many</span>
          <select
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
            className="numeric px-3 py-2.5 text-[13.5px]"
          >
            {[5, 6, 7, 8, 9, 10].map((n) => (
              <option key={n} value={n}>
                {n} hooks
              </option>
            ))}
          </select>
        </label>

        <label className="flex min-w-[280px] flex-1 flex-col gap-2">
          <span className="muted text-[11.5px] font-medium">Focus, optional</span>
          <input
            value={steer}
            onChange={(e) => setSteer(e.target.value)}
            placeholder="slideshows about pricing mistakes"
            className="px-3 py-2.5 text-[13.5px]"
          />
        </label>

        <button
          onClick={() => void generate()}
          disabled={busy}
          className="rounded-[8px] px-5 py-2.5 text-[13.5px] font-medium disabled:opacity-50"
          style={{ background: "var(--accent)", color: "var(--on-accent)" }}
        >
          {busy ? "Writing" : "Generate hooks"}
        </button>
      </div>

      {note && <p className="muted text-[13px]">{note}</p>}

      {error && (
        <div
          className="rounded-[10px] px-4 py-3.5 text-[13px]"
          style={{ background: "var(--surface-sunken)", borderLeft: "2px solid var(--data-drag)" }}
        >
          <span className="font-medium">Generation failed.</span>{" "}
          <span className="secondary">{error}</span>
        </div>
      )}

      {busy && ideas.length === 0 && (
        <div className="space-y-4">
          <p className="secondary text-[13.5px]">
            Reading your top posts and measured lifts, then writing against them. Around 30 seconds.
          </p>
          <SkeletonRows rows={4} />
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {ideas.map((idea, index) => (
          <IdeaCard key={`${idea.hook}-${index}`} idea={idea} />
        ))}
      </div>
    </div>
  );
}

function IdeaCard({ idea }: { idea: HookIdea }) {
  return (
    <article className="panel flex h-full flex-col gap-4 px-5 py-5">
      <header className="flex items-start justify-between gap-5">
        <p className="text-[15.5px] leading-snug font-medium">{idea.hook}</p>
        <div className="shrink-0 text-right">
          <div className="numeric text-[19px] leading-none font-medium">{idea.confidence}</div>
          <div className="muted mt-1.5 text-[10.5px]">confidence</div>
        </div>
      </header>

      <div className="flex flex-wrap gap-2">
        <Chip>{idea.format}</Chip>
        <Chip>{idea.angle}</Chip>
      </div>

      <p className="secondary text-[13.5px] leading-relaxed">{idea.rationale}</p>

      {idea.evidence.length > 0 && (
        <div className="border-t pt-4" style={{ borderColor: "var(--line)" }}>
          <p className="muted text-[11px] font-medium">Evidence</p>
          <ul className="mt-2.5 space-y-2">
            {idea.evidence.map((line, i) => (
              <li key={i} className="secondary text-[12.5px] leading-relaxed">
                {line}
              </li>
            ))}
          </ul>
        </div>
      )}

      <footer
        className="mt-auto flex flex-wrap items-center justify-between gap-4 border-t pt-4"
        style={{ borderColor: "var(--line)" }}
      >
        <div className="muted min-w-0 flex-1 text-[11.5px]">
          <div className="truncate">
            {idea.suggestedHashtags.slice(0, 5).map((t) => `#${t.replace(/^#/, "")}`).join(" ")}
          </div>
          {idea.suggestedSounds.length > 0 && (
            <div className="mt-1 flex items-center gap-1.5 truncate">
              <MusicNotesIcon size={11} weight="fill" />
              {idea.suggestedSounds.slice(0, 2).join(", ")}
            </div>
          )}
        </div>
        <Link
          href={`/studio?hook=${encodeURIComponent(idea.hook)}`}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-[8px] px-3 py-2 text-[12.5px] font-medium whitespace-nowrap"
          style={{ border: "1px solid var(--line-strong)" }}
        >
          Build it <ArrowRightIcon size={12} weight="bold" />
        </Link>
      </footer>
    </article>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="rounded-full px-2.5 py-1 text-[11.5px]"
      style={{ background: "var(--surface-sunken)", color: "var(--text-secondary)" }}
    >
      {children}
    </span>
  );
}
