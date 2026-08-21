"use client";

import { useEffect } from "react";

export const NATIVE_AUTH_EMAIL_KEY = "fantasy-hub-native-auth-email";

export default function NativeAuthIntent() {
  useEffect(() => {
    function rememberSubmittedEmail(event: Event) {
      const form = event.target;
      if (!(form instanceof HTMLFormElement)) return;
      const input = form.querySelector<HTMLInputElement>('input[name="identifier"], input[type="email"]');
      const email = input?.value.trim().toLowerCase();
      if (email?.includes("@")) window.sessionStorage.setItem(NATIVE_AUTH_EMAIL_KEY, email);
    }

    document.addEventListener("submit", rememberSubmittedEmail, true);
    return () => document.removeEventListener("submit", rememberSubmittedEmail, true);
  }, []);

  return null;
}
