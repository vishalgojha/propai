"use client";

import { FormEvent, useEffect, useState } from "react";
import backendApi, { handleApiError } from "../services/api";
import { ENDPOINTS } from "../services/endpoints";

type CloudConfig = {
  configured: boolean;
  enabled: boolean;
  phoneNumberId: string;
  businessAccountId: string;
  displayPhoneNumber: string;
  apiVersion: string;
  verifyTokenSet: boolean;
  hasAccessToken: boolean;
  webhookUrl: string;
};

const fieldClass = "mt-2 w-full rounded-[10px] border border-[color:var(--border)] bg-[var(--bg-base)] px-3 py-2.5 text-sm text-[var(--text-primary)] outline-none focus:border-[color:var(--accent-border)]";

export function WabaSetup() {
  const [config, setConfig] = useState<CloudConfig | null>(null);
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [businessAccountId, setBusinessAccountId] = useState("");
  const [displayPhoneNumber, setDisplayPhoneNumber] = useState("");
  const [apiVersion, setApiVersion] = useState("v25.0");
  const [accessToken, setAccessToken] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; message: string } | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const response = await backendApi.get<{ config: CloudConfig }>(ENDPOINTS.whatsapp.cloudConfig);
        const next = response.data.config;
        setConfig(next);
        setPhoneNumberId(next.phoneNumberId || "");
        setBusinessAccountId(next.businessAccountId || "");
        setDisplayPhoneNumber(next.displayPhoneNumber || "");
        setApiVersion(next.apiVersion || "v25.0");
        setEnabled(next.enabled !== false);
      } catch (error) {
        setFeedback({ tone: "error", message: handleApiError(error) });
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setFeedback(null);
    try {
      const response = await backendApi.post<{ config: CloudConfig }>(ENDPOINTS.whatsapp.cloudConfig, {
        enabled,
        phoneNumberId: phoneNumberId.trim(),
        businessAccountId: businessAccountId.trim() || null,
        displayPhoneNumber: displayPhoneNumber.trim() || null,
        apiVersion: apiVersion.trim() || "v25.0",
        accessToken: accessToken.trim() || null,
      });
      setConfig(response.data.config);
      setAccessToken("");
      setFeedback({ tone: "success", message: "Cloud API configuration saved." });
    } catch (error) {
      setFeedback({ tone: "error", message: handleApiError(error) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="mx-auto max-w-4xl space-y-6">
      <section className="rounded-[20px] border border-[color:var(--border)] bg-[var(--bg-surface)] p-6 sm:p-8">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--accent)]">Official integration</p>
        <h2 className="mt-2 text-xl font-semibold text-[var(--text-primary)]">WhatsApp Business Cloud API</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--text-secondary)]">
          Enter the Cloud API values from your Meta Business account. PropAI does not use linked devices, QR codes, or Embedded Signup.
        </p>
      </section>

      <form onSubmit={save} className="space-y-5 rounded-[20px] border border-[color:var(--border)] bg-[var(--bg-surface)] p-6 sm:p-8">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-semibold text-[var(--text-primary)]">Manual Cloud API configuration</h3>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">The token is encrypted on save and never returned to the browser.</p>
          </div>
          <span className={config?.configured ? "rounded-full bg-[var(--accent-dim)] px-3 py-1 text-xs font-semibold text-[var(--accent)]" : "rounded-full border border-[color:var(--border)] px-3 py-1 text-xs text-[var(--text-secondary)]"}>
            {loading ? "Loading" : config?.configured ? "Configured" : "Not configured"}
          </span>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm text-[var(--text-secondary)]">Phone Number ID<input required value={phoneNumberId} onChange={(event) => setPhoneNumberId(event.target.value)} className={fieldClass} placeholder="Meta phone number ID" /></label>
          <label className="text-sm text-[var(--text-secondary)]">WhatsApp Business Account ID<input value={businessAccountId} onChange={(event) => setBusinessAccountId(event.target.value)} className={fieldClass} placeholder="WABA ID" /></label>
          <label className="text-sm text-[var(--text-secondary)]">Display phone number<input value={displayPhoneNumber} onChange={(event) => setDisplayPhoneNumber(event.target.value)} className={fieldClass} placeholder="+91..." /></label>
          <label className="text-sm text-[var(--text-secondary)]">Graph API version<input value={apiVersion} onChange={(event) => setApiVersion(event.target.value)} className={fieldClass} placeholder="v25.0" /></label>
        </div>

        <label className="block text-sm text-[var(--text-secondary)]">
          <span>Access token {config?.hasAccessToken ? "(saved — paste only to replace)" : ""}</span>
          <a href="https://business.facebook.com/settings/system-users" target="_blank" rel="noreferrer" className="ml-2 text-[var(--accent)] underline underline-offset-2">Get permanent token in Meta Business Settings ↗</a>
          <input type="password" value={accessToken} onChange={(event) => setAccessToken(event.target.value)} className={fieldClass} placeholder={config?.hasAccessToken ? "Token already saved" : "Permanent system-user access token"} />
        </label>
        <label className="flex items-center gap-3 text-sm text-[var(--text-secondary)]"><input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} /> Enable this Cloud API number</label>

        {feedback ? <div className={feedback.tone === "success" ? "rounded-[12px] bg-[var(--accent-dim)] px-4 py-3 text-sm text-[var(--accent)]" : "rounded-[12px] bg-red-500/10 px-4 py-3 text-sm text-red-300"}>{feedback.message}</div> : null}

        <button type="submit" disabled={loading || saving} className="rounded-full bg-[var(--accent)] px-5 py-2.5 text-sm font-bold text-[#02120a] disabled:opacity-50">{saving ? "Saving…" : "Save Cloud API configuration"}</button>
      </form>

      <section className="rounded-[16px] border border-[color:var(--border)] bg-[var(--bg-elevated)] p-5 text-sm text-[var(--text-secondary)]">
        Set this callback URL in Meta: <code className="rounded bg-[var(--bg-base)] px-1.5 py-0.5 text-[var(--text-primary)]">https://api.propai.live{config?.webhookUrl || "/api/whatsapp/cloud/webhook"}</code>. The verify token is configured once by the PropAI operator through the API environment.
      </section>
    </main>
  );
}
