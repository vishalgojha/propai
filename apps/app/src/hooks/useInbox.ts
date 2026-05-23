'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { fetchInboxMatches, markStreamItemRead as apiMarkRead, type InboxMatch } from '../services/streamAPI';

export function useInbox() {
  const { user } = useAuth();
  const [matches, setMatches] = useState<InboxMatch[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const supabaseRef = useRef<ReturnType<typeof import('../services/supabaseBrowser').createSupabaseBrowserClient> | null>(null);
  const matchesRef = useRef<InboxMatch[]>([]);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const unreadCount = matches.filter((match) => !match.isRead && !match.matchedItem.isRead).length;

  useEffect(() => {
    matchesRef.current = matches;
  }, [matches]);

  useEffect(() => {
    if (!user?.token) {
      setMatches([]);
      setIsLoading(false);
      return;
    }

    let mounted = true;

    const loadMatches = async (showNotification = false) => {
      try {
        const previousIds = new Set(matchesRef.current.map((match) => match.id));
        const response = await fetchInboxMatches(200);
        if (!mounted) return;

        setMatches(response.items);
        setIsLoading(false);

        const newMatch = response.items.find((match) => !previousIds.has(match.id));
        if (
          showNotification &&
          newMatch &&
          typeof Notification !== 'undefined' &&
          Notification.permission === 'granted' &&
          document.visibilityState === 'hidden'
        ) {
          new Notification('New PropAI Match', {
            body: `${newMatch.matchedItem.type} - ${newMatch.matchedItem.bhk} in ${newMatch.matchedItem.location}${newMatch.matchedItem.price ? ' @ ' + newMatch.matchedItem.price : ''}`.trim(),
            icon: '/logo.png',
          });
        }
      } catch {
        if (!mounted) return;
        setIsLoading(false);
      }
    };

    const scheduleRefresh = () => {
      if (refreshTimerRef.current) return;
      refreshTimerRef.current = setTimeout(() => {
        refreshTimerRef.current = null;
        void loadMatches(true);
      }, 700);
    };

    const init = async () => {
      await loadMatches(false);

      try {
        const { createSupabaseBrowserClient } = await import('../services/supabaseBrowser');
        if (!mounted) return;

        const client = createSupabaseBrowserClient(user.token);
        supabaseRef.current = client;

        const streamChannel = client
          .channel('inbox-match-stream-items')
          .on(
            'postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'stream_items' },
            scheduleRefresh,
          )
          .subscribe();

        const channelItemsChannel = client
          .channel('inbox-match-channel-items')
          .on(
            'postgres_changes',
            {
              event: 'INSERT',
              schema: 'public',
              table: 'channel_items',
              filter: `tenant_id=eq.${user.id}`,
            },
            scheduleRefresh,
          )
          .subscribe();

        return () => {
          client.removeChannel(streamChannel);
          client.removeChannel(channelItemsChannel);
        };
      } catch {
      }
    };

    const cleanup = init();
    return () => {
      mounted = false;
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
      const supabase = supabaseRef.current;
      if (supabase) {
        supabase.removeChannel(supabase.channel('inbox-match-stream-items'));
        supabase.removeChannel(supabase.channel('inbox-match-channel-items'));
        supabaseRef.current = null;
      }
      cleanup?.then((fn) => fn?.());
    };
  }, [user?.id, user?.token]);

  const markRead = useCallback((matchId: string) => {
    let streamItemId: string | null = null;
    setMatches((prev) => prev.map((match) => {
      if (match.id !== matchId) return match;
      streamItemId = match.matchedItem.id;
      return {
        ...match,
        isRead: true,
        matchedItem: { ...match.matchedItem, isRead: true },
      };
    }));
    if (streamItemId) {
      void apiMarkRead(streamItemId);
    }
  }, []);

  const markAllRead = useCallback(() => {
    const unreadMatches = matchesRef.current.filter((match) => !match.isRead && !match.matchedItem.isRead);
    if (unreadMatches.length === 0) return;

    setMatches((prev) => prev.map((match) => ({
      ...match,
      isRead: true,
      matchedItem: { ...match.matchedItem, isRead: true },
    })));

    const streamItemIds = Array.from(new Set(unreadMatches.map((match) => match.matchedItem.id)));
    streamItemIds.forEach((id) => { void apiMarkRead(id); });
  }, []);

  return { matches, unreadCount, markRead, markAllRead, isLoading };
}
