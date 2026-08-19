import FantasyHubLoader from "../FantasyHubLoader";

// This shell must never outlive its hashed client bundles in an installed
// WebView. A static year-long cache can strand the app on the server-rendered
// launch splash after a deployment replaces those bundles.
export const dynamic = "force-dynamic";

export default function NativeApp() {
  return <FantasyHubLoader accountUser={null} clientBootstrap />;
}
