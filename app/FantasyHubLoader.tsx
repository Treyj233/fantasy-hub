"use client";

import dynamic from "next/dynamic";
import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import LaunchSplash from "./LaunchSplash";
import { safeLocalStorageSet } from "./local-storage";

function InitialLoadingShell() {
  return <LaunchSplash />;
}

const FantasyHub = dynamic(() => import("./FantasyHub"), {
  ssr: false,
  loading: InitialLoadingShell,
});

type FantasyHubLoaderProps = {
  accountUser: { displayName: string; email: string; provider: "clerk" | "chatgpt"; signOutPath: string } | null;
  clientBootstrap?: boolean;
  localPreview?: boolean;
};

export default function FantasyHubLoader({ accountUser, clientBootstrap = false, localPreview = false }: FantasyHubLoaderProps) {
  if (localPreview && accountUser) return <FantasyHub accountUser={accountUser} />;
  return <AuthAwareFantasyHubLoader accountUser={accountUser} clientBootstrap={clientBootstrap} />;
}

function AuthAwareFantasyHubLoader({
  accountUser,
  clientBootstrap = false,
}: FantasyHubLoaderProps) {
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

  function clearNativeBootstrapCache() {
    for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
      const key = window.localStorage.key(index);
      if (key?.startsWith("fantasy-hub-account-bootstrap:") || key?.startsWith("fantasy-hub-league-bootstrap:"))
        window.localStorage.removeItem(key);
    }
    window.localStorage.removeItem("fantasy-hub-native-user");
    window.localStorage.removeItem("fantasy-hub-active-league");
  }

  async function resetNativeSessionAndShowSignIn() {
    clearNativeBootstrapCache();
    setNativeAccountUser(null);
    try {
      await fetch("/api/native-auth/session?native=ios", {
        method: "DELETE",
        cache: "no-store",
        credentials: "include",
      });
    } finally {
      // The explicit reset flag also handles WebViews that fail to persist the
      // signed-out cookie before this navigation completes.
      window.location.replace("/sign-in?native=ios&reset=1");
    }
  }

  useEffect(() => {
    if (!clientBootstrap) return;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 8000);
    void fetch("/api/v1/bootstrap", { signal: controller.signal })
      .then(async (response) => {
        if (response.status === 401) {
          await resetNativeSessionAndShowSignIn();
          return;
        }
        if (!response.ok) throw new Error("Native bootstrap unavailable");
        const payload = await response.json() as { user?: { displayName?: string; email?: string } };
        if (!payload.user?.email) throw new Error("Native session unavailable");
        const user = {
          displayName: payload.user.displayName ?? payload.user.email,
          email: payload.user.email,
          provider: "clerk" as const,
          signOutPath: "/sign-out",
        };
        // Enter the app as soon as the verified bootstrap succeeds. Device
        // cache quota failures must not strand the WebView on the launch splash.
        setNativeAccountUser(user);
        safeLocalStorageSet("fantasy-hub-native-user", JSON.stringify(user));
        safeLocalStorageSet(
          `fantasy-hub-account-bootstrap:${user.email.trim().toLowerCase()}`,
          JSON.stringify({ savedAt: Date.now(), ...payload }),
        );
      })
      .catch(() => {
        if (!nativeAccountUser) window.location.replace("/sign-in?native=ios");
      })
      .finally(() => window.clearTimeout(timeout));
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
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
