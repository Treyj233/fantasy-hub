# Mission Hub redesign rollback

The pre-redesign source, including the pending full action queue consolidation,
is saved in Git at tag `mission-hub-before-home-redesign` (commit `c3c3244`).

Revert the dedicated Mission Hub redesign commit to restore that experience
without undoing unrelated later work. The presentation lives in
`app/mission-home.css`; its import is in `app/layout.tsx`, and the home markup
changes are scoped to Mission Hub in `app/FantasyHub.tsx`.

Previous published release: Sites version 766. It predates both the redesign
and the pending queue consolidation. Redeploying it rolls back the full site,
so prefer a source-level revert if later updates need to remain.
