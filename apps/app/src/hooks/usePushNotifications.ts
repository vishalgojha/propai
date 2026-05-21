'use client';

import { useEffect, useRef, useCallback } from 'react';
import { backendApiUrl } from '../services/apiBase';

let audioCtx: AudioContext | null = null;

function playBeep() {
  try {
    if (!audioCtx) {
      audioCtx = new AudioContext();
    }
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.frequency.value = 880;
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);
    osc.start(audioCtx.currentTime);
    osc.stop(audioCtx.currentTime + 0.3);
  } catch {
  }
}

const SERVICE_WORKER_PATH = '/sw.js';

async function getExistingSubscription(): Promise<PushSubscription | null> {
  try {
    const reg = await navigator.serviceWorker.ready;
    return reg.pushManager.getSubscription();
  } catch {
    return null;
  }
}

export function usePushNotifications(tenantId: string | null) {
  const registered = useRef(false);

  const getVapidKey = useCallback((): string | null => {
    const envKey = typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY : null;
    return envKey || (typeof window !== 'undefined' ? (window as any).__VAPID_PUBLIC_KEY__ : null) || null;
  }, []);

  const subscribe = useCallback(async () => {
    if (!tenantId || typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) {
      return;
    }

    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        return;
      }

      const registration = await navigator.serviceWorker.register(SERVICE_WORKER_PATH, { scope: '/' });

      let subscription = await registration.pushManager.getSubscription();

      if (!subscription) {
        const vapidKey = getVapidKey();
        if (!vapidKey) {
          console.warn('[PushNotifications] VAPID public key not configured, push unavailable');
          return;
        }
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: vapidKey,
        });
      }

      await fetch(`${backendApiUrl}/notifications/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          subscription: subscription.toJSON(),
          userAgent: navigator.userAgent,
        }),
      });
    } catch (err) {
      console.error('[PushNotifications] Setup failed', err);
    }
  }, [tenantId]);

  useEffect(() => {
    if (registered.current) return;
    registered.current = true;

    void subscribe();
  }, [subscribe]);

  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

    const handler = () => {
      playBeep();
    };

    navigator.serviceWorker.addEventListener('message', handler);
    return () => navigator.serviceWorker.removeEventListener('message', handler);
  }, []);

  return { subscribe };
}
