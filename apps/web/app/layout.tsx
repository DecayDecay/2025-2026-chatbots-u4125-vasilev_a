import "./globals.css";
import Link from "next/link";
import type { ReactNode } from "react";

export const metadata = {
  title: "s&box terminal",
  description: "Steam Market terminal for s&box",
};

const nav = [
  { href: "/", label: "Dashboard" },
  { href: "/market", label: "Market" },
  { href: "/portfolio", label: "Portfolio" },
  { href: "/alerts", label: "Alerts" },
  { href: "/feedback", label: "Feedback" },
  { href: "/settings", label: "Settings" },
];

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="sticky top-0 z-50 border-b border-neutral-900/80 bg-neutral-950/70 backdrop-blur-md">
          <div className="mx-auto flex max-w-7xl items-center gap-8 px-4 py-3">
            <Link
              href="/"
              className="flex items-center gap-2 font-bold tracking-tight"
            >
              <span className="flex h-6 w-6 items-center justify-center rounded bg-gradient-to-br from-orange-400 to-orange-600 text-[11px] font-black text-black">
                s&
              </span>
              <span>
                box<span className="text-orange-500">.terminal</span>
              </span>
            </Link>
            <nav className="flex gap-1 text-sm text-neutral-400">
              {nav.map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  className="rounded-md px-3 py-1.5 transition-colors hover:bg-neutral-900 hover:text-white"
                >
                  {n.label}
                </Link>
              ))}
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
        <footer className="mx-auto max-w-7xl px-4 py-8 text-center text-[11px] text-neutral-600">
          Data from{" "}
          <a
            href="https://steamcommunity.com/market/search?appid=590830"
            target="_blank"
            rel="noreferrer"
            className="hover:text-orange-400"
          >
            Steam Community Market
          </a>
          {" · "}anonymous mode · updates every 10 min
        </footer>
      </body>
    </html>
  );
}
