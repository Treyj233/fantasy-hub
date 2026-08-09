import FantasyHub from "./FantasyHub";
import { getChatGPTUser } from "./chatgpt-auth";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getChatGPTUser();
  return <FantasyHub accountUser={user ? { displayName: user.displayName, email: user.email } : null} />;
}
