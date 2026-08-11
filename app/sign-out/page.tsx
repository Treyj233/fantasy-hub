"use client";

import { useClerk } from "@clerk/nextjs";
import { useEffect } from "react";

export default function SignOutPage() {
  const { signOut } = useClerk();
  useEffect(() => { void signOut({ redirectUrl: "/" }); }, [signOut]);
  return <main className="clerk-auth-shell"><p>Signing you out…</p></main>;
}
