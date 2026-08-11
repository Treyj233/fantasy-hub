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
  performerLines: [
    { points: 27.8, yards: 132, touchdowns: 2, receptions: 8, targets: 10, heat: 92 },
    { points: 23.4, yards: 108, touchdowns: 1, receptions: 7, targets: 9, heat: 84 },
    { points: 20.6, yards: 96, touchdowns: 1, receptions: 6, targets: 8, heat: 77 },
    { points: 18.9, yards: 84, touchdowns: 1, receptions: 5, targets: 7, heat: 70 },
    { points: 17.2, yards: 76, touchdowns: 1, receptions: 4, targets: 6, heat: 65 },
  ],
} as const;

