import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Fantasy Hub",
    short_name: "Fantasy Hub",
    description: "Fantasy football decisions, live matchups, waivers, trades, and game-day intelligence.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f4f7f5",
    theme_color: "#f4f7f5",
    icons: [{ src: "/favicon.png", sizes: "any", type: "image/png" }],
  };
}
