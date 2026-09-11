(() => {
  const tracked = new Map();
  const visible = new Set();
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let scanTimer = 0;
  const dirty = new Set();
  let fullScan = true;

  const syncAnimation = (element) => {
    const animation = tracked.get(element)?.animation;
    if (!animation) return;
    if (visible.has(element) && document.visibilityState === "visible" && !reduceMotion.matches) animation.play();
    else animation.pause();
  };
  const startAnimation = (element, state, distance) => {
    if (distance === state.distance && state.animation) return;
    state.animation?.cancel();
    state.distance = distance;
    const duration = Math.max(4000, distance * 32);
    const from = "translate3d(0,0,0)";
    const to = `translate3d(${-distance}px,0,0)`;
    state.animation = state.track.animate([{ transform: from }, { transform: to }], { duration, delay: 5000 });
    state.animation.onfinish = () => {
      state.animation = state.track.animate([
        { transform: from, offset: 0 },
        { transform: from, offset: 20000 / (20000 + duration) },
        { transform: to, offset: 1 },
      ], { duration: 20000 + duration, iterations: Infinity });
      syncAnimation(element);
    };
    syncAnimation(element);
  };

  const intersectionObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) visible.add(entry.target);
      else visible.delete(entry.target);
      syncAnimation(entry.target);
    }
  });

  const stopTracking = (element) => {
    const state = tracked.get(element);
    state?.animation?.cancel();
    if (state?.track?.parentElement === element) element.textContent = state.originalText;
    tracked.delete(element);
    visible.delete(element);
    intersectionObserver.unobserve(element);
    element.classList.remove("fh-auto-scroll-text");
    element.scrollLeft = 0;
  };

  const inspect = (element) => {
    if (!(element instanceof HTMLElement) || !element.isConnected) return;
    if (element.closest("[data-no-auto-scroll], .fh-marquee-track")) return;
    if (!element.clientWidth) return;
    const current = tracked.get(element);
    if (current && !current.track.isConnected) {
      current.animation?.cancel();
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
    // A translated track changes its parent's scrollWidth as it moves. Measure
    // the original copy instead so live-update scans cannot tear down/restart
    // a valid marquee midway through its animation.
    const state = tracked.get(element);
    const textWidth = state ? state.first.getBoundingClientRect().width : element.scrollWidth;
    const overflow = textWidth - element.clientWidth;
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
      tracked.set(element, { track, first, originalText });
      element.classList.add("fh-auto-scroll-text");
      if (!element.hasAttribute("title")) element.title = originalText;
      intersectionObserver.observe(element);
    }
    const measured = tracked.get(element);
    if (measured && element.clientWidth) {
      const distance = measured.first.getBoundingClientRect().width + parseFloat(getComputedStyle(measured.track.children[1]).paddingLeft || "0");
      if (distance > 3) startAnimation(element, measured, distance);
    }
  };

  const scan = () => {
    scanTimer = 0;
    for (const element of tracked.keys()) {
      if (!element.isConnected) stopTracking(element);
    }
    const roots = fullScan ? [document.querySelector(".app-shell") || document.body] : [...dirty];
    fullScan = false;
    dirty.clear();
    for (const root of roots) {
      if (!root?.isConnected) continue;
      inspect(root);
      root.querySelectorAll?.("span,strong,b,small,p,h1,h2,h3,h4,button,a,td,label").forEach(inspect);
    }
  };

  const scheduleScan = () => {
    window.clearTimeout(scanTimer);
    scanTimer = window.setTimeout(scan, 160);
  };

  new MutationObserver(records => {
    for (const record of records) {
      const target = record.target instanceof Element ? record.target : record.target.parentElement;
      if (target?.closest(".fh-marquee-track")) continue;
      if (target) dirty.add(target);
    }
    if (dirty.size) scheduleScan();
  }).observe(document.documentElement, {
    childList: true,
    characterData: true,
    subtree: true,
  });
  window.addEventListener("resize", () => { fullScan = true; scheduleScan(); }, { passive: true });
  window.addEventListener("load", () => { fullScan = true; scan(); }, { once: true });
  reduceMotion.addEventListener("change", () => { fullScan = true; scheduleScan(); });
  document.addEventListener("visibilitychange", () => {
    for (const element of tracked.keys()) syncAnimation(element);
  });
  scheduleScan();

})();
