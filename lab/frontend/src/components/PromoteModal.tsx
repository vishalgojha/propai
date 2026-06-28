"use client";

import { useState, useCallback } from "react";
import * as api from "@/lib/api";

interface PromoteModalProps {
  observationId: number;
  parsed: any;
  onClose: () => void;
}

const channels = [
  { id: "whatsapp", label: "WhatsApp", icon: "💬" },
  { id: "facebook", label: "Facebook", icon: "👍" },
  { id: "instagram", label: "Instagram", icon: "📸" },
];

const aiEnabled =
  typeof process !== "undefined" &&
  process.env.NEXT_PUBLIC_ENABLE_AI_PROMO === "true";

export default function PromoteModal({ observationId, parsed, onClose }: PromoteModalProps) {
  const [channel, setChannel] = useState("whatsapp");
  const [generated, setGenerated] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [editText, setEditText] = useState("");
  const [copied, setCopied] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [error, setError] = useState("");

  const generate = useCallback(async (useAi = false) => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/promote/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ observation_id: observationId, channel, use_ai: useAi }),
      });
      if (!res.ok) {
        const err = await res.text();
        throw new Error(err);
      }
      const data = await res.json();
      setGenerated(data);
      setEditText(data.body);
    } catch (e: any) {
      setError(e.message || "Generation failed");
    } finally {
      setLoading(false);
    }
  }, [observationId, channel]);

  const enhanceWithAI = useCallback(async () => {
    setAiLoading(true);
    try {
      const res = await fetch("/api/promote/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ observation_id: observationId, channel, use_ai: true }),
      });
      if (!res.ok) throw new Error("AI enhancement failed");
      const data = await res.json();
      setGenerated(data);
      setEditText(data.body);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setAiLoading(false);
    }
  }, [observationId, channel]);

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(editText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Failed to copy");
    }
  };

  const bhk = parsed?.bhk || "";
  const building = parsed?.building_name || "";
  const market = parsed?.micro_market || "";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-2xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
          <div>
            <h2 className="text-base font-bold text-[var(--text-primary)]">Promote Listing</h2>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">
              {[bhk, building, market].filter(Boolean).join(" · ") || `#${observationId}`}
            </p>
          </div>
          <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] text-lg leading-none cursor-pointer">&times;</button>
        </div>

        {/* Channel selector */}
        <div className="px-5 pt-4 pb-2">
          <label className="text-xs text-[var(--text-muted)] uppercase tracking-wider font-bold mb-2 block">Channel</label>
          <div className="flex gap-2">
            {channels.map((ch) => (
              <button
                key={ch.id}
                onClick={() => { setChannel(ch.id); setGenerated(null); }}
                className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium border transition-colors cursor-pointer ${
                  channel === ch.id
                    ? "bg-[var(--accent-dim)] border-[var(--accent-border)] text-[var(--accent)]"
                    : "bg-[var(--bg-elevated)] border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                }`}
              >
                {ch.icon} {ch.label}
              </button>
            ))}
          </div>
        </div>

        {/* Generate button */}
        <div className="px-5 py-2">
          {!generated && (
            <button
              onClick={() => generate(false)}
              disabled={loading}
              className="w-full py-2 bg-[var(--accent)] text-[var(--on-propai-green)] rounded-lg text-sm font-bold disabled:opacity-40 cursor-pointer"
            >
              {loading ? "Generating…" : `Generate ${channels.find(c => c.id === channel)?.label} Ad`}
            </button>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="px-5 py-2">
            <p className="text-xs text-red-400">{error}</p>
          </div>
        )}

        {/* Generated text */}
        {generated && (
          <div className="flex-1 overflow-y-auto px-5 pb-2">
            <label className="text-xs text-[var(--text-muted)] uppercase tracking-wider font-bold mb-2 block">Preview & Edit</label>
            <textarea
              className="w-full h-48 p-3 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-strong)] text-sm text-[var(--text-primary)] resize-none font-mono leading-relaxed"
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
            />
            {generated.ai_enhanced && (
              <p className="text-[10px] text-[var(--blue)] mt-1">✨ AI-enhanced</p>
            )}
          </div>
        )}

        {/* Actions */}
        {generated && (
          <div className="px-5 py-3 border-t border-[var(--border)] flex items-center gap-2">
            <button
              onClick={copyToClipboard}
              className="flex-1 py-2 bg-[var(--accent)] text-[var(--on-propai-green)] rounded-lg text-sm font-bold cursor-pointer"
            >
              {copied ? "✓ Copied!" : "📋 Copy"}
            </button>
            <button
              onClick={() => {
                const uri = encodeURIComponent(editText);
                const waLink = channel === "whatsapp" ? `https://wa.me/?text=${uri}` : null;
                if (waLink) window.open(waLink, "_blank");
              }}
              className="flex-1 py-2 bg-[var(--bg-elevated)] border border-[var(--border-strong)] rounded-lg text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
            >
              {channel === "whatsapp" ? "💬 Open WhatsApp" : channel === "facebook" ? "👍 Open Facebook" : "📸 Open Instagram"}
            </button>
            {aiEnabled && (
              <button
                onClick={enhanceWithAI}
                disabled={aiLoading}
                className="px-3 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 rounded-lg text-sm font-medium text-white cursor-pointer"
              >
                {aiLoading ? "..." : "✨ AI"}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
