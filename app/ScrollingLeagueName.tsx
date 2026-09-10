"use client";

import { useEffect, useRef } from "react";

/** React owns the name nodes; the global DOM-rewriting marquee must skip them. */
export default function ScrollingLeagueName({ name }: { name: string }) {
  const viewport = useRef<HTMLSpanElement>(null);
  const track = useRef<HTMLSpanElement>(null);
  const first = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const container = viewport.current;
    const moving = track.current;
    const copy = first.current;
    if (!container || !moving || !copy) return;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    let started = 0;
    let distance = 0;
    const tick = (now: number) => {
      if (!started) started = now;
      const duration = Math.max(4000, distance * 32);
      const age = now - started;
      const firstCycle = 5000 + duration;
      const pause = age < firstCycle ? 5000 : 20000;
      const elapsed = age < firstCycle ? age : (age - firstCycle) % (20000 + duration);
      moving.style.transform = `translate3d(${-distance * (elapsed < pause ? 0 : (elapsed - pause) / duration)}px,0,0)`;
      frame = requestAnimationFrame(tick);
    };
    const measure = () => {
      const width = copy.getBoundingClientRect().width;
      // Hidden/collapsed sections have no usable geometry. Do not reset a
      // running label in response to a temporary zero-width measurement.
      if (!width || !container.clientWidth) return;
      const next = !media.matches && width > container.clientWidth + 3 ? width + 24 : 0;
      if (next === distance) return;
      cancelAnimationFrame(frame);
      distance = next;
      container.dataset.scrolling = distance ? "true" : "false";
      started = 0;
      moving.style.transform = "translate3d(0,0,0)";
      if (distance) frame = requestAnimationFrame(tick);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    observer.observe(copy);
    media.addEventListener("change", measure);
    measure();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      media.removeEventListener("change", measure);
    };
  }, [name]);
  return <span className="mission-league-name" data-no-auto-scroll title={name} ref={viewport}>
    <span className="mission-league-name-track" ref={track}>
      <span ref={first}>{name}</span><span aria-hidden="true">{name}</span>
    </span>
  </span>;
}
