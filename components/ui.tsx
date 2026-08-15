import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Shared shells. Sections are separated by rule and rhythm rather than by
 * wrapping everything in a card, so elevation stays meaningful where it is
 * actually used.
 */

export function Section({
  title,
  lede,
  action,
  children,
}: {
  title: string;
  lede?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="border-t pt-10" style={{ borderColor: "var(--line)" }}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-8 gap-y-2">
        <h2 className="text-[19px] font-medium tracking-[-0.02em]">{title}</h2>
        {action}
      </div>
      {lede && (
        <p className="secondary mt-2.5 max-w-[70ch] text-[13.5px] leading-relaxed">{lede}</p>
      )}
      <div className="mt-7">{children}</div>
    </section>
  );
}

export function Notice({
  tone = "warn",
  title,
  children,
}: {
  tone?: "warn" | "accent";
  title: string;
  children: ReactNode;
}) {
  const color = tone === "warn" ? "var(--warn)" : "var(--accent)";
  return (
    <div
      className="rounded-[10px] px-4 py-3.5 text-[13px] leading-relaxed"
      style={{
        background: "var(--surface-sunken)",
        borderLeft: `2px solid ${color}`,
      }}
    >
      <span className="font-medium">{title}</span>{" "}
      <span className="secondary">{children}</span>
    </div>
  );
}

export function ButtonLink({
  href,
  children,
  variant = "primary",
}: {
  href: string;
  children: ReactNode;
  variant?: "primary" | "ghost";
}) {
  const primary = variant === "primary";
  return (
    <Link
      href={href}
      className="inline-flex shrink-0 items-center gap-2 rounded-[8px] px-4 py-2.5 text-[13.5px] font-medium whitespace-nowrap"
      style={
        primary
          ? { background: "var(--accent)", color: "var(--on-accent)" }
          : { border: "1px solid var(--line-strong)", color: "var(--text-primary)" }
      }
    >
      {children}
    </Link>
  );
}

/** Rule-separated list. Replaces the pattern of stacking bordered cards. */
export function Rows({ children }: { children: ReactNode }) {
  return (
    <div className="panel overflow-hidden">
      <div className="divide-y" style={{ borderColor: "var(--line)" }}>
        {children}
      </div>
    </div>
  );
}

export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="panel mx-auto max-w-xl px-8 py-14 text-center">
      <h1 className="text-[21px] font-medium tracking-[-0.02em]">{title}</h1>
      <p className="secondary mx-auto mt-3 max-w-[46ch] text-[13.5px] leading-relaxed">
        {children}
      </p>
      {action && <div className="mt-7 flex justify-center">{action}</div>}
    </div>
  );
}

/** Skeleton matching the shape of what is loading, never a spinner. */
export function SkeletonRows({ rows = 4 }: { rows?: number }) {
  return (
    <div className="panel divide-y overflow-hidden" style={{ borderColor: "var(--line)" }}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-4 px-5 py-4">
          <div
            className="h-3 flex-1 rounded-full"
            style={{ background: "var(--surface-sunken)", opacity: 1 - i * 0.14 }}
          />
          <div
            className="h-3 w-16 rounded-full"
            style={{ background: "var(--surface-sunken)", opacity: 1 - i * 0.14 }}
          />
        </div>
      ))}
    </div>
  );
}
