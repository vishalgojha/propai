"use client";

import React from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { AuthProvider } from "@/context/AuthContext";
import { initAnalytics, track } from "@/services/analytics";
import { PWARegistration } from "@/components/PWARegistration";
import { PwaInstallPrompt } from "@/components/PwaInstallPrompt";

function AnalyticsBootstrap() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  React.useEffect(() => {
    void initAnalytics();
  }, []);

  React.useEffect(() => {
    track("$pageview", {
      path: pathname,
      search: searchParams?.toString() ? `?${searchParams.toString()}` : "",
      hash: typeof window !== "undefined" ? window.location.hash : "",
    });
  }, [pathname, searchParams]);

  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <React.Suspense fallback={null}>
        <AnalyticsBootstrap />
        <PWARegistration />
      </React.Suspense>
      <PwaInstallPrompt />
      {children}
    </AuthProvider>
  );
}
