# Sora Loader Guardrails

The extension lazily imports the `@sora` bundle to keep the background script lightweight. This section
documents the lifecycle guarantees we rely on when interacting with Sora utilities from the balance,
staking, and pools services.

## Initialization Path

- `getSoraUtil()` is the single entry point and always passes through `patchSoraModule`.
- `patchSoraModule` must be invoked before any consumer reads `api.poolXyk`; it injects the dynamic
  `PoolXykModule` constructor when the bundled exports diverge.
- Loading is idempotent: repeat calls return the cached module and never trigger additional network IO.
- The loader resets its internal promise if `import('@sora')` or `import('@sora/poolXyk')` rejects, so the
  next call retries cleanly instead of locking the app into a broken cache.

## Runtime Expectations

- Consumers **must** call `getSoraUtil()` or `getSoraApi()` before `getSoraUtilOrThrow()`; the guard throws
  when the module has not finished bootstrapping.
- The returned API exposes the FP number helpers shipped in `@/lib/fpNumber`. Keep conversions centralized
  so we can swap precision handling without touching every consumer.
- Background services are expected to read from the cached module; avoid retaining direct references to
  nested objects because the module may be patched on hot updates.

## Failure Handling

- Swallowing import errors hides connectivity regressions. Always log the error class and surface metrics
  so we know when lazy loading fails.
- When FP conversions fail, fall back to string inputs (`FPNumber.fromCodecValue`) to prevent `NaN` payloads
  being published to the UI.

## Action Items

- [x] Add metrics hook when `ensureSoraLoaded` throws within `TonBalance`. Emitted as
      `ton.balance.sora_loader.error` when lazy imports fail so cron dashboards capture failure context (`utility` or `jetton`).
- [x] Add unit coverage that stubs `import('@sora')` failures and asserts the guard behavior in
      `src/extension/background/extension-base/src/services/utils/sora.ts` (`tests/unit/soraUtils.spec.ts`).
