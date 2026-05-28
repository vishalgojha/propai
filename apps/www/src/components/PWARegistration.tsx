"use client";

import React from "react";

export function PWARegistration() {
  React.useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    const register = async () => {
      try {
        await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      } catch (error) {
        console.warn("[PWA] Service worker registration failed", error);
      }
    };

    void register();
  }, []);

  return null;
}
