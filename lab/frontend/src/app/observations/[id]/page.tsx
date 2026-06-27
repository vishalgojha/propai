"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import * as api from "@/lib/api";
import { formatBrokerPrice } from "@/lib/format";

function istDate(ts: string | null | undefined): string {
  if (!ts) return "";
  try {
    const d = new Date(ts.endsWith("Z") ? ts : ts + "Z");
    return d.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "short", timeStyle: "short" });
  } catch {
    return "";
  }
}

function fmtPrice(price: number | null | undefined, unit?: string | null): string {
  if (price == null) return "";
  if (unit === "L" || unit === "lakh") return `₹${(price / 100000).toLocaleString("en-IN")} L`;
  if (unit === "Cr" || unit === "crore") return `₹${(price / 10000000).toLocaleString("en-IN")} Cr`;
  return formatBrokerPrice(price);
}

const intentBadge: Record<string, string> = {
  SELL: "badge-green", BUY: "badge-purple", RENT: "badge-yellow",
  COMMERCIAL: "badge-orange", "PRE-LAUNCH": "badge-red",
};

export default function ObservationPage() {
  const params = useParams();
  const id = params.id as string;
  const [obs, setObs] = useState<any>(null);
  const [error, setError] = useState("");
  const [showRaw, setShowRaw] = useState(true);

  useEffect(() => {
    if (!id) return;
    const numId = parseInt(id.replace(/^P/, ""));
    if (!numId) { setError("Invalid ID"); return; }
    api.getObservation(numId)
      .then(setObs)
      .catch(e => setError(e.message));
  }, [id]);

  if (error) {
    return (
      <div className="max-w-2xl mx-auto py-8">
        <div className="text-red-500 text-center py-10 bg-[var(--bg-surface)] border border-[var(--border)] rounded-2xl">{error}</div>
      </div>
    );
  }

  if (!obs) {
    return (
      <div className="max-w-2xl mx-auto py-8">
        <div className="text-[var(--text-muted)] text-center py-10">Loading...</div>
      </div>
    );
  }

  const raw = obs.raw || {};
  const parsed = obs.parsed || {};
  const resolver = obs.resolver || {};

  const buildingName = resolver.building_name || parsed.building_name;
  const landmark = resolver.landmark_name || parsed.landmark_name;
  const brokerName = parsed.broker_name || raw.sender || "";
  const areaSqft = parsed.area_sqft ? `${parsed.area_sqft.toLocaleString("en-IN")} sqft` : null;

  const phoneClean = (parsed.broker_phone || "").replace(/[^0-9]/g, "").slice(-10);
  const waLink = phoneClean.length === 10 ? `https://wa.me/91${phoneClean}` : "";
  const displayPhone = phoneClean.length === 10 ? `+91 ${phoneClean.slice(0, 2)} XXXXX ${phoneClean.slice(-2)}` : parsed.broker_phone;
  const hasContact = brokerName || displayPhone;

  const details: string[] = [];
  if (parsed.bhk) details.push(parsed.bhk);
  if (areaSqft) details.push(areaSqft);
  if (parsed.furnishing) details.push(parsed.furnishing);
  if (parsed.location_raw && parsed.location_raw !== parsed.micro_market) details.push(parsed.location_raw);

  return (
    <div className="max-w-2xl mx-auto">
      <a href={document.referrer || "/"} className="text-xs text-[var(--blue)] no-underline hover:underline">&larr; Back</a>

      <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-2xl p-5 mt-3">
        {/* Header */}
        <div className="flex items-center gap-2 flex-wrap">
          {parsed.intent && <span className={`badge ${intentBadge[parsed.intent] || "badge-blue"}`}>{parsed.intent}</span>}
          <span className="text-xs text-[var(--text-muted)]">{raw.group_name || raw.source || ""}</span>
          <span className="text-xs text-[var(--text-muted)] ml-auto">{istDate(raw.timestamp)}</span>
        </div>

        {/* Building + price */}
        <div className="mt-3">
          {buildingName && <div className="text-lg font-bold text-[var(--text-primary)]">{buildingName}</div>}
          {details.length > 0 && <div className="text-xs text-[var(--text-secondary)] mt-0.5">{details.join(" · ")}</div>}
          {parsed.price != null && (
            <div className="text-xl font-bold text-[var(--text-primary)] mt-1.5">
              {parsed.price_unit ? fmtPrice(parsed.price, parsed.price_unit) : formatBrokerPrice(parsed.price)}
            </div>
          )}
        </div>

        {/* Location details */}
        {(parsed.micro_market || landmark) && (
          <div className="mt-2 text-xs text-[var(--text-secondary)] space-y-0.5">
            {parsed.micro_market && <div>Location: {parsed.micro_market}</div>}
            {landmark && <div>Landmark: {landmark}</div>}
          </div>
        )}

        {/* Divider */}
        <div className="border-t border-[var(--border)] my-3" />

        {/* Contact — only shown if there's actually contact info */}
        {hasContact && (
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              {brokerName && <div className="text-sm font-semibold text-[var(--text-primary)] truncate">{brokerName}</div>}
              {displayPhone && <div className="text-xs text-[var(--text-secondary)]">{displayPhone}</div>}
            </div>
            {waLink && (
              <a href={waLink} target="_blank" rel="noopener noreferrer" className="bg-green-600 hover:bg-green-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg no-underline shrink-0">Chat on WhatsApp</a>
            )}
          </div>
        )}

        {/* Divider — only if there's contact above or there's a message below */}
        {(hasContact || raw.message) && <div className="border-t border-[var(--border)] my-3" />}

        {/* Original message — shown inline, no separate card */}
        {raw.message && (
          <div>
            <button onClick={() => setShowRaw(s => !s)} className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider font-bold cursor-pointer">{showRaw ? "▲ Hide" : "▼ Show"} original message</button>
            {showRaw && (
              <div className="mt-2 p-3 bg-[var(--bg-elevated)] border border-[var(--border-strong)] rounded-lg text-xs whitespace-pre-wrap text-[var(--text-primary)] leading-relaxed">{raw.message}</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
