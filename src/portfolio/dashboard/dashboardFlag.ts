/**
 * The portfolio dashboard (winged-sun sky, allocation fan, All wallets scope) is behind a build-time flag.
 *
 * A build carries it only when it sets `VUE_APP_PORTFOLIO_DASHBOARD=true` and is not in production mode, so it cannot
 * reach a release by accident. It is not remote configuration and it is not in `PRODUCTION_RELEASE_FLAGS`: moving it
 * into a release is a decision for the release checklist, not a side effect of a build variable.
 *
 * The decision is made once, in `portfolioDashboardBuildFlag` (vite.config.shared.mjs), and reaches the bundle as the
 * literal behind `process.env.FW_PORTFOLIO_DASHBOARD`. A build without the dashboard then ships none of its code or
 * strings. Two rules keep that true, both checked against a production build (docs/portfolio-dashboard.md):
 *
 * - Plain uses of the dashboard (a store, a function) may test `PORTFOLIO_DASHBOARD_ENABLED`; the unused code and its
 *   imports are dropped.
 * - A dynamic `import()` of a dashboard screen must be guarded by the literal test written in place,
 *   `process.env.FW_PORTFOLIO_DASHBOARD === 'true' ? ... : ...`. The bundler builds its module graph before it folds
 *   a constant imported from here, and would still emit the screen as a chunk nothing loads.
 *
 * Outside a bundled build (unit tests) the variable is unset and the flag is off.
 */
export const PORTFOLIO_DASHBOARD_ENABLED: boolean = process.env.FW_PORTFOLIO_DASHBOARD === 'true';
