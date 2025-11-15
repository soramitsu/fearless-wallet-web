# Storage Hardening Notes

Recent changes introduce shared sanitisation helpers for every localStorage-backed map inside `accountController`, pulled into `src/util/storage.ts`. Sora account history, asset address lists, and the web keyring now also parse JSON defensively. The following storage layers remain on the roadmap:

- `LocalStorage.clear` now iterates pre-collected keys, but other classes that wrap the Web Storage API should follow the same pattern.
- `src/sora/storage.ts` filters namespaced keys and returns only non-null values, yet any consumer parsing JSON from `Storage#get` should continue to guard `JSON.parse` with `try/catch`.
- Chrome/Firefox store adapters (`BaseExtensionStore`, `StorageExtension`, `StorageWeb`) currently surface raw objects from `chrome.storage.local`/IndexedDB. `BaseExtensionStore` strips null/undefined entries, `StorageExtension` clears malformed values, and `StorageWeb` now removes invalid IndexedDB payloads. Schema validation (e.g. zod/io-ts) remains a good follow-up for all three.
- `KeyringStoreWeb` now wraps `JSON.parse` in a try/catch and falls back to an empty payload, but the extension `KeyringStore` still trusts the raw Chrome storage map. Consider mirroring the same defensive parsing the next time that code is touched.

Next incremental steps:

1. Apply schema validation or TypeScript guards when hydrating Chrome/IndexedDB objects (`BaseExtensionStore` consumers, `StorageWeb`).
2. Introduce regression tests around the shared storage helpers, Sora account history parsing, BaseExtensionStore/StorageExtension sanitisation, and the WalletConnect `safeParseJson` fallback.
3. Add schema validation to Chrome/IndexedDB storage results, then audit the remaining `JSON.parse` call sites (bridge metadata caches, NFT service, etc.) to adopt the `safeParseJson` pattern wherever reasonable.
