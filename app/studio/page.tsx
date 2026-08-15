"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import JSZip from "jszip";
import {
  DEFAULT_STYLE,
  SlideCanvas,
  renderSlideBlob,
  type SlideStyle,
} from "@/components/slide-canvas";
import type { Slide, SlideshowPlan } from "@/lib/types";

export default function StudioPage() {
  return (
    <Suspense fallback={<p className="secondary text-sm">Loading…</p>}>
      <Studio />
    </Suspense>
  );
}

function Studio() {
  const params = useSearchParams();

  const [hook, setHook] = useState("");
  const [notes, setNotes] = useState("");
  const [slideCount, setSlideCount] = useState(7);
  const [plan, setPlan] = useState<SlideshowPlan | null>(null);
  const [style, setStyle] = useState<SlideStyle>(DEFAULT_STYLE);
  const [images, setImages] = useState<Record<number, HTMLImageElement>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    const incoming = params.get("hook");
    if (incoming) setHook(incoming);
  }, [params]);

  async function generate() {
    if (!hook.trim()) {
      setError("Give it a hook to build around.");
      return;
    }
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const response = await fetch("/api/slideshow", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ hook, notes: notes.trim() || null, slideCount }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Generation failed");
      setPlan(data.plan);
      setImages({});
      if (data.note) setNote(data.note);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setBusy(false);
    }
  }

  const updateSlide = useCallback((index: number, patch: Partial<Slide>) => {
    setPlan((prev) =>
      prev
        ? { ...prev, slides: prev.slides.map((s) => (s.index === index ? { ...s, ...patch } : s)) }
        : prev,
    );
  }, []);

  async function attachImage(index: number, file: File) {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      setImages((prev) => ({ ...prev, [index]: image }));
      URL.revokeObjectURL(url);
    };
    image.src = url;
  }

  async function downloadZip() {
    if (!plan) return;
    setBusy(true);
    try {
      const zip = new JSZip();
      for (const slide of plan.slides) {
        const blob = await renderSlideBlob(slide, style, images[slide.index] ?? null, plan.slides.length);
        zip.file(`slide-${String(slide.index).padStart(2, "0")}.png`, blob);
      }
      zip.file(
        "caption.txt",
        `${plan.caption}\n\n${plan.hashtags.map((t) => `#${t.replace(/^#/, "")}`).join(" ")}\n\nSound: ${plan.soundSuggestion}`,
      );
      zip.file(
        "shot-list.txt",
        plan.slides
          .map((s) => `SLIDE ${s.index}\nText: ${s.onImageText}\n${s.subText ? `Sub: ${s.subText}\n` : ""}Image: ${s.imageBrief}\nWhy: ${s.purpose}\n`)
          .join("\n"),
      );

      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${slugify(plan.title)}.zip`;
      anchor.click();
      URL.revokeObjectURL(url);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[34px] leading-[1.08] font-medium tracking-[-0.035em]">Slideshow studio</h1>
        <p className="secondary mt-1 max-w-2xl text-sm">
          Give it a hook and it writes the whole post, every slide&apos;s on-image text, a shot brief
          for the picture, the caption and the hashtags. Slides render at 1080×1920 and export as
          ready-to-post PNGs.
        </p>
      </div>

      <div className="panel space-y-4 px-5 py-4">
        <label className="flex flex-col gap-1.5">
          <span className="muted text-[11.5px] font-medium">Hook</span>
          <input
            value={hook}
            onChange={(e) => setHook(e.target.value)}
            placeholder="The pricing mistake that cost me 6 months"
            className="px-3 py-2.5 text-sm"
          />
        </label>

        <div className="flex flex-wrap gap-4">
          <label className="flex min-w-[280px] flex-1 flex-col gap-1.5">
            <span className="muted text-[11.5px] font-medium">
              Direction (optional)
            </span>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Keep it blunt, end on a question"
              className="px-3 py-2.5 text-sm"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="muted text-[11.5px] font-medium">Slides</span>
            <select
              value={slideCount}
              onChange={(e) => setSlideCount(Number(e.target.value))}
              className="px-3 py-2.5 text-sm"
            >
              {[4, 5, 6, 7, 8, 9, 10, 12].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>

          <button
            onClick={() => void generate()}
            disabled={busy}
            className="self-end rounded-[8px] px-5 py-2.5 text-sm font-medium disabled:opacity-50"
            style={{ background: "var(--accent)", color: "var(--on-accent)" }}
          >
            {busy ? "Building…" : "Build the slideshow"}
          </button>
        </div>
      </div>

      {note && <p className="muted text-sm">{note}</p>}
      {error && (
        <div
          className="panel px-4 py-3 text-sm"
          style={{ borderColor: "var(--data-drag)", color: "var(--data-drag)" }}
        >
          {error}
        </div>
      )}

      {plan && (
        <>
          <section className="panel space-y-3 px-5 py-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-[19px] font-medium tracking-[-0.02em]">{plan.title}</h2>
                <p className="secondary mt-1 max-w-2xl text-sm">{plan.strategy}</p>
              </div>
              <button
                onClick={() => void downloadZip()}
                disabled={busy}
                className="rounded-[8px] px-4 py-2 text-sm font-medium disabled:opacity-50"
                style={{ background: "var(--accent)", color: "var(--on-accent)" }}
              >
                {busy ? "Rendering…" : "Download all slides"}
              </button>
            </div>

            <StyleControls style={style} onChange={setStyle} />
          </section>

          <div className="space-y-5">
            {plan.slides.map((slide) => (
              <SlideEditor
                key={slide.index}
                slide={slide}
                total={plan.slides.length}
                style={style}
                image={images[slide.index] ?? null}
                onChange={(patch) => updateSlide(slide.index, patch)}
                onImage={(file) => void attachImage(slide.index, file)}
              />
            ))}
          </div>

          <section className="panel space-y-3 px-5 py-4">
            <h2 className="font-semibold">Caption</h2>
            <p className="whitespace-pre-wrap text-sm leading-relaxed">{plan.caption}</p>
            <p className="secondary text-sm">
              {plan.hashtags.map((t) => `#${t.replace(/^#/, "")}`).join(" ")}
            </p>
            <p className="muted text-sm">♪ {plan.soundSuggestion}</p>
          </section>
        </>
      )}
    </div>
  );
}

function SlideEditor({
  slide,
  total,
  style,
  image,
  onChange,
  onImage,
}: {
  slide: Slide;
  total: number;
  style: SlideStyle;
  image: HTMLImageElement | null;
  onChange: (patch: Partial<Slide>) => void;
  onImage: (file: File) => void;
}) {
  return (
    <article className="panel grid gap-5 px-5 py-5 md:grid-cols-[220px_minmax(0,1fr)]">
      <div className="space-y-2">
        <SlideCanvas slide={slide} style={style} image={image} total={total} />
        <label className="block">
          <span className="sr-only">Background image for slide {slide.index}</span>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onImage(file);
            }}
            className="w-full text-xs file:mr-2 file:rounded-md file:border-0 file:px-2 file:py-1 file:text-xs"
          />
        </label>
      </div>

      <div className="space-y-3">
        <div className="flex items-baseline gap-2">
          <span
            className="rounded-full px-2.5 py-0.5 text-xs font-semibold "
            style={{ background: "var(--accent)", color: "var(--on-accent)" }}
          >
            Slide {slide.index}
          </span>
          <span className="muted text-xs">{slide.purpose}</span>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="muted text-[11.5px] font-medium">On-image text</span>
          <textarea
            value={slide.onImageText}
            onChange={(e) => onChange({ onImageText: e.target.value })}
            rows={2}
            className="resize-y px-3 py-2 text-sm"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="muted text-[11.5px] font-medium">Supporting line</span>
          <input
            value={slide.subText ?? ""}
            onChange={(e) => onChange({ subText: e.target.value || null })}
            className="px-3 py-2 text-sm"
            placeholder="optional"
          />
        </label>

        <div>
          <p className="muted text-[11.5px] font-medium">Picture brief</p>
          <p className="secondary mt-1 text-sm leading-relaxed">{slide.imageBrief}</p>
        </div>
      </div>
    </article>
  );
}

const PRESETS: { label: string; style: Partial<SlideStyle> }[] = [
  { label: "Ink", style: { background: "#111111", textColor: "#ffffff", accentColor: "#e8e3d8" } },
  { label: "Paper", style: { background: "#f4f1ea", textColor: "#141414", accentColor: "#8a6a4a" } },
  { label: "Deep blue", style: { background: "#0e2a47", textColor: "#ffffff", accentColor: "#8ec1f5" } },
  { label: "Clay", style: { background: "#c2543a", textColor: "#fff8f2", accentColor: "#ffd9c7" } },
];

function StyleControls({
  style,
  onChange,
}: {
  style: SlideStyle;
  onChange: (style: SlideStyle) => void;
}) {
  return (
    <div className="flex flex-wrap items-end gap-4 text-sm">
      <div className="flex flex-col gap-1.5">
        <span className="muted text-[11.5px] font-medium">Look</span>
        <div className="flex gap-2">
          {PRESETS.map((preset) => (
            <button
              key={preset.label}
              onClick={() => onChange({ ...style, ...preset.style })}
              className="rounded-md border px-2.5 py-1.5 text-xs"
              style={{
                borderColor:
                  style.background === preset.style.background ? "var(--accent)" : "var(--line)",
              }}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="muted text-[11.5px] font-medium">Text position</span>
        <select
          value={style.align}
          onChange={(e) => onChange({ ...style, align: e.target.value as SlideStyle["align"] })}
          className="px-3 py-1.5 text-xs"
        >
          <option value="top">Top</option>
          <option value="center">Centre</option>
          <option value="bottom">Bottom</option>
        </select>
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="muted text-[11.5px] font-medium">
          Text size {Math.round(style.fontScale * 100)}%
        </span>
        <input
          type="range"
          min={0.6}
          max={1.4}
          step={0.05}
          value={style.fontScale}
          onChange={(e) => onChange({ ...style, fontScale: Number(e.target.value) })}
          className="w-36"
        />
      </label>
    </div>
  );
}

function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 50) || "slideshow"
  );
}
