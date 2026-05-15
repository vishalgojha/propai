import Link from "next/link";

export function PublicNav() {
  return (
    <header className="border-b border-white/5">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5">
        <Link href="/" className="font-display text-2xl tracking-[0.2em] text-[#25d366]">
          PROPAI
        </Link>
        <div className="hidden text-sm text-[#8798ae] md:block">Verified listing discovery across active broker networks</div>
        <div className="flex items-center gap-4 text-sm">
          <Link href="/broker/signup" className="rounded-full border border-[#2b3a4e] px-4 py-2 text-[#d5dfeb]">For Brokers</Link>
          <a href="https://app.propai.live" className="text-white">Sign in</a>
        </div>
      </div>
    </header>
  );
}
