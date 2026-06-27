"use client";

import { useEffect, useState, useRef } from "react";
import * as api from "@/lib/api";

export default function SettingsPage() {
  const [connState, setConnState] = useState<api.ConnectionState | null>(null);
  const [connDetail, setConnDetail] = useState<any>(null);
  const [qrData, setQRData] = useState<any>(null);
  const [qrTimer, setQRTimer] = useState(0);
  const [showQR, setShowQR] = useState(false);
  const pollingRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval>>();

  useEffect(() => {
    refreshConnection();
  }, []);

  const connected = connDetail?.connected ?? connState?.connected ?? false;

  async function refreshConnection() {
    const detail = await api.getConnectionDetail().catch(() => null);
    if (detail) {
      setConnDetail(detail);
      setConnState({
        state: detail.connection_state || detail.state || "unknown",
        connected: Boolean(detail.connected),
      });
      return;
    }
    api.getConnectionState().then(setConnState).catch(() => {});
  }

  async function handleLogin() {
    setShowQR(true);
    setQRData(null);
    const data = await api.getQR();
    setQRData(data);
    setQRTimer(30);
    if (data?.count === 0) {
      setShowQR(false);
      refreshConnection();
      return;
    }
    pollingRef.current = true;
    pollConnection();
    startTimer();
  }

  async function pollConnection() {
    if (!pollingRef.current) return;
    try {
      const c = await api.getConnectionState();
      setConnState(c);
      if (c.connected) {
        pollingRef.current = false;
        setShowQR(false);
        refreshConnection();
        clearInterval(timerRef.current);
        return;
      }
    } catch {}
    setTimeout(pollConnection, 2000);
  }

  function startTimer() {
    clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setQRTimer(prev => {
        if (prev <= 1) {
          refreshQR();
          return 30;
        }
        return prev - 1;
      });
    }, 1000);
  }

  async function refreshQR() {
    const data = await api.getQR();
    setQRData(data);
    if (data?.count === 0) {
      setShowQR(false);
      refreshConnection();
    }
  }

  async function handleLogout() {
    await api.logout();
    refreshConnection();
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <h2 className="text-lg font-bold">Settings</h2>

      {/* WhatsApp Connection */}
      <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-2xl p-5">
        <h3 className="text-sm font-bold text-[var(--text-primary)] mb-4">WhatsApp Connection</h3>

        <div className="flex items-center gap-2 mb-4">
          <span className={`w-2.5 h-2.5 rounded-full ${connected ? "bg-green-500" : "bg-red-500"}`} />
          <span className="text-lg font-bold">{connected ? "Connected" : "Disconnected"}</span>
        </div>

        <div className="flex gap-2 mb-4">
          {!connected ? (
            <button onClick={handleLogin} className="px-4 py-2 bg-[var(--accent)] text-white rounded-lg text-sm font-bold">Login</button>
          ) : (
            <button onClick={handleLogout} className="px-4 py-2 bg-[var(--red)] text-white rounded-lg text-sm font-bold">Logout</button>
          )}
          <button onClick={refreshConnection} className="px-4 py-2 bg-[var(--bg-elevated)] border border-[var(--border-strong)] rounded-lg text-sm">Refresh</button>
        </div>

        {/* QR Modal */}
        {showQR && (
          <div className="bg-[var(--bg-elevated)] border border-[var(--border-strong)] rounded-xl p-6 text-center max-w-md mx-auto">
            <h4 className="font-bold mb-4 text-base">Scan QR with WhatsApp</h4>
            <div className="bg-white rounded-xl p-5 mb-4 flex items-center justify-center min-h-[360px]">
              {qrData?.base64 ? (
                <img src={qrData.base64.startsWith("data:") ? qrData.base64 : `data:image/png;base64,${qrData.base64}`} className="w-full max-w-[320px] h-auto" alt="Scan with WhatsApp" />
              ) : (
                <div className="text-[var(--text-muted)] text-center">
                  <div className="mb-2">{qrData?.error ? "Error: " + qrData.error : "Requesting QR code..."}</div>
                  <div className="text-xs text-[var(--text-secondary)]">Make sure Evolution API is running</div>
                </div>
              )}
            </div>
            <div className="flex items-center justify-center gap-3 mb-3">
              <div className="flex-1 bg-[var(--bg-surface)] rounded-full h-2.5 overflow-hidden">
                <div className="h-full bg-[var(--accent)] transition-all duration-1000" style={{ width: `${(qrTimer / 30) * 100}%` }} />
              </div>
              <span className="text-sm text-[var(--text-muted)] min-w-[60px] font-mono">{qrTimer}s</span>
            </div>
            <div className="flex gap-3 justify-center">
              <button onClick={refreshQR} className="px-4 py-2 bg-[var(--bg-elevated)] border border-[var(--border-strong)] rounded-lg text-sm text-[var(--text-primary)]">Generate New QR</button>
              <button onClick={() => setShowQR(false)} className="px-4 py-2 bg-[var(--bg-elevated)] border border-[var(--border-strong)] rounded-lg text-sm text-[var(--text-muted)]">Close</button>
            </div>
            <div className="mt-4 text-[11px] text-[var(--text-muted)] leading-relaxed">
              1. Open WhatsApp on your phone<br />
              2. Settings → Linked Devices<br />
              3. Tap &ldquo;Link a Device&rdquo;
            </div>
          </div>
        )}

        {/* Connection Details */}
        {connDetail && (
          <div className="mt-4 grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
            {[
              ["Device", connDetail.device_name],
              ["Phone", connDetail.phone_number],
              ["Profile", connDetail.display_name],
              ["Instance", connDetail.instance_name || connDetail.instance],
              ["Connected Since", connDetail.connected_since],
              ["Groups", connDetail.total_groups],
              ["Capture", connDetail.business_window?.label || "10 AM - 7 PM IST"],
              ["Mode", "Live webhook only"],
            ].map(([k, v]) => (
              <div key={k as string}>
                <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">{k as string}</div>
                <div className="text-[var(--text-primary)]">{v || "—"}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Live Capture */}
      <div className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-2xl p-5">
        <h3 className="text-sm font-bold text-[var(--text-primary)] mb-4">Live Capture</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
          {[
            ["Window", "10 AM - 7 PM IST"],
            ["Mode", "Webhook only"],
            ["Backfill", "Disabled"],
          ].map(([k, v]) => (
            <div key={k}>
              <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">{k}</div>
              <div className="text-[var(--text-primary)]">{v}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
