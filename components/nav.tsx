"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { MoonIcon, SunIcon } from "@phosphor-icons/react";

/**
 * Single-line navigation, 64px tall. Labels are kept short enough that the row
 * never wraps at lg; below that the links scroll horizontally rather than
 * stacking into a second line.
 */
const LINKS = [
  { href: "/", label: "Overview" },
  { href: "/posts", label: "Posts" },
  { href: "/patterns", label: "Patterns" },
  { href: "/audience", label: "Audience" },
  { href: "/ideas", label: "Ideas" },
  { href: "/studio", label: "Studio" },
  { href: "/ingest", label: "Data" },
];

export function Nav() {
  const pathname = usePathname();

  return (
    <header
      className="sticky top-0 z-40"
      style={{
        background: "color-mix(in srgb, var(--page) 82%, transparent)",
        backdropFilter: "blur(12px)",
        borderBottom: "1px solid var(--line)",
      }}
    >
      <div className="mx-auto flex h-16 w-full max-w-[1240px] items-center gap-8 px-6 lg:px-10">
        <Link href="/" className="shrink-0 text-[15px] font-semibold tracking-[-0.02em]">
          Valycode
        </Link>

        <nav className="scroll-x -mx-2 flex min-w-0 flex-1 items-center gap-1 px-2">
          {LINKS.map((link) => {
            const active = link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className="shrink-0 rounded-[8px] px-3 py-1.5 text-[13.5px] font-medium whitespace-nowrap"
                style={{
                  color: active ? "var(--text-primary)" : "var(--text-secondary)",
                  background: active ? "var(--surface-sunken)" : "transparent",
                }}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <ThemeToggle />
      </div>
    </header>
  );
}

function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark" | null>(null);

  useEffect(() => {
    const stored = document.documentElement.getAttribute("data-theme") as "light" | "dark" | null;
    setTheme(
      stored ??
        (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"),
    );
  }, []);

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("theme", next);
    } catch {
      // Private browsing; the in-memory toggle still works for this session.
    }
  }

  return (
    <button
      onClick={toggle}
      aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
      className="grid h-8 w-8 shrink-0 place-items-center rounded-[8px]"
      style={{ border: "1px solid var(--line)", color: "var(--text-secondary)" }}
    >
      {/* Rendered only after mount so the icon matches the resolved theme. */}
      {theme === "dark" ? <SunIcon size={15} weight="bold" /> : theme === "light" ? <MoonIcon size={15} weight="bold" /> : null}
    </button>
  );
}
