"use client";

import { useClerk } from "@clerk/nextjs";
import { useEffect } from "react";

export default function SignOutPage() {
  const { signOut } = useClerk();
  useEffect(() => {
    let active = true;
    const finishSignOut = () => {
      if (active) window.location.replace("/sign-in");
    };
    const fallback = window.setTimeout(finishSignOut, 1500);

    void signOut().then(finishSignOut, finishSignOut);
    return () => {
      active = false;
      window.clearTimeout(fallback);
    };
  }, [signOut]);
  return <main className="clerk-auth-shell"><p>Signing you out…</p></main>;
}
