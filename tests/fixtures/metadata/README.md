# Runtime metadata snapshots

Gzipped SCALE runtime metadata (`state_getMetadata`) of the origin chains of the bundled cross-chain
executions, read from public RPC nodes on 2026-10-24. `tests/unit/cross-chain-golden-calls.spec.ts`
builds every bundled execution against these snapshots and compares the encoded call with golden
bytes, which were also produced by the live runtimes at the same spec versions.

| File | Chain | Spec | Read at block |
|---|---|---|---|
| `polkadot-2005000.scale.gz` | Polkadot | `polkadot` 2005000 | 33,571,298 (`0xbd45617bbf76f6661f37645234d9e4712628e61186170a1814e95b8c5c7a32ce`) |
| `kusama-2003002.scale.gz` | Kusama | `kusama` 2003002 | 35,800,502 (`0xacf2142bd34c71a36cf9d4fbd65aea008a330056945ce11f4386b07c5a91b370`) |
| `liberland-34.scale.gz` | Liberland | `Liberland` 34 | 18,541,237 (`0xbf99ace39bc53395fe50d207328c54ab2eb2ef5e69220b25a3871797ac20dc8e`) |

The blake2-256 hash of each decompressed snapshot is recorded as `metadataBlake2` in
`tests/fixtures/contracts/cross-chain-runtime-calls-v1.json`, next to the spec version and call
indices that `src/cross-chain/reviewedRuntimes.ts` pins.

To review a new runtime version: read its metadata at a recent block, add the snapshot, extend the
pinned spec range and call indices, refresh the runtime-calls fixture, dry-run the route on the live
runtime, and regenerate the golden bytes only after checking that the live runtime encodes the same
call.
