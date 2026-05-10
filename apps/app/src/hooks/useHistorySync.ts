import { useEffect, useMemo, useState } from 'react';
import backendApi, { handleApiError } from '../services/api';
import { ENDPOINTS } from '../services/endpoints';
import { useAuth } from '../context/AuthContext';

const HISTORY_CACHE_KEY = 'propai.history_sync_cache';

type HistoryProfile = {
  id: string;
  history_processed?: boolean | null;
  history_processed_at?: string | null;
  history_message_count?: number | null;
  history_total_count?: number | null;
};

type WhatsappHealthSession = {
  sessionLabel: string;
  connectionStatus: 'connected' | 'connecting' | 'disconnected';
  connectedAt?: string | null;
  messagesReceived24h?: number;
};

type WhatsappHealthResponse = {
  sessions: WhatsappHealthSession[];
};

export type HistorySyncState = {
  isProcessing: boolean;
  progress: number | null;
  totalProcessed: number;
  totalSource: number;
  historyProcessedAt: string | null;
};

const defaultState: HistorySyncState = {
  isProcessing: false,
  progress: null,
  totalProcessed: 0,
  totalSource: 0,
  historyProcessedAt: null,
};

function readCachedState(): HistorySyncState {
  try {
    const raw = localStorage.getItem(HISTORY_CACHE_KEY);
    if (!raw) return defaultState;
    return JSON.parse(raw) as HistorySyncState;
  } catch {
    return defaultState;
  }
}

function writeCachedState(state: HistorySyncState) {
  try {
    localStorage.setItem(HISTORY_CACHE_KEY, JSON.stringify(state));
  } catch {
    /* quota exceeded */
  }
}

export function useHistorySync() {
  const { user } = useAuth();
  const [state, setState] = useState<HistorySyncState>(readCachedState);

  const pollIntervalMs = useMemo(() => {
    return state.isProcessing ? 5000 : 15000;
  }, [state.isProcessing]);

  useEffect(() => {
    let cancelled = false;
    let timer: number | null = null;

    const updateState = (next: HistorySyncState) => {
      if (!cancelled) {
        setState(next);
        writeCachedState(next);
      }
    };

    const load = async () => {
      if (!user?.token) {
        updateState(defaultState);
        return;
      }

      try {
        const { createSupabaseBrowserClient } = await import('../services/supabaseBrowser');
        const supabase = createSupabaseBrowserClient(user.token);
        const { data: authData, error: authError } = await supabase.auth.getUser();
        if (authError || !authData?.user?.id) {
          throw authError || new Error('Unable to resolve workspace');
        }

        const [{ data: profile }, healthResponse] = await Promise.all([
          supabase
            .from('profiles')
            .select('id, history_processed, history_processed_at, history_message_count, history_total_count')
            .eq('id', authData.user.id)
            .maybeSingle<HistoryProfile>(),
          backendApi.get<WhatsappHealthResponse>(ENDPOINTS.whatsapp.health).catch((error) => {
            console.error(handleApiError(error));
            return { data: { sessions: [] } } as { data: WhatsappHealthResponse };
          }),
        ]);

        const totalProcessed = Number(profile?.history_message_count || 0);
        const sessions = Array.isArray(healthResponse.data?.sessions) ? healthResponse.data.sessions : [];
        const connectedSession = sessions
          .filter((session) => session.connectionStatus === 'connected')
          .sort((a, b) => new Date(a.connectedAt || 0).getTime() - new Date(b.connectedAt || 0).getTime())[0] || null;
        const totalSource = Number(profile?.history_total_count || 0) || Number(connectedSession?.messagesReceived24h || 0);
        const isProcessing = Boolean(!profile?.history_processed && totalSource > 0);
        const progress = profile?.history_processed
          ? 100
          : totalProcessed > 0 && totalSource > 0
            ? Math.min(99, Math.max(1, Math.round((totalProcessed / totalSource) * 100)))
            : isProcessing
              ? 15
              : 0;

        updateState({
          isProcessing,
          progress,
          totalProcessed,
          totalSource,
          historyProcessedAt: profile?.history_processed_at || null,
        });
      } catch {
        updateState(defaultState);
      }
    };

    void load();
    timer = window.setInterval(() => {
      void load();
    }, pollIntervalMs);

    return () => {
      cancelled = true;
      if (timer) {
        window.clearInterval(timer);
      }
    };
  }, [pollIntervalMs, user?.token]);

  return state;
}
