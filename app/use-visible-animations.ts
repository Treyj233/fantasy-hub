"use client";

import { useEffect } from "react";

const targets = ".temperature-card-fire,.temperature-card-ice,.player-temperature,.fire-player-visual,.portfolio-scoreboard-page>section,.portfolio-scoreboard-grid>section,.head-to-head-player,.sunday-pulse,.team-active-live,.league-edge-handle,.all-league-metrics article";

export function useVisibleAnimations() {
  useEffect(() => {
    const root = document.querySelector(".app-shell");
    if (!root) return;
    const tracked = new Set<Element>();
    let frame = 0;
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        entry.target.setAttribute("data-animation-visible", String(entry.isIntersecting));
      }
    });
    const scan = () => {
      frame = 0;
      for (const element of tracked) {
        if (!element.isConnected || !element.matches(targets)) {
          observer.unobserve(element);
          element.removeAttribute("data-animation-visible");
          tracked.delete(element);
        }
      }
      root.querySelectorAll(targets).forEach(element => {
        if (tracked.has(element)) return;
        tracked.add(element);
        element.setAttribute("data-animation-visible", "false");
        observer.observe(element);
      });
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(scan); };
    const mutations = new MutationObserver(schedule);
    mutations.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
    const visibility = () => {
      document.documentElement.toggleAttribute("data-animations-hidden", document.visibilityState !== "visible");
    };
    document.addEventListener("visibilitychange", visibility);
    visibility();
    scan();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      mutations.disconnect();
      document.removeEventListener("visibilitychange", visibility);
      document.documentElement.removeAttribute("data-animations-hidden");
      tracked.forEach(element => element.removeAttribute("data-animation-visible"));
    };
  }, []);
}
