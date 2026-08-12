"use client";

import { useEffect, useRef } from "react";
import type { Slide } from "@/lib/types";

/**
 * Renders one slide to a 1080×1920 canvas — TikTok's native photo-post size —
 * so what you preview is exactly what exports. Background images are drawn
 * cover-fit under a scrim so burned-in text stays legible over any photo.
 */

export const SLIDE_WIDTH = 1080;
export const SLIDE_HEIGHT = 1920;

export interface SlideStyle {
  background: string;
  textColor: string;
  accentColor: string;
  /** Vertical placement of the text block. */
  align: "top" | "center" | "bottom";
  fontScale: number;
}

export const DEFAULT_STYLE: SlideStyle = {
  background: "#111111",
  textColor: "#ffffff",
  accentColor: "#e8e3d8",
  align: "center",
  fontScale: 1,
};

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (!words.length) {
      lines.push("");
      continue;
    }
    let line = words[0];
    for (const word of words.slice(1)) {
      const candidate = `${line} ${word}`;
      if (ctx.measureText(candidate).width > maxWidth) {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
    lines.push(line);
  }
  return lines;
}

export function drawSlide(
  canvas: HTMLCanvasElement,
  slide: Slide,
  style: SlideStyle,
  image: HTMLImageElement | null,
  total: number,
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  canvas.width = SLIDE_WIDTH;
  canvas.height = SLIDE_HEIGHT;

  ctx.fillStyle = style.background;
  ctx.fillRect(0, 0, SLIDE_WIDTH, SLIDE_HEIGHT);

  if (image) {
    // Cover-fit: fill the frame, crop the overflow, never distort.
    const scale = Math.max(SLIDE_WIDTH / image.width, SLIDE_HEIGHT / image.height);
    const width = image.width * scale;
    const height = image.height * scale;
    ctx.drawImage(image, (SLIDE_WIDTH - width) / 2, (SLIDE_HEIGHT - height) / 2, width, height);

    // Scrim so text keeps contrast over an arbitrary photo.
    const scrim = ctx.createLinearGradient(0, 0, 0, SLIDE_HEIGHT);
    scrim.addColorStop(0, "rgba(0,0,0,0.55)");
    scrim.addColorStop(0.5, "rgba(0,0,0,0.35)");
    scrim.addColorStop(1, "rgba(0,0,0,0.6)");
    ctx.fillStyle = scrim;
    ctx.fillRect(0, 0, SLIDE_WIDTH, SLIDE_HEIGHT);
  }

  const margin = 100;
  const maxWidth = SLIDE_WIDTH - margin * 2;

  const mainSize = Math.round(96 * style.fontScale);
  const subSize = Math.round(46 * style.fontScale);
  const mainFont = `700 ${mainSize}px system-ui, -apple-system, "Segoe UI", sans-serif`;
  const subFont = `400 ${subSize}px system-ui, -apple-system, "Segoe UI", sans-serif`;

  ctx.font = mainFont;
  const mainLines = wrapText(ctx, slide.onImageText, maxWidth);
  ctx.font = subFont;
  const subLines = slide.subText ? wrapText(ctx, slide.subText, maxWidth) : [];

  const mainLineHeight = mainSize * 1.18;
  const subLineHeight = subSize * 1.3;
  const blockHeight =
    mainLines.length * mainLineHeight + (subLines.length ? 40 + subLines.length * subLineHeight : 0);

  let y =
    style.align === "top"
      ? 260
      : style.align === "bottom"
        ? SLIDE_HEIGHT - 300 - blockHeight
        : (SLIDE_HEIGHT - blockHeight) / 2;

  ctx.textAlign = "left";
  ctx.textBaseline = "top";

  ctx.font = mainFont;
  ctx.fillStyle = style.textColor;
  for (const line of mainLines) {
    ctx.fillText(line, margin, y);
    y += mainLineHeight;
  }

  if (subLines.length) {
    y += 40;
    ctx.font = subFont;
    ctx.fillStyle = style.accentColor;
    for (const line of subLines) {
      ctx.fillText(line, margin, y);
      y += subLineHeight;
    }
  }

  // Slide counter, bottom right — orients the viewer inside the swipe.
  ctx.font = `500 ${Math.round(34 * style.fontScale)}px system-ui, sans-serif`;
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.textAlign = "right";
  ctx.fillText(`${slide.index} / ${total}`, SLIDE_WIDTH - margin, SLIDE_HEIGHT - 140);
}

export function SlideCanvas({
  slide,
  style,
  image,
  total,
  className,
}: {
  slide: Slide;
  style: SlideStyle;
  image: HTMLImageElement | null;
  total: number;
  className?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (ref.current) drawSlide(ref.current, slide, style, image, total);
  }, [slide, style, image, total]);

  return (
    <canvas
      ref={ref}
      className={className}
      style={{ width: "100%", height: "auto", display: "block", borderRadius: 8 }}
      aria-label={`Slide ${slide.index}: ${slide.onImageText}`}
    />
  );
}

/** Renders a slide off-screen and returns it as a PNG blob. */
export async function renderSlideBlob(
  slide: Slide,
  style: SlideStyle,
  image: HTMLImageElement | null,
  total: number,
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  drawSlide(canvas, slide, style, image, total);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Could not render slide"));
    }, "image/png");
  });
}
