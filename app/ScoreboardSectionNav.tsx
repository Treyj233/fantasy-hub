"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import { nativeImpact } from "./native-runtime";

const scoreboardSections = [
  [".portfolio-scoreboard-head", "Overview"],
  [".portfolio-score-rail", "League scores"],
  [".game-day-command", "Command Center"],
  [".sunday-spotlight", "Featured matchup"],
  [".portfolio-win-path", "Live Win Paths"],
  [".on-fire-board", "Hottest Performers"],
  [".rooting-interests", "Rooting Interests"],
  [".sunday-swing", "Sunday Swings"],
  [".portfolio-scoreboard-grid", "Matchups"],
] as const;

const missionSections = [
  [".all-leagues-hero", "Overview"],
  [".priority-inbox", "Priority actions"],
  [".action-queue", "Full action queue"],
  [".portfolio-section:has(.health-list)", "Weekly readiness"],
  [".portfolio-section:has(.portfolio-matchups)", "Matchup board"],
  [".portfolio-section:has(.exposure-list)", "Player exposure"],
  [".portfolio-section:has(.waiver-opportunity-list)", "Waiver opportunities"],
  [".portfolio-recap", "Weekly recap"],
  [".league-scan-list", "League details"],
] as const;

function sectionClearance(page: Element) {
  const header = document.querySelector<HTMLElement>(".mobile-header-stack");
  const headerStyle = header ? getComputedStyle(header) : null;
  const headerBottom = header && headerStyle && ["sticky", "fixed"].includes(headerStyle.position)
    ? (parseFloat(headerStyle.top) || 0) + header.getBoundingClientRect().height
    : 0;
  const pulse = page.querySelector<HTMLElement>(".sunday-pulse");
  const pulseBottom = pulse ? (parseFloat(getComputedStyle(pulse).top) || 0) + pulse.offsetHeight : 0;
  return Math.max(headerBottom, pulseBottom, 68) + 12;
}

export default function ScoreboardSectionNav({ pageType = "scoreboard" }: { pageType?: "scoreboard" | "mission" }) {
  const sections = pageType === "mission" ? missionSections : scoreboardSections;
  const rail = useRef<HTMLElement>(null);
  const dragging = useRef(false);
  const previewedSection = useRef<number | null>(null);
  const [available, setAvailable] = useState<number[]>([]);
  const [active, setActive] = useState(0);
  const [preview, setPreview] = useState<number | null>(null);

  useEffect(() => {
    const page = rail.current?.closest(".page-content");
    if (!page) return;
    let frame = 0;
    let dirty = true;
    let targets: { index: number; element: Element }[] = [];
    let threshold = 100;
    let handle: Element | null = null;
    let lastHandleBottom = 150;
    const navigation = document.querySelector(".mobile-category-tray");
    const update = () => {
      frame = 0;
      if (dirty) {
        targets = sections.flatMap(([selector], index) => {
          const element = page.querySelector(selector);
          return element ? [{ index, element }] : [];
        });
        threshold = sectionClearance(page) + 12;
        dirty = false;
      }
      const indices = targets.map(target => target.index);
      // The league drawer unmounts its portal handle while open. Rebind after
      // it closes instead of measuring a detached element (which returns zero).
      const currentHandle = document.querySelector(".league-edge-handle");
      if (currentHandle !== handle) {
        if (handle) resize.unobserve(handle);
        handle = currentHandle;
        if (handle) resize.observe(handle);
      }
      const handleRect = handle?.getBoundingClientRect();
      if (handleRect && handleRect.height > 0 && handleRect.width > 0) lastHandleBottom = handleRect.bottom;
      const bottom = lastHandleBottom;
      const top = Math.max(150, bottom + 16);
      const viewportBottom = window.visualViewport
        ? window.visualViewport.offsetTop + window.visualViewport.height
        : window.innerHeight;
      const navigationRect = navigation?.getBoundingClientRect();
      // The category tray lives in the header. Only constrain the lower edge
      // when the navigation is actually below the rail, not above it.
      const navigationTop = navigationRect && navigationRect.height > 0 && navigationRect.width > 0 && navigationRect.top > top
        ? navigationRect.top : viewportBottom - 90;
      const availableHeight = Math.max(0, Math.min(viewportBottom, navigationTop) - top - 12);
      let current = indices[0] ?? 0;
      for (const { index, element } of targets) {
        if (element.getBoundingClientRect().top <= threshold) current = index;
      }
      if (window.scrollY <= 2) current = indices[0] ?? 0;
      if (window.scrollY > 0 && window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2) {
        current = indices.at(-1) ?? current;
      }
      // All layout reads precede writes. Never rewrite identical rail styles.
      const nav = rail.current;
      const styles = { "--section-nav-top": `${top}px`, "--section-nav-height": `${Math.min(indices.length * 32, availableHeight)}px` };
      for (const [property, value] of Object.entries(styles)) {
        if (nav && nav.style.getPropertyValue(property) !== value) nav.style.setProperty(property, value);
      }
      const insufficient = availableHeight < indices.length * 16;
      if (nav && nav.hasAttribute("data-insufficient-space") !== insufficient) nav.toggleAttribute("data-insufficient-space", insufficient);
      setAvailable(previous => previous.join() === indices.join() ? previous : indices);
      setActive(previous => previous === current ? previous : current);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    const invalidate = () => { dirty = true; schedule(); };
    const resize = new ResizeObserver(invalidate);
    resize.observe(page);
    const stickyHeader = document.querySelector(".mobile-header-stack");
    if (stickyHeader) resize.observe(stickyHeader);
    if (navigation) resize.observe(navigation);
    const mutations = new MutationObserver(invalidate);
    mutations.observe(page, { childList: true, subtree: true });
    // Drawer/handle portals are siblings of the app, outside page-content.
    const portals = new MutationObserver(invalidate);
    portals.observe(document.body, { childList: true });
    window.visualViewport?.addEventListener("resize", invalidate);
    window.visualViewport?.addEventListener("scroll", schedule);
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", invalidate);
    update();
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      mutations.disconnect();
      portals.disconnect();
      window.visualViewport?.removeEventListener("resize", invalidate);
      window.visualViewport?.removeEventListener("scroll", schedule);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", invalidate);
    };
  }, [sections]);

  const jump = (index: number) => {
    const page = rail.current?.closest(".page-content");
    const target = page?.querySelector(sections[index][0]);
    if (!target) return;
    const clearance = sectionClearance(page!);
    window.scrollTo({
      top: index === 0 ? 0 : Math.max(0, window.scrollY + target.getBoundingClientRect().top - clearance),
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    });
  };
  const atPointer = (event: PointerEvent<HTMLElement>) => {
    const buttons = Array.from(rail.current?.querySelectorAll("button") ?? []);
    let closest = 0;
    let distance = Infinity;
    buttons.forEach((button, index) => {
      const rect = button.getBoundingClientRect();
      const delta = Math.abs(event.clientY - (rect.top + rect.height / 2));
      if (delta < distance) { closest = index; distance = delta; }
    });
    return available[closest] ?? 0;
  };
  const previewSection = (index: number) => {
    if (previewedSection.current !== index) {
      previewedSection.current = index;
      void nativeImpact("light");
    }
    setPreview(index);
  };

  return <nav ref={rail} className="scoreboard-section-nav" aria-label={pageType === "mission" ? "Mission Hub sections" : "Scoreboard sections"}
    onPointerDown={event => {
      if (!event.isPrimary || event.button !== 0) return;
      // Touch navigation is handled here; avoid native button focus/tap chrome.
      event.preventDefault();
      event.stopPropagation();
      dragging.current = true;
      event.currentTarget.setPointerCapture(event.pointerId);
      previewSection(atPointer(event));
    }}
    onPointerMove={event => { if (dragging.current) { event.stopPropagation(); previewSection(atPointer(event)); } }}
    onPointerUp={event => {
      if (!dragging.current) return;
      event.stopPropagation();
      dragging.current = false;
      previewedSection.current = null;
      jump(atPointer(event));
      setPreview(null);
      event.currentTarget.releasePointerCapture(event.pointerId);
    }}
    onPointerCancel={() => { dragging.current = false; previewedSection.current = null; setPreview(null); }}
    onLostPointerCapture={() => { dragging.current = false; previewedSection.current = null; setPreview(null); }}>
    {available.map(index => <button key={index} type="button" aria-label={sections[index][1]}
      aria-current={active === index ? "location" : undefined}
      className={preview === index ? "previewing" : ""}
      onClick={event => { if (event.detail === 0) { void nativeImpact("light"); jump(index); } }}>
      <i aria-hidden="true" />
      <span className="section-nav-label">{sections[index][1]}</span>
    </button>)}
  </nav>;
}
