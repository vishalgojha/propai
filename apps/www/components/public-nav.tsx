import Link from "next/link";

export function PublicNav() {
  return (
    <header className="border-b border-white/5">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4">
        <Link href="/" className="flex items-center gap-2 text-sm font-medium text-white">
          <div className="logo-dot" />
          PropAI
        </Link>
        <div className="flex items-center gap-3">
          <Link href="/broker/signup" className="rounded-full border border-[#2b3a4e] px-3.5 py-1.5 text-xs text-[#d5dfeb]">
            For brokers
          </Link>
          <a
            href="https://app.propai.live"
            className="rounded-full bg-[rgba(62, 232, 138, 0.12)] px-3.5 py-1.5 text-xs font-medium text-[#0D1A12]"
          >
            Sign in
          </a>
        </div>
      </div>
    </header>
  );
}
