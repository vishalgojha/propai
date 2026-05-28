"use client";

import React from "react";

export function PWARegistration() {
  React.useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    const register = async () => {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
        void registration.update();
      } catch (error) {
        console.warn("[PWA] Service worker registration failed", error);
      }
    };

    void register();
  }, []);

  return null;
}
