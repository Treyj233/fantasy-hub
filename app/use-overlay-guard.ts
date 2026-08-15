"use client";

import { useEffect } from "react";

export function useOverlayGuard() {
  useEffect(() => {
    let activeDialog: HTMLElement | null = null;
    let previousOverflow = "";

    const sync = () => {
      const dialog = document.querySelector<HTMLElement>('[role="dialog"][aria-modal="true"]');
      if (dialog === activeDialog) return;
      if (!activeDialog && dialog) previousOverflow = document.body.style.overflow;
      activeDialog = dialog;
      document.documentElement.toggleAttribute("data-overlay-open", Boolean(dialog));
      document.body.style.overflow = dialog ? "hidden" : previousOverflow;
      if (dialog)
        window.requestAnimationFrame(() =>
          dialog?.querySelector<HTMLElement>('button[aria-label^="Close"], .close')?.focus(),
        );
    };
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !activeDialog) return;
      activeDialog.querySelector<HTMLButtonElement>('button[aria-label^="Close"], .close')?.click();
    };
    document.addEventListener("keydown", onKeyDown);
    sync();
    return () => {
      observer.disconnect();
      document.removeEventListener("keydown", onKeyDown);
      document.documentElement.removeAttribute("data-overlay-open");
      document.body.style.overflow = previousOverflow;
    };
  }, []);
}
