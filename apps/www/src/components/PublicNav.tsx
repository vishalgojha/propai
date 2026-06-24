"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { Search, Building2, Map, BarChart3, Moon, Sun } from "lucide-react";
import { useTheme } from "./ThemeProvider";
import { cn } from "@/lib/utils";

const BOTTOM_NAV = [
  { href: "/", label: "Search", icon: Search },
  { href: "/listings", label: "Listings", icon: Building2 },
  { href: "/explore", label: "Map", icon: Map },
  { href: "/intelligence", label: "Insights", icon: BarChart3 },
];

export default function PublicNav() {
  const { theme, toggleTheme } = useTheme();
  const pathname = usePathname();

  if (pathname === "/explore") return null;

  return (
    <>
      {/* Desktop nav */}
      <nav className="hidden md:flex sticky top-0 z-50 w-full border-b border-[color:var(--border)] bg-[var(--bg-base)]/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between px-8 py-3">
          <div className="flex items-center gap-8">
            <Link href="/" className="flex items-center gap-2 group">
              <img src="/favicon.svg" alt="PropAI" className="h-8 w-8 rounded-[10px]" />
              <span className="text-[16px] font-bold tracking-tight text-[var(--text-primary)] sm:text-[18px]">
                PropAI <span className="text-[var(--accent)]">Pulse</span>
              </span>
            </Link>
            <div className="flex items-center gap-6">
              {BOTTOM_NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "text-[11px] font-bold uppercase tracking-[0.12em] transition-colors",
                    pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href))
                      ? "text-[var(--accent)]"
                      : "text-[var(--text-secondary)] hover:text-[var(--accent)]",
                  )}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="h-5 w-px bg-white/5" aria-hidden="true" />
            <Link
              href="/about"
              className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--text-secondary)] hover:text-[var(--accent)] transition-colors"
            >
              About
            </Link>
            <Link
              href="/contact"
              className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--text-secondary)] hover:text-[var(--accent)] transition-colors"
            >
              Contact
            </Link>
            <Link
              href="/onboarding"
              className="rounded-full border border-white/5 bg-[var(--bg-surface)] px-4 py-1.5 text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--text-primary)] hover:border-[var(--accent)]/30 hover:text-[var(--accent)] transition-all"
            >
              For Realtors
            </Link>
            <button
              type="button"
              onClick={toggleTheme}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-[color:var(--border)] bg-[var(--bg-elevated)] text-[var(--text-secondary)] transition-colors hover:text-[var(--accent)]"
              aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            >
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </nav>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 border-t border-white/5 bg-[var(--bg-base)]/95 backdrop-blur-xl safe-area-bottom">
        <div className="flex items-center justify-around py-2 px-2">
          {BOTTOM_NAV.map((item) => {
            const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex flex-col items-center gap-0.5 px-4 py-1 rounded-xl transition-colors",
                  isActive ? "text-[var(--accent)]" : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]",
                )}
              >
                <item.icon className={cn("h-5 w-5", isActive && "drop-shadow-[0_0_6px_rgba(62,232,138,0.4)]")} />
                <span className="text-[9px] font-bold uppercase tracking-[0.08em]">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
