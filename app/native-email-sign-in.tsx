"use client";

import { SignIn } from "@clerk/nextjs";
import { FormEvent, useState } from "react";
import { nativeEmailOnlyClerkAppearance } from "./entry-theme";
import { NATIVE_AUTH_EMAIL_KEY } from "./native-auth-intent";

export default function NativeEmailSignIn() {
  const [email, setEmail] = useState("");
  const [confirmedEmail, setConfirmedEmail] = useState("");

  function continueWithEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = email.trim().toLowerCase();
    if (!normalized || !normalized.includes("@")) return;
    window.localStorage.setItem(NATIVE_AUTH_EMAIL_KEY, normalized);
    setConfirmedEmail(normalized);
  }

  if (confirmedEmail) return <div className="native-email-clerk-flow">
    <SignIn
      routing="path"
      path="/native-sign-in"
      signUpUrl="/sign-up?native=ios"
      forceRedirectUrl="/native-auth-return"
      initialValues={{ emailAddress: confirmedEmail }}
      appearance={nativeEmailOnlyClerkAppearance}
    />
    <button type="button" className="native-email-change" onClick={() => setConfirmedEmail("")}>Use a different email</button>
  </div>;

  return <form className="native-email-intent-card" onSubmit={continueWithEmail}>
    <span>OR CONTINUE WITH EMAIL</span>
    <label htmlFor="native-email">Email address</label>
    <input
      id="native-email"
      name="email"
      type="email"
      autoComplete="email"
      inputMode="email"
      value={email}
      onChange={(event) => setEmail(event.target.value)}
      required
    />
    <button type="submit">Continue with email</button>
  </form>;
}
