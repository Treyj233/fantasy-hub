"use client";

import { useEffect } from "react";

export function useOverlayGuard() {
  useEffect(() => {
    let activeDialog: HTMLElement | null = null;
    const overlaySelector = 'dialog[open], [role="dialog"][aria-modal="true"], .mobile-nav-open .sidebar, .mobile-category-menu';
    let overlays: HTMLElement[] = [];

    const sync = () => {
      overlays = Array.from(document.querySelectorAll<HTMLElement>(overlaySelector))
        .filter(element => element.getClientRects().length > 0 && getComputedStyle(element).visibility !== "hidden");
      const dialog = overlays.filter(element => element.matches('dialog[open], [role="dialog"][aria-modal="true"]')).at(-1) ?? null;
      document.documentElement.toggleAttribute("data-overlay-open", overlays.length > 0);
      if (dialog === activeDialog) return;
      activeDialog = dialog;
      if (dialog)
        window.requestAnimationFrame(() =>
          dialog?.querySelector<HTMLElement>('button[aria-label^="Close"], .close')?.focus({ preventScroll: true }),
        );
    };
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["open", "class", "aria-modal", "hidden"] });
    // WKWebView can propagate gestures from a backdrop despite overflow:hidden.
    const blockBackground = (event: TouchEvent | WheelEvent) => {
      if (!overlays.length || !(event.target instanceof Node)) return;
      const topDialog = activeDialog;
      const allowed = topDialog ? topDialog.contains(event.target) : overlays.some(panel => panel.contains(event.target as Node));
      if (!allowed && event.cancelable) event.preventDefault();
    };
    document.addEventListener("touchmove", blockBackground, { passive: false });
    document.addEventListener("wheel", blockBackground, { passive: false });
    window.addEventListener("resize", sync);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !activeDialog || activeDialog.tagName === "DIALOG") return;
      activeDialog.querySelector<HTMLButtonElement>('button[aria-label^="Close"], .close')?.click();
    };
    document.addEventListener("keydown", onKeyDown);
    sync();
    return () => {
      observer.disconnect();
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("touchmove", blockBackground);
      document.removeEventListener("wheel", blockBackground);
      window.removeEventListener("resize", sync);
      document.documentElement.removeAttribute("data-overlay-open");
    };
  }, []);
}
