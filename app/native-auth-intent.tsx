"use client";

import { useEffect } from "react";

export const NATIVE_AUTH_EMAIL_KEY = "fantasy-hub-native-auth-email";

export default function NativeAuthIntent() {
  useEffect(() => {
    function rememberEmail(input: HTMLInputElement | null) {
      const email = input?.value.trim().toLowerCase();
      if (email?.includes("@")) window.localStorage.setItem(NATIVE_AUTH_EMAIL_KEY, email);
    }

    function rememberTypedEmail(event: Event) {
      const input = event.target;
      if (!(input instanceof HTMLInputElement)) return;
      if (input.name === "identifier" || input.type === "email") rememberEmail(input);
    }

    function rememberSubmittedEmail(event: Event) {
      const form = event.target;
      if (form instanceof HTMLFormElement)
        rememberEmail(form.querySelector<HTMLInputElement>('input[name="identifier"], input[type="email"]'));
    }

    document.addEventListener("input", rememberTypedEmail, true);
    document.addEventListener("change", rememberTypedEmail, true);
    document.addEventListener("submit", rememberSubmittedEmail, true);
    return () => {
      document.removeEventListener("input", rememberTypedEmail, true);
      document.removeEventListener("change", rememberTypedEmail, true);
      document.removeEventListener("submit", rememberSubmittedEmail, true);
    };
  }, []);

  return null;
}
