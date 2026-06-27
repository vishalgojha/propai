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
      <div className="max-w-3xl mx-auto py-8">
        <div className="text-red-500 text-center py-10 bg-[var(--bg-surface)] border border-[var(--border)] rounded-2xl">{error}</div>
      </div>
    );
  }

  if (!obs) {
    return (
      <div className="max-w-3xl mx-auto py-8">
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

  return (
    <div className="max-w-3xl mx-auto">
      <a href="/" className="text-xs text-[var(--blue)] no-underline hover:underline">&larr; Back to Dashboard</a>

      {/* ── Header ── */}
      <div className="flex items-center gap-3 mt-4 mb-1">
        {parsed.intent && <span className={`badge ${intentBadge[parsed.intent] || "badge-blue"}`}>{parsed.intent}</span>}
        <span className="text-sm text-[var(--text-secondary)]">{raw.group_name || raw.source || ""}</span>
        <span className="text-sm text-[var(--text-muted)] ml-auto">{istDate(raw.timestamp)}</span>
      </div>

      {/* ── Property Card ── */}
      <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-2xl p-6 mt-2">
        {buildingName && (
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">{buildingName}</h1>
        )}

        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-sm text-[var(--text-secondary)]">
          {parsed.bhk && <span>{parsed.bhk}</span>}
          {areaSqft && <span>{areaSqft}</span>}
          {parsed.furnishing && <span>{parsed.furnishing}</span>}
        </div>

        {parsed.price != null && (
          <div className="text-2xl font-bold text-[var(--text-primary)] mt-3">
            {parsed.price_unit ? fmtPrice(parsed.price, parsed.price_unit) : formatBrokerPrice(parsed.price)}
          </div>
        )}

        <div className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 mt-4 text-sm">
          {parsed.micro_market && (
            <>
              <span className="text-[var(--text-muted)]">Location</span>
              <span className="text-[var(--text-primary)]">{parsed.micro_market}{parsed.location_raw ? ` (${parsed.location_raw})` : ""}</span>
            </>
          )}
          {landmark && (
            <>
              <span className="text-[var(--text-muted)]">Landmark</span>
              <span className="text-[var(--text-primary)]">{landmark}</span>
            </>
          )}
          {parsed.principal && (
            <>
              <span className="text-[var(--text-muted)]">Posted by</span>
              <span className="text-[var(--text-primary)]">{parsed.principal}</span>
            </>
          )}
        </div>
      </div>

      {/* ── Broker Card ── */}
      <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-2xl p-5 mt-4">
        <div className="text-[11px] text-[var(--text-muted)] uppercase tracking-widest font-bold mb-3">CONTACT</div>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-[var(--text-primary)]">{brokerName}</div>
            <div className="text-sm text-[var(--text-secondary)] mt-0.5">{displayPhone}</div>
          </div>
          {waLink && (
            <a
              href={waLink}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-green-600 hover:bg-green-700 text-white text-sm font-semibold px-4 py-2 rounded-lg no-underline"
            >
              Chat on WhatsApp
            </a>
          )}
        </div>
      </div>

      {/* ── Original Message ── */}
      <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-2xl p-5 mt-4">
        <button
          onClick={() => setShowRaw(s => !s)}
          className="text-[11px] text-[var(--text-muted)] uppercase tracking-widest font-bold w-full text-left flex items-center justify-between cursor-pointer"
        >
          <span>Original Message</span>
          <span className="text-xs">{showRaw ? "▲" : "▼"}</span>
        </button>
        {showRaw && (
          <div className="mt-3 p-4 bg-[var(--bg-elevated)] border border-[var(--border-strong)] rounded-lg text-sm whitespace-pre-wrap text-[var(--text-primary)] leading-relaxed">
            {raw.message || "—"}
          </div>
        )}
      </div>
    </div>
  );
}
