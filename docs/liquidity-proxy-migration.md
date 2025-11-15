# Liquidity Proxy Migration Notes

The upcoming util v1.33 upgrade requires changes across the Sora liquidity
proxy utilities. This document captures remaining cleanup items so we can
track them alongside the roadmap entry.

## Outstanding Tasks

1. **Type Definitions**
   - Audit `src/sora/liquidityProxy/types.ts` for legacy shorthand aliases
     (e.g., `AnyAsset`); replace them with the concrete codec types introduced
     in util v1.33.
   - Ensure all exported types are re-exported from the package barrel so dApps
     embedding the liquidity proxy can rely on them.

2. **Runtime Helpers**
   - `src/sora/liquidityProxy/utils.ts` still casts several codec responses to
     `any`. Swap these to the new typed helpers once the upgrade lands.
   - Add regression tests around the price route builder to guard against the
     widened asset metadata in v1.33.

3. **Docs & Changelog**
   - Update this document once util v1.33 is integrated. Include a summary of
     breaking changes so downstream consumers know what to expect.
   - Capture any new helper patterns in the component/test harness docs if they
     affect the UI layer.

## Status Tracking

- Roadmap item: “Document the Pinia vs. Vuex transition plan and capture
  liquidity proxy/type-def TODOs…” (marked complete after this doc was added).
- Upgrading util v1.33 remains in the “Later” bucket; when work starts, use this
  checklist to drive PR scope and review comments.

Keep this file updated as the upgrade progresses so we avoid rediscovering the
same gaps mid-release.
