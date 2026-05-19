"use client";

import React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Layout as LegacyLayout } from "@/components/Layout";
import { useAuth } from "@/context/AuthContext";
import { Skeleton } from "@/components/ui/Skeleton";
import backendApi from "@/services/api";
import { ENDPOINTS } from "@/services/endpoints";
import { RouterOutletProvider } from "@/lib/router";

export const dynamic = "force-dynamic";

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  return (
    <React.Suspense
      fallback={
        <div className="h-screen bg-black flex items-center justify-center">
          <Skeleton className="w-64 h-8" />
        </div>
      }
    >
      <ProtectedLayoutInner>{children}</ProtectedLayoutInner>
    </React.Suspense>
  );
}

function ProtectedLayoutInner({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [onboardingCheck, setOnboardingCheck] = React.useState<"loading" | "needed" | "done">(() => {
    if (typeof window === "undefined") {
      return "loading";
    }

    const cached = window.sessionStorage.getItem("propai.onboarding_status");
    return cached === "needed" || cached === "done" ? cached : "done";
  });

  React.useEffect(() => {
    if (!user) return;
    let cancelled = false;

    (async () => {
      try {
        const resp = await backendApi.get(ENDPOINTS.identity.onboarding);
        const data = resp.data?.data;
        const nextState = data && data.onboarding_completed ? "done" : "needed";
        if (!cancelled) {
          window.sessionStorage.setItem("propai.onboarding_status", nextState);
          setOnboardingCheck(nextState);
        }
      } catch {
        if (!cancelled) {
          window.sessionStorage.setItem("propai.onboarding_status", "done");
          setOnboardingCheck("done");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user]);

  React.useEffect(() => {
    const next = searchParams?.toString() ? `${pathname}?${searchParams.toString()}` : pathname;

    if (!isLoading && !user) {
      router.replace(`/login?next=${encodeURIComponent(next)}`);
      return;
    }

    if (user && onboardingCheck === "needed" && pathname !== "/onboarding") {
      router.replace("/onboarding");
      return;
    }

    if (user && onboardingCheck === "done" && pathname === "/onboarding") {
      router.replace("/connect-whatsapp");
    }
  }, [isLoading, onboardingCheck, pathname, router, searchParams, user]);

  if (isLoading || !user || onboardingCheck === "loading") {
    return (
      <div className="h-screen bg-black flex items-center justify-center">
        <Skeleton className="w-64 h-8" />
      </div>
    );
  }

  return (
    <RouterOutletProvider outlet={children}>
      <LegacyLayout />
    </RouterOutletProvider>
  );
}
