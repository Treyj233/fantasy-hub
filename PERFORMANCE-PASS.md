# Game-day performance pass

Implemented locally; not published. No modules removed and normal live polling remains 30 seconds, with immediate foreground refresh and no overlapping requests.

- A reference-counted portfolio poller shares the same sorted league/week snapshot between the app shell and Fantasy Scoreboard. Last unsubscribe stops the timer, aborts requests and drops the in-memory entry. Requests have 12-second limits and concurrency remains three. Play-feed work starts in parallel with the score refresh.
- Other live pollers now receive cancellation signals, avoid overlap, and cancel on hide/unmount. Existing timeout helper is used for their fetches.
- Scoreboard reconciliation keeps unchanged league objects and the full state reference when only the response timestamp changed. Transient failures preserve last-known scores. Storage writes and score-state updates only occur on meaningful changes. The Updated label therefore reflects the last changed snapshot, not every background check.
- Both marquee systems use browser-managed transform animations instead of continuous JavaScript frame callbacks. Initial delay stays five seconds; subsequent loops hold twenty seconds. Offscreen/hidden animations pause. The global system caches distance rather than measuring it every frame, and limits mutation scans to affected subtrees.
- Decorative animations pause offscreen and while hidden. Mobile/coarse-pointer fire/ice cards keep their color, icons and status, but no longer continuously animate large card shadows and track-knob glows.
- Dotted navigation caches target elements and sticky clearance until layout/content changes, batches reads before writes, and avoids identical style writes. Overview and circular-only focus behavior remain intact.

Validation: production build passes; targeted polling, deduplication, cancellation, reconciliation, marquee and navigation tests pass. Full test suite and standalone TypeScript checks contain existing failures; compared against an untouched HEAD checkout, no new failing test names or TypeScript error categories were introduced (absolute checkout paths normalized).

Not measured: real iPhone CPU, GPU, energy consumption, temperature, or battery improvement. Before making quantified claims, compare the same live-game session on a physical iPhone, same brightness/network/charging conditions, including stationary scoreboard, scrolling, background/foreground, league/week changes and navigating away mid-refresh. Confirm live plays, scores and heat statuses remain accurate. No live-provider or on-device performance profile was performed in this pass.
