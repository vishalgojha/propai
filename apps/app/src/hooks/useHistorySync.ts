import { useEffect, useMemo, useState } from 'react';
import backendApi, { handleApiError } from '../services/api';
import { ENDPOINTS } from '../services/endpoints';
import { createSupabaseBrowserClient } from '../services/supabaseBrowser';
import { useAuth } from '../context/AuthContext';

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
};

const defaultState: HistorySyncState = {
  isProcessing: false,
  progress: null,
  totalProcessed: 0,
};

export function useHistorySync() {
  const { user } = useAuth();
  const [state, setState] = useState<HistorySyncState>(defaultState);

  const pollIntervalMs = useMemo(() => {
    return state.isProcessing ? 5000 : 15000;
  }, [state.isProcessing]);

  useEffect(() => {
    let cancelled = false;
    let timer: number | null = null;

    const load = async () => {
      if (!user?.token) {
        if (!cancelled) {
          setState(defaultState);
        }
        return;
      }

      try {
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

        const sessions = Array.isArray(healthResponse.data?.sessions) ? healthResponse.data.sessions : [];
        const connectedSession = sessions
          .filter((session) => session.connectionStatus === 'connected')
          .sort((a, b) => new Date(a.connectedAt || 0).getTime() - new Date(b.connectedAt || 0).getTime())[0] || null;

        const totalProcessed = Number(profile?.history_message_count || 0);
        const totalSource = Number(profile?.history_total_count || 0) || Number(connectedSession?.messagesReceived24h || 0);
        const isProcessing = Boolean(!profile?.history_processed && (totalSource > 0 || connectedSession));
        const progress = profile?.history_processed
          ? 100
          : totalProcessed > 0 && totalSource > 0
            ? Math.min(99, Math.max(1, Math.round((totalProcessed / totalSource) * 100)))
            : isProcessing
              ? 15
              : 0;

        if (!cancelled) {
          setState({
            isProcessing,
            progress,
            totalProcessed,
          });
        }
      } catch {
        if (!cancelled) {
          setState(defaultState);
        }
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
