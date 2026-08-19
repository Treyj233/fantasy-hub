import { redirect } from "next/navigation";

export default function LegacyNativeSignInRedirect() {
  redirect("/sign-in?native=ios");
}
