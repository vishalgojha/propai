"use client";

import { useCallback, useState } from "react";

type ViewMode = "grid" | "list";

export function ViewToggle({ onChange }: { onChange: (view: ViewMode) => void }) {
  const [view, setView] = useState<ViewMode>("grid");

  const toggle = useCallback((next: ViewMode) => {
    setView(next);
    onChange(next);
  }, [onChange]);

  return (
    <div className="flex items-center gap-1 rounded-xl border border-[#243040] bg-[#0d1117] p-1">
      <button
        type="button"
        onClick={() => toggle("grid")}
        className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
          view === "grid" ? "bg-[#3EE88A] text-black" : "text-[#94a3b8] hover:text-white"
        }`}
      >
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-current"><path d="M3 3h7v7H3V3zm11 0h7v7h-7V3zM3 14h7v7H3v-7zm11 0h7v7h-7v-7z"/></svg>
        Grid
      </button>
      <button
        type="button"
        onClick={() => toggle("list")}
        className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
          view === "list" ? "bg-[#3EE88A] text-black" : "text-[#94a3b8] hover:text-white"
        }`}
      >
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-current"><path d="M3 4h18v2H3V4zm0 7h18v2H3v-2zm0 7h18v2H3v-2z"/></svg>
        List
      </button>
    </div>
  );
}
