import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";
import { getClerkRuntimeKeys } from "./app/clerk-config";

export default async function proxy(request: NextRequest, event: NextFetchEvent) {
  const keys = await getClerkRuntimeKeys();
  if (!keys) return NextResponse.next();
  return clerkMiddleware({ ...keys })(request, event);
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
