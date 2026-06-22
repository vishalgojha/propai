"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import backendApi, { handleApiError } from "../services/api";
import { ENDPOINTS } from "../services/endpoints";
import { QrCodeIcon, SmartphoneIcon, CheckCircleIcon, LoaderIcon, XCircleIcon } from "../lib/icons";

type ConnectionStatus = "idle" | "connecting" | "qr_ready" | "connected" | "failed";

export function EvolutionSetup() {
  const [status, setStatus] = useState<ConnectionStatus>("idle");
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => {
    return stopPolling;
  }, [stopPolling]);

  const startConnection = async () => {
    setLoading(true);
    setFeedback(null);
    setStatus("connecting");
    setQrCode(null);
    try {
      await backendApi.post(ENDPOINTS.whatsapp.connect, {
        label: "Evolution",
        ownerName: "Evolution",
        connectMethod: "qr",
        gateway: "evolution",
      });
      setFeedback({ tone: "success", message: "Connection initiated. Fetching QR code..." });
      await fetchQR();
    } catch (error) {
      setStatus("failed");
      setFeedback({ tone: "error", message: handleApiError(error) });
      setLoading(false);
    }
  };

  const fetchQR = async () => {
    try {
      const response = await backendApi.get(ENDPOINTS.whatsapp.qr);
      if (response.data?.qr) {
        setQrCode(response.data.qr);
        setStatus("qr_ready");
        setLoading(false);
        startPolling();
      } else if (response.data?.ready) {
        setStatus("connected");
        setFeedback({ tone: "success", message: "WhatsApp already connected!" });
        setLoading(false);
      } else {
        setTimeout(fetchQR, 2000);
      }
    } catch (error) {
      setStatus("failed");
      setFeedback({ tone: "error", message: handleApiError(error) });
      setLoading(false);
    }
  };

  const startPolling = () => {
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const response = await backendApi.get(ENDPOINTS.whatsapp.status);
        const waStatus = response.data?.status || response.data?.whatsapp?.status || "";
        if (waStatus === "connected") {
          setStatus("connected");
          setFeedback({ tone: "success", message: "WhatsApp connected successfully!" });
          stopPolling();
        }
      } catch {
        // ignore polling errors
      }
    }, 3000);
  };

  const connectViaPairing = async () => {
    if (!phoneNumber.trim()) return;
    setLoading(true);
    setFeedback(null);
    setStatus("connecting");
    try {
      await backendApi.post(ENDPOINTS.whatsapp.connect, {
        phoneNumber: phoneNumber.trim(),
        label: "Evolution",
        ownerName: "Evolution",
        connectMethod: "pairing",
        gateway: "evolution",
      });
      setFeedback({ tone: "success", message: `Pairing code requested for ${phoneNumber}. Check your WhatsApp notifications.` });
      setLoading(false);
      startPolling();
    } catch (error) {
      setStatus("failed");
      setFeedback({ tone: "error", message: handleApiError(error) });
      setLoading(false);
    }
  };

  return (
    <main className="mx-auto max-w-4xl space-y-6">
      <section className="rounded-[20px] border border-[color:var(--border)] bg-[var(--bg-surface)] p-6 sm:p-8">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--accent)]">QR pairing</p>
        <h2 className="mt-2 text-xl font-semibold text-[var(--text-primary)]">Evolution API — Connect Broker Phone</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--text-secondary)]">
          Scan the QR code with your broker WhatsApp phone to connect via Evolution API.
          Works just like the old Baileys QR flow — groups, messages, everything.
        </p>
      </section>

      <section className="rounded-[20px] border border-[color:var(--border)] bg-[var(--bg-surface)] p-6 sm:p-8">
        <div className="flex items-center justify-between gap-4 mb-6">
          <h3 className="text-base font-semibold text-[var(--text-primary)]">Step 1: Connect via QR</h3>
          <span className={status === "connected" ? "rounded-full bg-[var(--accent-dim)] px-3 py-1 text-xs font-semibold text-[var(--accent)]" : status === "qr_ready" ? "rounded-full bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-300" : status === "failed" ? "rounded-full bg-red-500/10 px-3 py-1 text-xs font-semibold text-red-300" : "rounded-full border border-[color:var(--border)] px-3 py-1 text-xs text-[var(--text-secondary)]"}>
            {status === "connected" ? "Connected" : status === "qr_ready" ? "Scan QR" : status === "connecting" ? "Connecting..." : status === "failed" ? "Failed" : "Not connected"}
          </span>
        </div>

        {feedback ? (
          <div className={feedback.tone === "success" ? "mb-4 rounded-[12px] bg-[var(--accent-dim)] px-4 py-3 text-sm text-[var(--accent)]" : "mb-4 rounded-[12px] bg-red-500/10 px-4 py-3 text-sm text-red-300"}>{feedback.message}</div>
        ) : null}

        <div className="flex flex-col items-center gap-6">
          {status === "qr_ready" && qrCode ? (
            <div className="flex flex-col items-center gap-4">
              <div className="rounded-[16px] border-2 border-[color:var(--accent-border)] bg-white p-4">
                <img src={`data:image/png;base64,${qrCode}`} alt="WhatsApp QR Code" className="h-64 w-64" />
              </div>
              <p className="text-xs text-[var(--text-secondary)]">Scan this QR code with your broker phone&apos;s WhatsApp</p>
              <button
                type="button"
                onClick={fetchQR}
                className="rounded-full border border-[color:var(--border)] bg-[var(--bg-elevated)] px-4 py-2 text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
              >
                Refresh QR
              </button>
            </div>
          ) : status === "connected" ? (
            <div className="flex flex-col items-center gap-3 py-8">
              <CheckCircleIcon className="h-16 w-16 text-[var(--accent)]" />
              <p className="text-sm font-semibold text-[var(--text-primary)]">WhatsApp connected!</p>
              <p className="text-xs text-[var(--text-secondary)]">The broker phone is now linked via Evolution API.</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4 py-8">
              <QrCodeIcon className="h-16 w-16 text-[var(--text-secondary)]" />
              <button
                type="button"
                onClick={startConnection}
                disabled={loading}
                className="inline-flex items-center gap-2 rounded-full bg-[var(--accent)] px-6 py-3 text-sm font-bold text-[#020f07] hover:brightness-95 transition-all disabled:opacity-50"
              >
                {loading ? <LoaderIcon className="h-4 w-4 animate-spin" /> : <SmartphoneIcon className="h-4 w-4" />}
                {loading ? "Connecting..." : "Start QR connection"}
              </button>
            </div>
          )}
        </div>
      </section>

      <section className="rounded-[20px] border border-[color:var(--border)] bg-[var(--bg-surface)] p-6 sm:p-8">
        <h3 className="text-base font-semibold text-[var(--text-primary)]">Step 2: Or connect via pairing code</h3>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">Enter the broker phone number to receive a 6-digit pairing code in WhatsApp.</p>
        <div className="mt-4 flex items-end gap-3">
          <label className="flex-1 text-sm text-[var(--text-secondary)]">
            Phone number
            <input
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              placeholder="+919876543210"
              className="mt-2 w-full rounded-[10px] border border-[color:var(--border)] bg-[var(--bg-base)] px-3 py-2.5 text-sm text-[var(--text-primary)] outline-none focus:border-[color:var(--accent-border)]"
            />
          </label>
          <button
            type="button"
            onClick={connectViaPairing}
            disabled={loading || !phoneNumber.trim()}
            className="inline-flex items-center gap-2 rounded-full bg-[var(--accent)] px-5 py-2.5 text-sm font-bold text-[#020f07] hover:brightness-95 transition-all disabled:opacity-50"
          >
            {loading ? <LoaderIcon className="h-4 w-4 animate-spin" /> : null}
            Send pairing code
          </button>
        </div>
      </section>

      <section className="rounded-[16px] border border-[color:var(--border)] bg-[var(--bg-elevated)] p-5 text-sm text-[var(--text-secondary)]">
        <p><strong className="text-[var(--text-primary)]">Note:</strong> Evolution API runs alongside Cloud API — both active simultaneously. Cloud API handles platform messaging (magic links, Pulse replies). Evolution API connects broker phones via QR for group monitoring. <a href="/settings" className="text-[var(--accent)] underline underline-offset-2">Settings</a></p>
      </section>
    </main>
  );
}
