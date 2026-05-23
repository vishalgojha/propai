'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { fetchStreamItems, markStreamItemRead as apiMarkRead, type StreamItem } from '../services/streamAPI';

function mapRowToStreamItem(row: Record<string, any>): StreamItem {
  return {
    id: String(row.id || ''),
    type: row.type || 'Rent',
    title: row.parsed_payload?.displayTitle ?? undefined,
    location: String(row.locality || ''),
    city: row.city ?? undefined,
    buildingName: row.building_name ?? row.parsed_payload?.buildingName ?? null,
    bhk: String(row.bhk || ''),
    price: String(row.price_label || ''),
    priceNumeric: row.price_numeric ?? null,
    areaSqft: row.area_sqft ?? null,
    confidence: Number(row.confidence_score || 0),
    source: String(row.parsed_payload?.contactName || row.parsed_payload?.sourceLabel || row.broker_name || row.parsed_payload?.brokerName || ''),
    brokerName: row.broker_name ?? row.parsed_payload?.brokerName ?? null,
    brokerCompany: row.parsed_payload?.brokerCompany ?? row.parsed_payload?.company ?? null,
    waLink: row.source_phone ? `https://wa.me/${String(row.source_phone).replace(/\D/g, '')}` : null,
    isRead: Boolean(row.is_read || false),
    createdAt: String(row.created_at || new Date().toISOString()),
  };
}

export function useInbox() {
  const { user } = useAuth();
  const [items, setItems] = useState<StreamItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const supabaseRef = useRef<ReturnType<typeof import('../services/supabaseBrowser').createSupabaseBrowserClient> | null>(null);
  const itemsRef = useRef<StreamItem[]>([]);

  const unreadCount = items.filter((item) => !item.isRead).length;

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    if (!user?.token) {
      setIsLoading(false);
      return;
    }

    let mounted = true;

    const init = async () => {
      try {
        const seed = await fetchStreamItems({ isRead: false, limit: 200 });
        if (!mounted) return;
        setItems(seed.items);
        setIsLoading(false);
      } catch {
        if (!mounted) return;
        setIsLoading(false);
      }

      try {
        const { createSupabaseBrowserClient } = await import('../services/supabaseBrowser');
        if (!mounted) return;

        const client = createSupabaseBrowserClient(user.token);
        supabaseRef.current = client;

        const streamChannel = client
          .channel('inbox-stream-items')
          .on(
            'postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'stream_items' },
            (payload) => {
              const row = payload.new as Record<string, any>;
              const item = mapRowToStreamItem(row);
              setItems((prev) => [item, ...prev]);

              if (
                typeof Notification !== 'undefined' &&
                Notification.permission === 'granted' &&
                document.visibilityState === 'hidden'
              ) {
                new Notification('New PropAI Alert', {
                  body: `${item.type} — ${item.bhk} in ${item.location}${item.price ? ' @ ' + item.price : ''}`.trim(),
                  icon: '/logo.png',
                });
              }
            },
          )
          .subscribe();

        const channelItemsChannel = client
          .channel('inbox-channel-items')
          .on(
            'postgres_changes',
            {
              event: 'INSERT',
              schema: 'public',
              table: 'channel_items',
              filter: `tenant_id=eq.${user.id}`,
            },
            async (payload) => {
              const streamItemId = (payload.new as Record<string, any>).stream_item_id as string;
              if (!streamItemId) return;

              const alreadyExists = itemsRef.current.some((existing) => existing.id === streamItemId);
              if (alreadyExists) return;

              try {
                const { data } = await client
                  .from('stream_items')
                  .select('*')
                  .eq('id', streamItemId)
                  .single();

                if (data) {
                  const item = mapRowToStreamItem(data as Record<string, any>);
                  setItems((prev) => [item, ...prev]);

                  if (
                    typeof Notification !== 'undefined' &&
                    Notification.permission === 'granted' &&
                    document.visibilityState === 'hidden'
                  ) {
                    new Notification('New PropAI Alert', {
                      body: `${item.type} — ${item.bhk} in ${item.location}${item.price ? ' @ ' + item.price : ''}`.trim(),
                      icon: '/logo.png',
                    });
                  }
                }
              } catch {
              }
            },
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
      const supabase = supabaseRef.current;
      if (supabase) {
        supabase.removeChannel(supabase.channel('inbox-stream-items'));
        supabase.removeChannel(supabase.channel('inbox-channel-items'));
        supabaseRef.current = null;
      }
      cleanup?.then((fn) => fn?.());
    };
  }, [user?.id, user?.token]);

  const markRead = useCallback((id: string) => {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, isRead: true } : item)));
    apiMarkRead(id);
  }, []);

  const markAllRead = useCallback(() => {
    const unreadIds = itemsRef.current.filter((item) => !item.isRead).map((item) => item.id);
    if (unreadIds.length === 0) return;
    setItems((prev) => prev.map((item) => ({ ...item, isRead: true })));
    unreadIds.forEach((id) => apiMarkRead(id));
  }, []);

  return { items, unreadCount, markRead, markAllRead, isLoading };
}
