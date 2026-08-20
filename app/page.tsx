import FantasyHubLoader from "./FantasyHubLoader";
import { getChatGPTUser, LOCAL_PREVIEW_USER_ID } from "./chatgpt-auth";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getChatGPTUser();
  return <FantasyHubLoader localPreview={user?.userId === LOCAL_PREVIEW_USER_ID} accountUser={user ? { displayName: user.displayName, email: user.email, provider: user.provider, signOutPath: user.signOutPath } : null} />;
}
