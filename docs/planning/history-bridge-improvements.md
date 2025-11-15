# History & Bridge Improvements — Completion Notes

Updated: 2024-10-07  
Owner: Runtime Core (Maria Petrova)

## Scope Summary

1. **History fetching de-duplication** – enforce per-asset endpoints and typed responses so UI/background pull the same structures.
2. **Background parsing & worker isolation** – move heavy history/bridge parsing to the background worker, add stricter payload guards.
3. **Bridge validation** – validate MST weights/public keys at submission time and return actionable errors to the UI.
4. **Metadata parity** – align Sora bridge metadata with the latest type definitions and add regression coverage.

## Delivered Work

| Area                   | Highlights                                                                                                                          | References                                                                                                                                      |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Typed history fetchers | `src/history/fetchingHistory.ts` + `src/stores/networks/actions.ts` request per asset and normalize responses before storing.       | `src/history/fetchingHistory.ts`, `src/stores/networks/actions.ts`                                                                              |
| Background parsing     | PostMessage provider routes history/bridge payloads through background handlers; parsing + validation happen outside the UI thread. | `src/extension/background/extension-base/src/page/PostMessageProvider.ts`, `src/extension/background/extension-base/src/background/handlers/**` |
| MST validation         | Bridge service validates weights/public keys, bubbling clear errors to the UI (no silent failures).                                 | `src/extension/background/extension-base/src/api/substrate/sora/bridge.ts`, `src/sora/mstTransfers/index.ts`                                    |
| Metadata sync          | Updated Sora bridge type definitions + metadata bundles, plus new regression coverage in bridge proxy unit tests.                   | `src/sora/typeDefinitions/**`, `tests/unit/bridgeProxy*.spec.ts`                                                                                |

## Verification

- Unit tests for bridge proxies, history service, and MST transfers cover new validation paths.
- Manual QA confirmed worker-side parsing reduces UI thread work and resolves the previously reported payload crashes.

## Follow-ups

- Future work: integrate telemetry hooks for bridge submissions and history fetch failures once shared telemetry pipeline lands.
