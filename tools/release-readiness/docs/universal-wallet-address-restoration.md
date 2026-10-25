# Universal Wallet mnemonic restoration

The web, iOS, and Android clients use the same public 12-word and 24-word
reference mnemonics in `universal-wallet-v2-vectors.json`. The regression suites
compare derived addresses to those reference values, rather than accepting an
address merely because two calls produce the same result.

The compatibility contract is the **same mnemonic, account derivation path,
cryptography, and network**. Substrate comparisons use Polkadot's SS58 prefix 0.
EVM comparisons identify the same 20-byte account; checksum capitalization may
differ between clients. Bitcoin comparisons cover the first BIP84 receive
address. TON vectors cover the Universal Wallet BIP39-derived v4r2 account, not
independently imported native TON wallets. Custom paths and separately imported
keys are outside this default-wallet contract.

## Restore coverage

| Account | Web | iOS | Android |
| --- | --- | --- | --- |
| Substrate sr25519 and EVM | Real import form and keyring | Real mnemonic import and key store readback | Real mnemonic import and native cryptography |
| Bitcoin mainnet | Import inventory | Import account row | Account upgrade |
| Bitcoin testnet | Import inventory | Import and legacy account enrollment | Automatic account enrollment |
| Solana | Import inventory | Import and legacy account enrollment | Account upgrade |
| Universal Wallet TON | Import inventory | Import and legacy account enrollment; root signer | Durable missing-root enrollment; stored-key signer |
| Taira | Import inventory and account address display | Import account row and address display | Account upgrade and address display |
| Nexus | Offline account address display | Offline account address display | Offline account address display |

The mobile restoration regressions now exercise automatic enrollment for TON
and Bitcoin testnet, and Solana on iOS. Existing native TON wallets and dedicated
network accounts keep their keys. iOS also tests stored-seed adoption and
catalog-independent address copying. Android observes wallet and catalog changes
so newly imported wallets enroll without restarting; its durable TON mutation
checks existing secret slots and dedicated account aliases before staging and
replay. Bitcoin testnet catalog fallback rows contain no assets or endpoints and
retain existing aliases to avoid cascading deletion of independent keys.

Taira and Nexus use the same default Ed25519 public key from
`m/44'/617'/0'/0'`, with different network address encodings. A Taira address
therefore differs from a Nexus address, while each network's address agrees
across clients. Nexus address creation/copy is local; the tests do not activate
its production network. Taira remains an enabled testnet.

## Running the checks

From the workspace root, verify that no client's fixture has drifted:

```sh
node scripts/verify-universal-wallet-vectors.mjs
node --test scripts/test-universal-wallet-vectors.mjs
```

The first command requires all three application checkouts. The second uses
synthetic fixture files to test the parity guard and runs in control-plane CI.
It rejects a missing client, a changed fixture, missing seed-length coverage,
and omission of Nexus. Client cryptographic tests must also run; fixture equality
alone cannot establish correct derivation.

Web, from `fearless-wallet-web`, using the Node version pinned in `.nvmrc`:

```sh
node node_modules/vitest/vitest.mjs run --exclude 'build/**' \
  tests/unit/universal-wallet-mnemonic-restore.spec.ts \
  tests/unit/universal-wallet-v2-vectors.spec.ts \
  tests/unit/universal-wallet-keyring-fields.spec.ts \
  tests/unit/universal-wallet-keyring-meta.spec.ts \
  tests/unit/bitcoin-keyring.spec.ts tests/unit/solana-keyring.spec.ts \
  tests/unit/ton-keyring.spec.ts tests/unit/iroha-keyring.spec.ts \
  tests/unit/iroha-offline-accounts.spec.ts
```

The web restore test mounts `AddWallet`, uses the actual default import paths
and `@subwallet/keyring` cryptography, and compares the resulting public
inventory and displayed Iroha addresses. Only extension transport/storage is
replaced. A second empty keyring simulates another installation; no reference
public keys are injected into either restore.

iOS uses `UniversalWalletV2VectorsTests` and
`UniversalWalletAccountAddressResolverTests` in the `fearless.tests` scheme.
The new cases import each phrase into two separate key stores through
`MetaAccountOperationFactory`, persist and reload the account model, read back
the root mnemonic, resolve the resulting account addresses, and verify the TON
signing identity. Use the
repository's pinned package setup and an available iOS simulator.

Android requires a device or emulator for the production sr25519 JNI provider;
JVM helper tests alone do not establish native Substrate restore compatibility.
Use the pinned local dependency paths from `scripts/setup-workspace.mjs --env`
before running Gradle.

From `fearless-Android`, with `ANDROID_SERIAL` set to an available emulator:

```sh
./gradlew :feature-account-impl:connectedDebugAndroidTest \
  -Pandroid.testInstrumentationRunnerArguments.class=jp.co.soramitsu.account.impl.data.repository.UniversalWalletMnemonicRestoreDeviceTest \
  :common:testDebugUnitTest \
  --tests '*UniversalWalletV2VectorsTest' --tests '*BitcoinKeyDerivationTest' \
  --tests '*SolanaKeyDerivationTest' --tests '*TonKeyDerivationTest' \
  --tests '*IrohaKeyDerivationTest' --console=plain

./gradlew :feature-account-impl:testDebugUnitTest \
  :common:testDebugUnitTest --tests '*WalletRootSecret*Test' \
  --tests '*WalletSecretMutationJournalStoreTest' --tests '*TonKeyDerivationTest' \
  :runtime:testDebugUnitTest --tests '*BitcoinTestnetAccountChainTest' \
  --tests '*ChainSyncServiceTest' \
  :feature-wallet-impl:testDebugUnitTest --tests '*OptionsWalletViewModelTest'
```

The Android device test uses `SubstrateOrEvmAccountRepository`, the real wallet
mutation coordinator, an isolated Room database, validated secret readback, and
`LegacyNetworkAccountUpgrade`. Preference IO is replaced by an in-memory store.
Both imports begin with empty storage; the test also checks that repeating the
account upgrade preserves all resulting addresses. Both TON and Bitcoin testnet
are included in the persisted inventory, and the production TON keypair provider
signs an offline challenge with the restored key. Coordinator tests exercise
interrupted writes, concurrent dedicated accounts, native TON preservation, and
exact key binding; observer tests cover imports and catalog arrivals without a
restart.

## Verification on 2026-10-13

- All three fixtures were byte-identical, SHA-256
  `3b6ea60c00eae541c6dc05617b295acf8fc3ad1e097274a6c0dad5c15fbfdbc6`.
- Web: 846 unit tests passed across 148 files on Node 24.19.0, including both
  new restore cases. Type checking and lint for the new test/configuration passed.
- iOS: 249 simulator tests passed after closing the automatic enrollment gaps,
  including both cold-restore cases and preservation regressions.
- Android: 444 JVM regressions passed (367 account, 61 shared key/storage,
  13 catalog/runtime, and 3 wallet-options tests). Both native API 34 restore
  tests passed, covering TON signing and Bitcoin testnet account enrollment. The
  earlier shared-vector/derivation suites passed 22 tests. App compilation and
  default Detekt pass; forced analysis introduces no findings compared with the
  existing source baseline.
- The cross-repository fixture guard passed its 7 regression cases.

No derivation paths, cryptographic algorithms, golden expected addresses, or
network activation flags were changed. Native TON import retains its existing
derivation; universal TON enrollment uses the existing BIP39 derivation. These
checks do not qualify production broadcasts or device backup transport.
