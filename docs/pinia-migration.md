# Pinia Migration Overview

Fearless Web now ships with Pinia as the unified state layer for the Vue 3
rewrite. Historical commits still contain Vuex modules; this note captures the
path we took and the remaining follow-ups to keep the migration manageable.

## Current Status

- Pinia stores live in `src/stores/**` and are exported via the `./index.ts`
  barrel. Each store exposes both the `useXStore` hook and its `ReturnType`
  alias for typed consumption.
- Legacy Vuex entry points (`src/store/index.ts`, module-level `actions.ts`,
  `state.ts`, etc.) have been removed. Older imports such as `@/store` should
  now reference `@/stores`.
- Unit tests rely on `tests/unit/utils/mountWithApp.ts` to bootstrap Pinia in a
  sandboxed way. Use the optional `{ pinia }` override to seed store state
  inside specs.

## What Remains

1. **Documentation & Conventions**
   - [x] Flesh out examples for common store patterns (derived state,
         composition-api helpers) once the final store surface stabilises.
   - [x] Describe how to migrate extension background services that still pull
         from Vuex-shaped message payloads.

2. **Runtime Touchpoints**
   - [x] Audit `@extension-base` background messaging; some handlers continue to
         emit Vuex-style payloads where Pinia expects updated typings.
   - [x] During the liquidity proxy/type definition upgrade, double-check that
         no ad-hoc store mutations bypass Pinia’s `patch` helpers.

3. **Tooling**
   - [x] Update lint rules to prefer the `defineStore` factory for new modules
         and flag direct state mutation outside store instances.
   - [x] Add a dedicated FAQ entry for working with the `installStores` helper
         introduced in the bootstrap refactor.

## Store Patterns & Recipes

### Derived + computed helpers

Pinia stores stay in Composition API land. Keep idiomatic derived state close to
the source store by combining `state`, `getters`, and Composition API helpers:

```ts
// src/stores/accounts/index.ts
export const useAccountsStore = defineStore('accounts', () => {
  const assets = ref<Record<string, BalanceEntry>>({});
  const selectedAccountId = ref<string | null>(null);

  const hasBalances = computed(() => Object.keys(assets.value).length > 0);
  const activeBalances = computed(() => {
    if (!selectedAccountId.value) return [];
    return assets.value[selectedAccountId.value] ?? [];
  });

  function setAccountBalances(id: string, balances: BalanceEntry[]) {
    assets.value[id] = balances;
  }

  return {
    assets,
    selectedAccountId,
    hasBalances,
    activeBalances,
    setAccountBalances,
  };
});
```

When derived state needs data from other stores, keep the dependency explicit:

```ts
const networksStore = useNetworksStore();
const selectedNetwork = computed(() => networksStore.byKey(accountNetworkKey.value));
```

This mirrors how `src/stores/networks/index.ts` exposes grouped metadata without
sprinkling watchers across components.

### Composition helpers

Pinia encourages colocating business logic with the store. Wrap repetitive
composition patterns as helpers so screens remain lean:

```ts
export const useActiveAccount = () => {
  const accountsStore = useAccountsStore();

  const activeAccount = computed(() => {
    return accountsStore.items.find(({ id }) => id === accountsStore.selectedAccountId);
  });

  return {
    activeAccount,
    setActiveAccount: accountsStore.select,
  };
};
```

`src/composables/useWalletHydration.ts` and friends follow this approach so
screens import a single helper instead of juggling multiple stores.

## Background Messaging & Pinia payloads

Legacy Vuex payloads flowed through `@extension-base/background/handlers/**` and
assumed `{ state, getters }` signatures. The background refactor replaces those
messages with typed contracts under `src/extension/messaging/**`. Each handler
now publishes plain DTOs that Pinia stores can consume via actions:

1. Define a typed payload (e.g., `src/extension/messaging/history.ts`).
2. Update the background handler (`Extension.ts`, `State.ts`, etc.) to emit the
   DTO instead of a Vuex-specific shape.
3. Inside the UI, add an action such as `useHistoryStore().ingest(payload)` that
   calls `$patch` with the typed data.

`src/stores/setup.ts` wires Pinia once during bootstrap, so background events no
longer reach into a singleton Vuex store. Follow the same pattern when touching
pool, balance, or staking feeds.

## Liquidity Proxy & Mutation Guardrails

`src/sora/liquidityProxy/**` and balance helpers were notorious for mutating
store state directly. During the type-definition refresh we audited every call
site and replaced `store.state.foo = bar` style mutations with action+`$patch`
sequences (see `src/helpers/balances.ts` and `src/stores/pools/index.ts`). This
also means background helpers never share reactive references that Pinia might
overwrite later.

To keep the guardrails in place, ESLint now rejects `@/store` imports and
direct `$state` mutations (see `eslint.config.mjs`). If a utility needs to tweak
state, expose an action on the relevant store and call it instead.

## Tooling & installStores FAQ

The bootstrap now runs through `installStores` (`src/stores/setup.ts`). Use it in
two places:

- **App bootstrap** – `createFearlessApp` calls `installStores(app)` once so all
  plugins share the same Pinia instance.
- **Tests** – `initTestingStores()`/`createTestingStores()` mirror the runtime
  wiring; specs can call them to obtain an isolated Pinia instance.

Frequently asked questions:

- _How do I hydrate stores in tests?_ Use `const pinia = initTestingStores()` and
  pass it to `mountWithApp({ pinia })`; avoid mocking store modules.
- _Can I mutate `$state`?_ No. Use actions or `$patch`. ESLint enforces this via
  the `no-restricted-syntax` rule we added.
- _Where do I import stores from?_ Always from `@/stores`. The old `@/store`
  entry point is lint-blocked and will fail CI.

Tracking these items here keeps the Pinia migration transparent; the roadmap
links to this note so contributors can see what’s finished and where help is
still needed.
