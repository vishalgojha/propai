"use client";

import LinkBase from "next/link";
import { useParams as useNextParams, usePathname, useRouter, useSearchParams as useNextSearchParams } from "next/navigation";
import React from "react";

type NavigateOptions = {
  replace?: boolean;
};

type OutletContextValue = {
  outlet: React.ReactNode;
};

const OutletContext = React.createContext<OutletContextValue>({ outlet: null });

export function RouterOutletProvider({
  children,
  outlet,
}: {
  children: React.ReactNode;
  outlet: React.ReactNode;
}) {
  return <OutletContext.Provider value={{ outlet }}>{children}</OutletContext.Provider>;
}

export function Outlet() {
  return <>{React.useContext(OutletContext).outlet}</>;
}

export function Link({
  to,
  href,
  children,
  ...props
}: Omit<React.ComponentProps<typeof LinkBase>, "href"> & { href?: React.ComponentProps<typeof LinkBase>["href"]; to?: string }) {
  return (
    <LinkBase href={href || to || "/"} {...props}>
      {children}
    </LinkBase>
  );
}

export function useNavigate() {
  const router = useRouter();

  return React.useCallback(
    (to: string, options?: NavigateOptions) => {
      if (options?.replace) {
        router.replace(to);
        return;
      }
      router.push(to);
    },
    [router]
  );
}

export function useLocation() {
  const pathname = usePathname();
  const searchParams = useNextSearchParams();
  const search = searchParams?.toString() ? `?${searchParams.toString()}` : "";
  const hash = typeof window !== "undefined" ? window.location.hash : "";

  return React.useMemo(
    () => ({
      pathname,
      search,
      hash,
    }),
    [hash, pathname, search]
  );
}

export function useSearchParams() {
  const nextSearchParams = useNextSearchParams();
  const stableParams = React.useMemo(
    () => new URLSearchParams(nextSearchParams?.toString() || ""),
    [nextSearchParams]
  );

  return [stableParams, () => {}] as const;
}

export function useParams<T extends Record<string, string>>() {
  return useNextParams() as T;
}

export function Navigate({ to, replace = false }: { to: string; replace?: boolean }) {
  const navigate = useNavigate();

  React.useEffect(() => {
    navigate(to, { replace });
  }, [navigate, replace, to]);

  return null;
}
