import { auth, clerkClient } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import NativeAuthReturnClient from "./return-client";

export const dynamic = "force-dynamic";

export default async function NativeAuthReturn() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in?native=ios");

  const client = await clerkClient();
  const signInToken = await client.signInTokens.createSignInToken({
    userId,
    expiresInSeconds: 60,
  });
  const appUrl = `fantasyhub://auth/complete?ticket=${encodeURIComponent(signInToken.token)}`;

  return <NativeAuthReturnClient appUrl={appUrl} />;
}
