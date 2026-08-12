import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Valycode — TikTok performance studio",
  description:
    "Turn your TikTok export into a performance dashboard, viral hook ideas, and finished slideshows.",
};

const NAV = [
  { href: "/", label: "Dashboard" },
  { href: "/posts", label: "Posts" },
  { href: "/patterns", label: "Patterns" },
  { href: "/audience", label: "Audience" },
  { href: "/ideas", label: "Hook ideas" },
  { href: "/studio", label: "Slideshow studio" },
  { href: "/ingest", label: "Data" },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header
          className="sticky top-0 z-10 backdrop-blur"
          style={{ background: "color-mix(in srgb, var(--page) 88%, transparent)", borderBottom: "1px solid var(--border)" }}
        >
          <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-5 py-3">
            <Link href="/" className="text-[15px] font-semibold tracking-tight">
              Valycode
            </Link>
            <nav className="flex flex-wrap gap-x-5 gap-y-1 text-[13px]">
              {NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="secondary transition-colors hover:text-[var(--text-primary)]"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-5 py-8">{children}</main>
      </body>
    </html>
  );
}
