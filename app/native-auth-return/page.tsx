import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import NativeAuthReturnClient from "./return-client";

export const dynamic = "force-dynamic";

export default async function NativeAuthReturn() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in?native=ios");

  return <NativeAuthReturnClient />;
}
