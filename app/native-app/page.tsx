import FantasyHubLoader from "../FantasyHubLoader";

export const dynamic = "force-static";

export default function NativeApp() {
  return <FantasyHubLoader accountUser={null} clientBootstrap />;
}
