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
    let animation: Animation | undefined;
    let visible = false;
    let distance = 0;
    const sync = () => {
      if (!animation) return;
      if (visible && document.visibilityState === "visible" && !media.matches) animation.play();
      else animation.pause();
    };
    const start = () => {
      animation?.cancel();
      if (!distance) return;
      const duration = Math.max(4000, distance * 32);
      const from = "translate3d(0,0,0)";
      const to = `translate3d(${-distance}px,0,0)`;
      animation = moving.animate([{ transform: from }, { transform: to }], { duration, delay: 5000 });
      animation.onfinish = () => {
        animation = moving.animate([
          { transform: from, offset: 0 },
          { transform: from, offset: 20000 / (20000 + duration) },
          { transform: to, offset: 1 },
        ], { duration: 20000 + duration, iterations: Infinity });
        sync();
      };
      sync();
    };
    const measure = () => {
      const width = copy.getBoundingClientRect().width;
      // Hidden/collapsed sections have no usable geometry. Do not reset a
      // running label in response to a temporary zero-width measurement.
      if (!width || !container.clientWidth) return;
      const next = !media.matches && width > container.clientWidth + 3 ? width + 24 : 0;
      if (next === distance) return;
      distance = next;
      container.dataset.scrolling = distance ? "true" : "false";
      moving.style.transform = "translate3d(0,0,0)";
      start();
    };
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    observer.observe(copy);
    const intersection = new IntersectionObserver(entries => {
      visible = entries[0]?.isIntersecting ?? false;
      sync();
    });
    intersection.observe(container);
    document.addEventListener("visibilitychange", sync);
    media.addEventListener("change", measure);
    measure();
    return () => {
      animation?.cancel();
      observer.disconnect();
      intersection.disconnect();
      document.removeEventListener("visibilitychange", sync);
      media.removeEventListener("change", measure);
    };
  }, [name]);
  return <span className="mission-league-name" data-no-auto-scroll title={name} ref={viewport}>
    <span className="mission-league-name-track" ref={track}>
      <span ref={first}>{name}</span><span aria-hidden="true">{name}</span>
    </span>
  </span>;
}
