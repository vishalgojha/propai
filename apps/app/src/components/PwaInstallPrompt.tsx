"use client";

import React from "react";

export function PwaInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = React.useState<any>(null);
  const [isInstallable, setIsInstallable] = React.useState(false);
  const [dismissed, setDismissed] = React.useState(false);
  const [isMobile, setIsMobile] = React.useState(false);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    setIsMobile(/Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent));
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setIsInstallable(true);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const result = await deferredPrompt.userChoice;
    if (result.outcome === "accepted") {
      setIsInstallable(false);
      setDismissed(true);
    }
    setDeferredPrompt(null);
  };

  if (!isInstallable || dismissed || !isMobile) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-md animate-in slide-in-from-bottom-4">
      <div className="rounded-[14px] border border-[color:var(--accent-border)] bg-[var(--bg-surface)] p-4 shadow-[0_8px_32px_rgba(0,0,0,0.4)]">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-[var(--accent-dim)]">
            <svg className="h-5 w-5 text-[var(--accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v12m0 0l-3-3m3 3l3-3M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold text-[var(--text-primary)]">Install PropAI Pulse</p>
            <p className="mt-0.5 text-[12px] leading-5 text-[var(--text-secondary)]">
              Install on your home screen for a full-screen experience and to keep your WhatsApp connection alive.
            </p>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <button
            onClick={handleInstall}
            className="flex-1 rounded-[10px] bg-[var(--accent)] px-4 py-2.5 text-[12px] font-bold uppercase tracking-[0.08em] text-black transition hover:brightness-95"
          >
            Install
          </button>
          <button
            onClick={() => setDismissed(true)}
            className="rounded-[10px] border border-[color:var(--border)] bg-[var(--bg-elevated)] px-4 py-2.5 text-[12px] font-semibold text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]"
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}
