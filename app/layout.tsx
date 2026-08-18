import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";
import { getClerkRuntimeKeys } from "./clerk-config";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  interactiveWidget: "resizes-visual",
  viewportFit: "cover",
  themeColor: "#f4f7f5",
};

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host =
    requestHeaders.get("x-forwarded-host") ??
    requestHeaders.get("host") ??
    "localhost:3001";
  const protocol =
    requestHeaders.get("x-forwarded-proto") ??
    (host.startsWith("localhost") ? "http" : "https");
  const socialImage = `${protocol}://${host}/og.png`;
  return {
    title: "Fantasy Hub — Make Every Week Count",
    description:
      "Explainable lineup, waiver, trade, matchup, and playoff intelligence for fantasy football managers.",
    appleWebApp: {
      capable: true,
      statusBarStyle: "default",
      title: "Fantasy Hub",
    },
    icons: {
      icon: [{ url: "/favicon.png", type: "image/png" }],
      shortcut: "/favicon.png",
      apple: "/favicon.png",
    },
    openGraph: {
      title: "Fantasy Hub — Make Every Week Count",
      description:
        "Lineups, waivers, trades, matchups, and simulations in one decision workspace.",
      images: [{ url: socialImage, width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title: "Fantasy Hub — Make Every Week Count",
      description:
        "Lineups, waivers, trades, matchups, and simulations in one decision workspace.",
      images: [socialImage],
    },
  };
}

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const clerkKeys = await getClerkRuntimeKeys();
  const nativeIos = ((await headers()).get("user-agent") ?? "").includes(
    "FantasyHub-iOS/",
  );
  return (
    <html
      lang="en"
      className="h-full antialiased"
      data-native-platform={nativeIos ? "ios" : undefined}
    >
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        {clerkKeys ? <ClerkProvider publishableKey={clerkKeys.publishableKey}>{children}</ClerkProvider> : children}
      </body>
    </html>
  );
}
