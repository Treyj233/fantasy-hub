# Fantasy Scoreboard mobile refresh rollback

Previous production: Sites version 757.
Previous source: `f34708d0449c210b6295b5226e3aae54e1bcb702`.
Previous saved version: `appgprj_6a77e5e36a58819193c94a06d587e6c6~appgver_1ba6441cff88819181e21edd0ef8f0a7`.

For a presentation-only rollback that preserves later work, remove the
`./fantasy-scoreboard-mobile.css` import from `app/layout.tsx`, build, and publish.
The isolated stylesheet only applies to `.portfolio-scoreboard-page` at widths
of 700px or less. It does not change data or module visibility.

For an immediate full deployment rollback, redeploy saved Sites version 757.
That restores the entire previous deployment, so prefer the import removal if
other features have been published since this refresh.
