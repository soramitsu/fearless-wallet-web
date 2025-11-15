# Vue 3 Migration — Status & Verification

Updated: 2024-10-07  
Owners: Michael Takemiya & Alexei Sidorov

## 1. Snapshot

- App bootstrap now flows through `createApp`/`createPinia` factories (`src/app/createApp.ts`, `src/stores/setup.ts`), and `src/main.ts` mounts the Vue 3 instance via `createApp`.
- Composition API + `<script setup>` have replaced Options API in high-traffic views (`src/screens/**`) and shared UI modules (`src/components/**`). Legacy helpers were rewritten or removed.
- Router guards align with Vue 3 idioms (`src/router/index.ts`), dropping `beforeRouteEnter` shims in favor of `router.beforeEach` + composables.
- Stores moved to Pinia (`src/stores/**`), with strongly typed modules and shared helpers (`src/stores/setup.ts`, `src/stores/index.ts`).
- 3rd-party upgrades (`package.json`, `yarn.lock`) cover Vue 3, Vue Router 4, Pinia, Soramitsu UI, and Vue Test Utils v2. Custom plugins live under `src/plugins/**`.
- Unit harness uses `@vue/test-utils` v2 + Jest 27 (`jest.config.js`, `tests/unit/setupTests.ts`), and coverage targets have been updated accordingly.

## 2. Completed Work

| Area                | Highlights                                                                                                                                                          | References                                             |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Bootstrap & Plugins | `createFearlessApp` registers Pinia, router, i18n, Soramitsu UI, notifications. Service worker mount handled in `src/main.ts`.                                      | `src/app/createApp.ts`, `src/main.ts`                  |
| Stores              | Pinia setup with typed contexts, account/network modules rewritten (`src/stores/accounts/index.ts`, `src/stores/networks/index.ts`, `src/stores/staking/index.ts`). | `src/stores/**`, `src/stores/setup.ts`                 |
| Components          | All major screens converted to `<script setup>` with Composition API state. Shared components removed deprecated APIs.                                              | `src/screens/**/*.vue`, `src/components/**/*.vue`      |
| Router              | Vue Router 4 config with meta-based guards, async data wrappers, and error boundaries.                                                                              | `src/router/index.ts`                                  |
| Tooling             | Jest/Vitest config updated, Vue Test Utils v2 harness, ESLint+TS configs tightened for script setup patterns.                                                       | `jest.config.js`, `tsconfig.json`, `eslint.config.mjs` |

## 3. Verification Checklist

1. **Automated**
   - `yarn format:check`
   - `yarn lint:ci`
   - `yarn test:unit`
   - `yarn build:extension:all` (ensures Chrome MV3 + Firefox MV2 builds succeed under Vue 3).
2. **Manual smoke**
   - Extension popup: onboarding, account switch, swaps, staking, pools.
   - Web build: `/staking`, `/swap`, `/wallet-connect` flows (confirm no Options API leftovers).
   - Check router transitions (e.g., background approvals) to confirm guard behaviour.
3. **Regression targets**
   - Visual tokens + Soramitsu theme alignment.
   - Pinia devtools + persisted store hydration after reload.

## 4. Risks & Follow-ups

- **Service worker suspend**: keep watching for `createApp` hydration issues when the extension popup resumes from idle; add telemetry once shared hooks land.
- **Third-party plugins**: Soramitsu UI releases occasionally require CSS token tweaks—track in `package.json` and `src/styles/soramitsu-variables.scss`.
- **Testing debt**: Cypress/E2E suite still points at Vue 2-specific helpers; plan a follow-up migration once the unit harness stabilizes.

## 5. Next Steps

| Task                                                 | Owner        | ETA        | Status  |
| ---------------------------------------------------- | ------------ | ---------- | ------- |
| Promote Vue 3 branch to main                         | Release team | 2024-10-15 | Pending |
| Refresh end-to-end smoke suite for Vue 3             | QA           | 2024-10-20 | Pending |
| Document post-migration lessons learned (for retros) | DX           | 2024-12-13 | Pending |
