"use client";
export default function ScrollingLeagueName({ name }: { name: string }) {
  return <span className="mission-league-name" data-overflow-label>{name}</span>;
}
