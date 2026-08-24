import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Use | Fantasy Hub",
  description: "Terms governing use of the Fantasy Hub website, iPhone app, subscriptions, and fantasy-league analysis services.",
};

const sections = [
  {
    title: "Using Fantasy Hub",
    body: [
      "Fantasy Hub provides independent fantasy-football information, league-management tools, rankings, projections, simulations, and recommendations. You are responsible for reviewing information before relying on it or making a fantasy-sports decision.",
      "You may use Fantasy Hub only in compliance with applicable law, these Terms, and the terms governing any third-party account or service you choose to connect.",
    ],
  },
  {
    title: "Connected fantasy platforms",
    body: [
      "You may choose to connect a supported fantasy platform or import information from a league in which you participate. You authorize Fantasy Hub to process the league information needed to provide the features you request. You remain responsible for your relationship with, and compliance with the terms of, each connected platform.",
      "Third-party services may change, restrict, interrupt, or discontinue access at any time. Fantasy Hub does not control and cannot guarantee the availability, accuracy, or continued compatibility of a third-party service.",
    ],
  },
  {
    title: "Independent platform and third-party rights",
    body: [
      "Fantasy Hub is an independent fantasy-football analysis platform. Fantasy Hub is not affiliated with, endorsed by, sponsored by, or an official partner of Sleeper, ESPN, the National Football League (NFL), NFL Players Inc., the NFL Players Association (NFLPA), any NFL member club, or any other referenced fantasy platform, league, team, or rights holder.",
      "All third-party names, trademarks, service marks, logos, player names, photographs, likenesses, statistics, and other intellectual property are the property of their respective owners. References to third-party platforms, leagues, teams, and players are used solely to identify compatible services or provide informational fantasy-football analysis. No such reference implies sponsorship, endorsement, authorization, or partnership.",
      "Nothing in these Terms grants you a right to copy, redistribute, sell, or otherwise exploit third-party data, branding, images, or intellectual property displayed through Fantasy Hub.",
    ],
  },
  {
    title: "nflverse data attribution",
    body: [
      "Portions of Fantasy Hub’s historical football data are derived from nflverse data licensed under the Creative Commons Attribution 4.0 International (CC BY 4.0) license. Fantasy Hub modifies, combines, and analyzes that data to produce independent fantasy-football statistics, rankings, and insights.",
      "nflverse does not sponsor, endorse, authorize, or otherwise affiliate with Fantasy Hub. The CC BY 4.0 license applies only to material that nflverse has authority to license and does not grant rights to third-party trademarks, team marks, photographs, player likenesses, or other intellectual property belonging to their respective owners.",
      "The nflverse data is provided on an as-is and as-available basis. Fantasy Hub does not represent that nflverse or any underlying data owner guarantees the accuracy, completeness, availability, or fitness of that data for a particular purpose.",
    ],
  },
  {
    title: "Weather information",
    body: [
      "Outdoor game forecasts are supplied by WeatherAPI.com and may be modified, combined with schedule information, or summarized by Fantasy Hub to provide fantasy-football context.",
      "Weather forecasts are probabilistic, may change before kickoff, and are provided for general informational purposes only. Do not use Fantasy Hub weather information as the sole basis for safety-critical decisions.",
    ],
  },
  {
    title: "Subscriptions and purchases",
    body: [
      "Some Fantasy Hub features require a paid subscription or one-time purchase. Prices, billing periods, included features, renewal terms, and trial terms are shown before purchase. Purchases made through Apple are billed and managed by Apple; eligible web purchases are billed and managed through the applicable payment provider.",
      "You can manage or cancel an Apple subscription through your Apple ID subscription settings. Cancellation prevents future renewal but does not normally provide a refund for time already purchased, except where required by law or the applicable marketplace rules.",
    ],
  },
  {
    title: "Recommendations and availability",
    body: [
      "Fantasy Hub recommendations, projections, rankings, news summaries, and AI-assisted explanations are informational estimates and may be incomplete, delayed, or incorrect. Fantasy Hub does not guarantee fantasy results, player availability, statistical accuracy, or uninterrupted service.",
      "To the maximum extent permitted by law, Fantasy Hub is provided without warranties of any kind, and Fantasy Hub is not responsible for losses resulting from fantasy-sports decisions, third-party outages, unavailable data, or reliance on generated recommendations.",
    ],
  },
  {
    title: "Apple terms and contact",
    body: [
      "Use of the Fantasy Hub iPhone application is also subject to Apple’s Standard End User License Agreement linked below. If these Terms conflict with mandatory marketplace terms, the applicable mandatory terms control.",
      "For questions about these Terms, use the support channel at fantasyhubapp.com and include “Terms of Use” in your message.",
    ],
  },
];

export default function TermsOfUsePage() {
  return (
    <main className="legal-page">
      <nav><Link href="/">← Back to Fantasy Hub</Link></nav>
      <header>
        <span>FANTASY HUB</span>
        <h1>Terms of Use</h1>
        <p>Effective August 23, 2026</p>
      </header>
      <section className="legal-intro">
        <p>These Terms govern your use of the Fantasy Hub website, iPhone application, subscriptions, and related fantasy-football services.</p>
      </section>
      {sections.map((section) => (
        <section key={section.title}>
          <h2>{section.title}</h2>
          {section.body.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
          {section.title === "nflverse data attribution" ? (
            <div className="legal-license-links" aria-label="nflverse attribution and license">
              <a href="https://github.com/nflverse/nflverse-data" target="_blank" rel="noopener noreferrer">nflverse data source ↗</a>
              <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">CC BY 4.0 license ↗</a>
            </div>
          ) : null}
          {section.title === "Weather information" ? (
            <div className="legal-license-links" aria-label="WeatherAPI.com attribution">
              <a href="https://www.weatherapi.com/" target="_blank" rel="noopener noreferrer">Weather data by WeatherAPI.com ↗</a>
            </div>
          ) : null}
          {section.title === "Apple terms and contact" ? (
            <a
              className="legal-eula-link"
              href="https://www.apple.com/legal/internet-services/itunes/dev/stdeula/"
              target="_blank"
              rel="noopener noreferrer"
            >
              <span>View Apple’s Standard EULA</span>
              <strong aria-hidden="true">↗</strong>
            </a>
          ) : null}
        </section>
      ))}
      <footer>Fantasy Hub · Independent fantasy-football analysis</footer>
    </main>
  );
}
