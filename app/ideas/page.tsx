"use client";

import { useState } from "react";
import Link from "next/link";
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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Hook ideas</h1>
        <p className="secondary mt-1 max-w-2xl text-sm">
          Hooks generated from your measured patterns — the archetypes, subjects, sounds and formats
          that actually over-perform on your account. Every idea comes with the evidence behind it.
        </p>
      </div>

      <div className="card flex flex-wrap items-end gap-4 px-5 py-4">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="muted text-xs font-medium uppercase tracking-wide">How many</span>
          <select
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
            className="px-3 py-2 text-sm"
          >
            {[5, 6, 7, 8, 9, 10].map((n) => (
              <option key={n} value={n}>
                {n} hooks
              </option>
            ))}
          </select>
        </label>

        <label className="flex min-w-[260px] flex-1 flex-col gap-1.5 text-sm">
          <span className="muted text-xs font-medium uppercase tracking-wide">
            Focus (optional)
          </span>
          <input
            value={steer}
            onChange={(e) => setSteer(e.target.value)}
            placeholder="e.g. slideshows about pricing mistakes"
            className="px-3 py-2 text-sm"
          />
        </label>

        <button
          onClick={() => void generate()}
          disabled={busy}
          className="rounded-lg px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50"
          style={{ background: "var(--lift)" }}
        >
          {busy ? "Thinking…" : "Generate hooks"}
        </button>
      </div>

      {note && <p className="muted text-sm">{note}</p>}

      {error && (
        <div
          className="card px-4 py-3 text-sm"
          style={{ borderColor: "var(--critical)", color: "var(--critical)" }}
        >
          {error}
        </div>
      )}

      {busy && ideas.length === 0 && (
        <p className="secondary text-sm">
          Reading your top posts and measured lifts, then writing hooks against them. This takes
          around 30 seconds.
        </p>
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
    <article className="card flex flex-col gap-3 px-5 py-4">
      <header className="flex items-start justify-between gap-4">
        <p className="text-[15px] font-semibold leading-snug">{idea.hook}</p>
        <div className="shrink-0 text-right">
          <div className="text-lg font-semibold leading-none">{idea.confidence}</div>
          <div className="muted mt-0.5 text-[10px] uppercase tracking-wide">confidence</div>
        </div>
      </header>

      <div className="muted flex flex-wrap gap-2 text-xs">
        <Chip>{idea.format}</Chip>
        <Chip>{idea.angle}</Chip>
      </div>

      <p className="secondary text-sm leading-relaxed">{idea.rationale}</p>

      {idea.evidence.length > 0 && (
        <div>
          <p className="muted text-[11px] font-medium uppercase tracking-wide">Evidence</p>
          <ul className="mt-1.5 space-y-1 text-xs">
            {idea.evidence.map((line, i) => (
              <li key={i} className="secondary flex gap-2">
                <span
                  aria-hidden="true"
                  className="mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ background: "var(--lift)" }}
                />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <footer className="flex flex-wrap items-center justify-between gap-3 pt-1">
        <div className="muted text-xs">
          {idea.suggestedHashtags.slice(0, 6).map((tag) => `#${tag.replace(/^#/, "")}`).join(" ")}
          {idea.suggestedSounds.length > 0 && (
            <span className="ml-2">♪ {idea.suggestedSounds.slice(0, 2).join(", ")}</span>
          )}
        </div>
        <Link
          href={`/studio?hook=${encodeURIComponent(idea.hook)}`}
          className="rounded-lg border px-3 py-1.5 text-xs font-medium"
          style={{ borderColor: "var(--border)" }}
        >
          Build the slideshow →
        </Link>
      </footer>
    </article>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="rounded-full px-2.5 py-1"
      style={{ background: "var(--neutral)", color: "var(--text-secondary)" }}
    >
      {children}
    </span>
  );
}
