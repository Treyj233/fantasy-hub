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
    const state = tracked.get(element);
    if (state?.track?.parentElement === element) element.textContent = state.originalText;
    tracked.delete(element);
    visible.delete(element);
    intersectionObserver.unobserve(element);
    element.classList.remove("fh-auto-scroll-text");
    element.scrollLeft = 0;
  };

  const inspect = (element) => {
    if (!(element instanceof HTMLElement) || !element.isConnected) return;
    if (element.closest("[data-no-auto-scroll]")) return;
    const current = tracked.get(element);
    if (current && !current.track.isConnected) {
      tracked.delete(element);
      visible.delete(element);
      intersectionObserver.unobserve(element);
      element.classList.remove("fh-auto-scroll-text");
    }
    if (reduceMotion.matches) {
      if (tracked.has(element)) stopTracking(element);
      return;
    }
    const style = window.getComputedStyle(element);
    const isEllipsis = style.textOverflow === "ellipsis" || element.classList.contains("fh-auto-scroll-text") || element.classList.contains("overflow-auto-scroll");
    const overflow = element.scrollWidth - element.clientWidth;
    if (!isEllipsis || overflow < 3) {
      if (tracked.has(element)) stopTracking(element);
      return;
    }
    if (!tracked.has(element)) {
      if (element.childElementCount > 0) return;
      const originalText = (element.textContent || "").trim();
      if (!originalText) return;
      const track = document.createElement("span");
      track.className = "fh-marquee-track";
      const first = document.createElement("span");
      first.className = "fh-marquee-copy";
      first.textContent = originalText;
      const second = document.createElement("span");
      second.className = "fh-marquee-copy";
      second.textContent = originalText;
      second.setAttribute("aria-hidden", "true");
      track.append(first, second);
      element.textContent = "";
      element.append(track);
      tracked.set(element, { startedAt: performance.now(), track, first, originalText });
      element.classList.add("fh-auto-scroll-text");
      if (!element.hasAttribute("title")) element.title = originalText;
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
        if (!state.track.isConnected) continue;
        const loopDistance = state.first.getBoundingClientRect().width + parseFloat(getComputedStyle(state.track.children[1]).paddingLeft || "0");
        if (loopDistance < 3) continue;
        const scrollDuration = Math.max(4000, loopDistance * 32);
        const age = now - state.startedAt;
        const firstCycleDuration = 5000 + scrollDuration;
        const pauseDuration = age < firstCycleDuration ? 5000 : 20000;
        const elapsed = age < firstCycleDuration
          ? age
          : (age - firstCycleDuration) % (20000 + scrollDuration);
        const progress = elapsed < pauseDuration ? 0 : (elapsed - pauseDuration) / scrollDuration;
        state.track.style.transform = `translate3d(${-loopDistance * progress}px,0,0)`;
      }
    }
    window.requestAnimationFrame(animate);
  };

  window.requestAnimationFrame(animate);
})();
