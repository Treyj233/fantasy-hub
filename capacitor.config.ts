import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.fantasyhubapp.ios",
  appName: "Fantasy Hub",
  webDir: "native-shell",
  backgroundColor: "#073b27",
  appendUserAgent: " FantasyHub-iOS/1.0",
  loggingBehavior: "production",
  ios: {
    backgroundColor: "#073b27",
    contentInset: "automatic",
    allowsLinkPreview: false,
    scrollEnabled: true,
  },
  server: {
    url: "https://fantasyhubapp.com",
    allowNavigation: [
      "fantasyhubapp.com",
      "www.fantasyhubapp.com",
      "innocent-falcon-20.clerk.accounts.dev",
    ],
    cleartext: false,
    errorPath: "offline.html",
  },
};

export default config;
