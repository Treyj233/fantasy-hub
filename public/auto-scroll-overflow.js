(() => {
  const tracked = new Map();
  const visible = new Set();
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let scanTimer = 0;

  const intersectionObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) visible.add(entry.target);
      else visible.delete(entry.target);
    }
  });

  const stopTracking = (element) => {
    tracked.delete(element);
    visible.delete(element);
    intersectionObserver.unobserve(element);
    element.classList.remove("fh-auto-scroll-text");
    element.scrollLeft = 0;
  };

  const inspect = (element) => {
    if (!(element instanceof HTMLElement) || !element.isConnected) return;
    const style = window.getComputedStyle(element);
    const isEllipsis = style.textOverflow === "ellipsis" || element.classList.contains("fh-auto-scroll-text");
    const overflow = element.scrollWidth - element.clientWidth;
    if (!isEllipsis || overflow < 3) {
      if (tracked.has(element)) stopTracking(element);
      return;
    }
    if (!tracked.has(element)) {
      tracked.set(element, { startedAt: performance.now() });
      element.classList.add("fh-auto-scroll-text");
      if (!element.hasAttribute("title")) element.title = (element.textContent || "").trim();
      intersectionObserver.observe(element);
    }
  };

  const scan = () => {
    scanTimer = 0;
    for (const element of tracked.keys()) {
      if (!element.isConnected) stopTracking(element);
    }
    document.querySelectorAll("*").forEach(inspect);
  };

  const scheduleScan = () => {
    window.clearTimeout(scanTimer);
    scanTimer = window.setTimeout(scan, 160);
  };

  new MutationObserver(scheduleScan).observe(document.documentElement, {
    childList: true,
    characterData: true,
    subtree: true,
  });
  window.addEventListener("resize", scheduleScan, { passive: true });
  window.addEventListener("load", scan, { once: true });
  scheduleScan();

  const animate = (now) => {
    if (!reduceMotion.matches) {
      for (const element of visible) {
        const state = tracked.get(element);
        if (!state) continue;
        const distance = Math.max(0, element.scrollWidth - element.clientWidth);
        if (distance < 3) continue;
        const pause = 1100;
        const travel = Math.max(1500, Math.min(6000, distance * 24));
        const cycle = pause * 2 + travel * 2;
        const phase = (now - state.startedAt) % cycle;
        let position = 0;
        if (phase < pause) position = 0;
        else if (phase < pause + travel) position = distance * ((phase - pause) / travel);
        else if (phase < pause * 2 + travel) position = distance;
        else position = distance * (1 - ((phase - pause * 2 - travel) / travel));
        element.scrollLeft = position;
      }
    }
    window.requestAnimationFrame(animate);
  };

  window.requestAnimationFrame(animate);
})();
