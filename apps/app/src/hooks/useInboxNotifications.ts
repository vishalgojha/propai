import React from 'react';
import backendApi from '../services/api';
import { ENDPOINTS } from '../services/endpoints';

type InboxMessage = {
  id: string;
  chatId: string;
  text: string;
  sender?: string | null;
  direction: 'inbound' | 'outbound';
  timestamp: string;
};

const playNotificationSound = () => {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.setValueAtTime(523, ctx.currentTime);
    osc.frequency.setValueAtTime(659, ctx.currentTime + 0.1);
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.3);
  } catch {
    // silent
  }
};

export const useInboxNotifications = () => {
  const seenIds = React.useRef<Set<string>>(new Set());
  const notifiedCount = React.useRef(0);

  React.useEffect(() => {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      void Notification.requestPermission();
    }
  }, []);

  React.useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      try {
        const resp = await backendApi.get(ENDPOINTS.whatsapp.inbox);
        const messages: InboxMessage[] = Array.isArray(resp.data?.messages) ? resp.data.messages : [];
        const newMessages = messages.filter(
          (m) => m.direction === 'inbound' && !seenIds.current.has(m.id),
        );
        for (const msg of newMessages) {
          seenIds.current.add(msg.id);
        }
        if (newMessages.length > 0) {
          notifiedCount.current += newMessages.length;
          const last = newMessages[newMessages.length - 1];
          playNotificationSound();
          if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
            try {
              new Notification('New message in Inbox', {
                body: `${last.sender || 'Someone'}: ${last.text?.slice(0, 120) || ''}`,
                tag: 'propai-inbox',
                silent: true,
              });
            } catch {
              // silent
            }
          }
        }
      } catch {
        // silent
      }
    };

    const interval = window.setInterval(() => { if (!cancelled) void poll(); }, 15000);
    return () => { cancelled = true; window.clearInterval(interval); };
  }, []);
};
