"use client";

import { useEffect } from "react";

const AUTO_SCROLL_TARGETS = [
  ".league-pills button span",
  ".rank-player strong",
  ".waiver-list-player strong",
  ".portfolio-action-list strong",
  ".team-assets-grid strong",
  ".calculator-package-summary b",
  ".trade-asset p strong",
].join(",");

export function useOverflowAutoScroll() {
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;

    const update = () => {
      frame = 0;
      document.querySelectorAll<HTMLElement>(AUTO_SCROLL_TARGETS).forEach((element) => {
        const overflow = element.scrollWidth - element.clientWidth;
        const eligible = !media.matches && overflow > 3;
        element.classList.toggle("overflow-auto-scroll", eligible);
        if (!eligible) {
          element.style.removeProperty("--overflow-pan");
          element.style.removeProperty("--overflow-duration");
          element.style.removeProperty("--overflow-delay");
          return;
        }
        element.style.setProperty("--overflow-pan", `${-(overflow + 10)}px`);
        element.style.setProperty(
          "--overflow-duration",
          `${Math.max(7, Math.min(18, 6 + overflow / 14)).toFixed(1)}s`,
        );
        element.style.setProperty(
          "--overflow-delay",
          `${(element.textContent?.length ?? 0) % 4}s`,
        );
        if (!element.title) element.title = element.textContent?.trim() ?? "";
      });
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    const mutations = new MutationObserver(schedule);
    const appShell = document.querySelector(".app-shell");
    if (appShell)
      mutations.observe(appShell, { childList: true, characterData: true, subtree: true });
    const resize = new ResizeObserver(schedule);
    resize.observe(document.documentElement);
    media.addEventListener("change", schedule);
    schedule();
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      mutations.disconnect();
      resize.disconnect();
      media.removeEventListener("change", schedule);
    };
  }, []);
}
