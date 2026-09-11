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
      const measurements = Array.from(document.querySelectorAll<HTMLElement>(AUTO_SCROLL_TARGETS)).map((element) => {
        const overflow = element.scrollWidth - element.clientWidth;
        const eligible = !media.matches && overflow > 3;
        return { element, eligible };
      });
      measurements.forEach(({ element, eligible }) => {
        element.classList.toggle("overflow-auto-scroll", eligible);
        if (!eligible) {
          return;
        }
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
