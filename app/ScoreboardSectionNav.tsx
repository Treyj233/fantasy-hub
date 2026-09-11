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
    const update = () => {
      frame = 0;
      const indices = sections.flatMap(([selector], index) => page.querySelector(selector) ? [index] : []);
      setAvailable(previous => previous.join() === indices.join() ? previous : indices);
      const handle = document.querySelector(".league-edge-handle");
      const bottom = handle?.getBoundingClientRect().bottom ?? 150;
      rail.current?.style.setProperty("--section-nav-top", `${Math.max(150, bottom + 16)}px`);
      const pulse = page.querySelector(".sunday-pulse");
      const threshold = Math.max(100, (pulse?.getBoundingClientRect().bottom ?? 0) + 24);
      let current = indices[0] ?? 0;
      for (const index of indices) {
        if (page.querySelector(sections[index][0])!.getBoundingClientRect().top <= threshold) current = index;
      }
      if (window.scrollY > 0 && window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2) {
        current = indices.at(-1) ?? current;
      }
      setActive(current);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    const resize = new ResizeObserver(schedule);
    resize.observe(page);
    const handle = document.querySelector(".league-edge-handle");
    if (handle) resize.observe(handle);
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    update();
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [sections]);

  const jump = (index: number) => {
    const page = rail.current?.closest(".page-content");
    const target = page?.querySelector(sections[index][0]);
    if (!target) return;
    const pulse = page?.querySelector<HTMLElement>(".sunday-pulse");
    const clearance = pulse ? (parseFloat(getComputedStyle(pulse).top) || 0) + pulse.offsetHeight + 12 : 80;
    window.scrollTo({
      top: Math.max(0, window.scrollY + target.getBoundingClientRect().top - clearance),
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
