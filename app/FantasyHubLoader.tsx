"use client";

import dynamic from "next/dynamic";
import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import LaunchSplash from "./LaunchSplash";

function InitialLoadingShell() {
  return <LaunchSplash />;
}

const FantasyHub = dynamic(() => import("./FantasyHub"), {
  ssr: false,
  loading: InitialLoadingShell,
});

export default function FantasyHubLoader({
  accountUser,
  clientBootstrap = false,
}: {
  accountUser: { displayName: string; email: string; provider: "clerk" | "chatgpt"; signOutPath: string } | null;
  clientBootstrap?: boolean;
}) {
  const { isLoaded, isSignedIn } = useAuth();
  const router = useRouter();
  const sessionRefreshRequested = useRef(false);
  const [nativeAccountUser, setNativeAccountUser] = useState<typeof accountUser>(() => {
    if (!clientBootstrap || typeof window === "undefined") return null;
    try {
      return JSON.parse(window.localStorage.getItem("fantasy-hub-native-user") ?? "null") as typeof accountUser;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    if (!clientBootstrap) return;
    const controller = new AbortController();
    void fetch("/api/v1/bootstrap", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Native bootstrap unavailable");
        const payload = await response.json() as { user?: { displayName?: string; email?: string } };
        if (!payload.user?.email) throw new Error("Native session unavailable");
        const user = {
          displayName: payload.user.displayName ?? payload.user.email,
          email: payload.user.email,
          provider: "clerk" as const,
          signOutPath: "/sign-out",
        };
        window.localStorage.setItem("fantasy-hub-native-user", JSON.stringify(user));
        window.localStorage.setItem(
          `fantasy-hub-account-bootstrap:${user.email.trim().toLowerCase()}`,
          JSON.stringify({ savedAt: Date.now(), ...payload }),
        );
        setNativeAccountUser(user);
      })
      .catch(() => {
        if (!controller.signal.aborted && !nativeAccountUser)
          window.location.replace("/sign-in?native=ios");
      });
    return () => controller.abort();
    // Native bootstrap runs once; subsequent account refreshes happen inside the dashboard.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientBootstrap]);

  useEffect(() => {
    if (clientBootstrap) return;
    if (accountUser || !isLoaded || !isSignedIn || sessionRefreshRequested.current) return;
    sessionRefreshRequested.current = true;
    router.refresh();
  }, [accountUser, clientBootstrap, isLoaded, isSignedIn, router]);

  if (clientBootstrap) {
    if (!nativeAccountUser) return <InitialLoadingShell />;
    return <FantasyHub accountUser={nativeAccountUser} />;
  }

  if (!accountUser && (!isLoaded || isSignedIn)) return <InitialLoadingShell />;
  return <FantasyHub accountUser={accountUser} />;
}
