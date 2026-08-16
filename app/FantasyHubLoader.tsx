"use client";

import dynamic from "next/dynamic";
import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
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
}: {
  accountUser: { displayName: string; email: string; provider: "clerk" | "chatgpt"; signOutPath: string } | null;
}) {
  const { isLoaded, isSignedIn } = useAuth();
  const router = useRouter();
  const [sessionRefreshRequested, setSessionRefreshRequested] = useState(false);

  useEffect(() => {
    if (accountUser || !isLoaded || !isSignedIn || sessionRefreshRequested) return;
    setSessionRefreshRequested(true);
    router.refresh();
  }, [accountUser, isLoaded, isSignedIn, router, sessionRefreshRequested]);

  if (!accountUser && (!isLoaded || isSignedIn)) return <InitialLoadingShell />;
  return <FantasyHub accountUser={accountUser} />;
}
