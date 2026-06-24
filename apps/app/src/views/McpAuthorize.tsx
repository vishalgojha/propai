"use client";

import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const MCP_SERVER = "https://mcp.propai.live";
const DEVICE_AUTHORIZE_ENDPOINT = `${MCP_SERVER}/device/authorize`;

export const McpAuthorize: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [userCode, setUserCode] = useState(searchParams.get("user_code") || "");
  const [status, setStatus] = useState<"form" | "loading" | "success" | "error">("form");
  const [message, setMessage] = useState("");

  const token = user?.token || "";

  useEffect(() => {
    if (!user) {
      navigate(`/login?next=${encodeURIComponent("/mcp-authorize" + (userCode ? `?user_code=${userCode}` : ""))}`, { replace: true });
    }
  }, [user, navigate, userCode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userCode.trim() || !token) return;

    setStatus("loading");
    try {
      const res = await fetch(DEVICE_AUTHORIZE_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ user_code: userCode.trim().toUpperCase() }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setStatus("success");
        setMessage("Device authorized! You can close this tab and return to the MCP client.");
      } else {
        setStatus("error");
        setMessage(data.error || "Authorization failed. Check the code and try again.");
      }
    } catch {
      setStatus("error");
      setMessage("Could not connect to the MCP server. Try again.");
    }
  };

  return (
    <div className="min-h-screen bg-[#000000] text-[var(--text-primary)] flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-6">
        <h1 className="text-xl font-bold mb-2">Authorize MCP Device</h1>
        <p className="text-sm text-[var(--text-secondary)] mb-6">
          Enter the device code shown in your MCP client to authorize this session.
        </p>

        {status === "success" && (
          <div className="rounded-xl border border-[var(--accent-border)] bg-[var(--accent-dim)] p-4 text-sm">
            {message}
          </div>
        )}

        {status === "error" && (
          <div className="rounded-xl border border-red-500/40 bg-[rgba(255,76,76,0.08)] p-4 text-sm mb-4">
            {message}
            <button onClick={() => setStatus("form")} className="block mt-2 text-[var(--accent)] underline">
              Try again
            </button>
          </div>
        )}

        {status !== "success" && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                Device Code
              </label>
              <input
                type="text"
                maxLength={9}
                autoComplete="off"
                value={userCode}
                onChange={(e) => setUserCode(e.target.value.toUpperCase())}
                placeholder="PROP-ABCD"
                className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg)] px-4 py-3 text-center text-lg font-bold tracking-widest text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
              />
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                Format: PROP-XXXX (9 characters)
              </p>
            </div>
            <button
              type="submit"
              disabled={status === "loading" || !userCode.trim()}
              className="w-full rounded-xl border border-[var(--accent-border)] bg-[var(--accent)] py-3 text-sm font-bold text-[#020f07] transition-all hover:brightness-95 disabled:opacity-50"
            >
              {status === "loading" ? "Authorizing..." : "Authorize Device"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
