import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy | Fantasy Hub",
  description: "How Fantasy Hub collects, uses, shares, and protects account and fantasy-league information.",
};

const sections = [
  {
    title: "Information we collect",
    body: [
      "Account information, such as your name, verified email address, account identifier, and authentication status.",
      "Fantasy-platform information you choose to connect, including usernames or league identifiers, league settings, rosters, matchups, transactions, and related fantasy-football data.",
      "Preferences and activity needed to provide the service, including theme choices, saved leagues, decision history, simulation inputs, subscription status, and notification preferences.",
      "Device and diagnostic information, such as push-notification tokens, app version, device platform, network status, and error details used to operate and secure the service.",
      "Purchase information from Apple or our payment processor. Fantasy Hub does not receive or store your complete payment-card number.",
    ],
  },
  {
    title: "How we use information",
    body: [
      "We use information to authenticate users; connect and refresh leagues; generate rankings, recommendations, simulations, reports, and alerts; remember account preferences; process subscriptions; provide support; prevent abuse; and improve reliability.",
      "Fantasy Hub does not use your data for cross-app advertising and does not sell personal information.",
    ],
  },
  {
    title: "When information is shared",
    body: [
      "Information may be processed by service providers that help us deliver Fantasy Hub, including authentication, hosting, database, payment, app-distribution, notification, and error-diagnostic providers.",
      "When you connect a league, Fantasy Hub communicates with the selected fantasy platform to retrieve the information needed to provide requested features. Those platforms process information under their own privacy policies.",
      "We may disclose information when required by law, to protect users or the service, or as part of a business transfer subject to appropriate safeguards.",
    ],
  },
  {
    title: "Retention and control",
    body: [
      "We retain account information while your account is active and keep other information only as long as reasonably necessary for the purposes described above, legal compliance, security, and dispute resolution.",
      "You can disconnect supported fantasy accounts, disable notifications in device settings, manage subscriptions through Apple or the applicable billing portal, and request account deletion from the account controls in Fantasy Hub. Account deletion removes saved connections, preferences, league snapshots, decision records, notification tokens, and subscription records subject to legally required retention.",
    ],
  },
  {
    title: "Security and children",
    body: [
      "We use reasonable administrative, technical, and organizational safeguards, but no online service can guarantee absolute security.",
      "Fantasy Hub is not directed to children under 13, and we do not knowingly collect personal information from children under 13.",
    ],
  },
  {
    title: "Updates and contact",
    body: [
      "We may update this policy as Fantasy Hub evolves. Material changes will be reflected by the effective date on this page and, when appropriate, an in-product notice.",
      "For privacy questions or requests, use the support channel at fantasyhubapp.com and include “Privacy” in your message.",
    ],
  },
];

export default function PrivacyPolicyPage() {
  return (
    <main className="legal-page">
      <nav><Link href="/">← Back to Fantasy Hub</Link></nav>
      <header>
        <span>FANTASY HUB</span>
        <h1>Privacy Policy</h1>
        <p>Effective August 11, 2026</p>
      </header>
      <section className="legal-intro">
        <p>This policy explains how Fantasy Hub collects, uses, shares, and protects information when you use our website, iPhone app, and related services.</p>
      </section>
      {sections.map((section) => (
        <section key={section.title}>
          <h2>{section.title}</h2>
          {section.body.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
        </section>
      ))}
      <footer>Fantasy Hub · Fantasy football league management</footer>
    </main>
  );
}
