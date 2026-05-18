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
  const [onboardingCheck, setOnboardingCheck] = React.useState<"loading" | "needed" | "done" | null>(null);

  React.useEffect(() => {
    if (!user) return;
    let cancelled = false;

    (async () => {
      try {
        const resp = await backendApi.get(ENDPOINTS.identity.onboarding);
        const data = resp.data?.data;
        if (!cancelled) {
          setOnboardingCheck(data && data.onboarding_completed ? "done" : "needed");
        }
      } catch {
        if (!cancelled) {
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

  if (isLoading || !user || onboardingCheck === null) {
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
