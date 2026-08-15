/**
 * Central pre-kickoff visual fixtures.
 *
 * These values only stage modules that require live scoring events. They never
 * replace connected league rosters, teams, projections, schedules, or results.
 * Set this one flag to false (or remove this file and its import) for the final
 * live-only release.
 */
export const PRE_KICKOFF_VISUALS_ENABLED = true;

export const PRE_KICKOFF_VISUALS = {
  swingMovements: [15, -10, 5],
  swingWindows: ["EARLY WINDOW", "LATE WINDOW", "PRIME TIME"],
} as const;
