/**
 * The portfolio dashboard (winged-sun sky, allocation fan, All wallets scope, Where it lives) is behind a build-time flag.
 *
 * It ships: a release pins it on through `PRODUCTION_RELEASE_FLAGS` (scripts/build-extension.mjs), the Chrome release
 * audit checks that it did, and every other build carries it too. `VUE_APP_PORTFOLIO_DASHBOARD=false` leaves it out of a
 * development or test build; a release without it is a change to the release flags, not a build variable. It is not
 * remote configuration.
 *
 * The decision is made once, in `portfolioDashboardBuildFlag` (vite.config.shared.mjs), and reaches the bundle as the
 * literal behind `process.env.FW_PORTFOLIO_DASHBOARD`. A build without the dashboard then ships none of its code or
 * strings. Two rules keep that true, and `yarn audit:portfolio-dashboard-absent` checks such a build
 * (docs/portfolio-dashboard.md):
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
