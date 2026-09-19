import type { CapacitorConfig } from "@capacitor/cli";

const isAndroid = process.env.FANTASY_HUB_NATIVE_PLATFORM === "android";

const config: CapacitorConfig = {
  appId: isAndroid ? "com.fantasyhubapp.android" : "com.fantasyhubapp.ios",
  appName: "Fantasy Hub",
  webDir: "native-shell",
  backgroundColor: "#001f47",
  appendUserAgent: isAndroid ? " FantasyHub-Android/1.0" : " FantasyHub-iOS/1.0",
  loggingBehavior: "production",
  ios: {
    backgroundColor: "#001f47",
    contentInset: "never",
    allowsLinkPreview: false,
    scrollEnabled: true,
  },
  server: {
    allowNavigation: [
      "fantasyhubapp.com",
      "www.fantasyhubapp.com",
      "clerk.fantasyhubapp.com",
      "innocent-falcon-20.clerk.accounts.dev",
    ],
    cleartext: false,
    errorPath: "offline.html",
  },
};

export default config;
