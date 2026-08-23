# Iroha JS 0.0.3 candidate evidence

This directory preserves the exact unpublished local candidate recorded on
2026-07-12. It is evidence, not a production dependency or release artifact.

- Source base: `b423c0f8bcd317fd945d6f66ce3fa679401dba7f`
- Source base tree: `f5e47336c7ba64f43e629636fd0b0b31ca39a22e`
- Bounded replay archive SHA-256: `cb2931de7df8fd62e5580f4734f10f47ca33fa47d03f9264cc2c4cd9ea58484c`
- Replay inventory SHA-256: `949e4b1f101cc47ebcd37f933784bffa183224262c94200708c1fcf237bf61d4`
- Patch SHA-256: `b50de5592570e96f9d48374ed39d55cb4a4cc8298e99fc0657e698d3e4c81049`
- Tar SHA-256: `15c3eabb845b5fbde419035df9085d3db6ea8fea452d77aa328d73a334ccdea8`
- Publication/review: absent
- Production dependency/source integration: absent
- Real Safari evidence at candidate freeze: 0 scenarios / 0 assertions
- Post-freeze native Safari 26.5.2 evidence: 6 scenarios / 91 assertions / 0 failures

The bounded base-source archive contains the exact `b423c0f8` files needed to
apply every one of the 32 patch paths and repack `javascript/iroha_js`. It is
2,412,361 bytes compressed, 15,319,040 bytes expanded, and has an exact
305-entry inventory (285 regular files and 20 directories). It deliberately
excludes tracked `javascript/iroha_js/node_modules` and is not a copy of the
full repository; `baseRepositoryBundled` and `offlineFullSourceReplayable`
therefore remain false. Candidate replay and byte-identical repacking are fully
offline and require no Iroha checkout or Git/network access.

The package tar contains a generated 134-byte Darwin arm64 native checksum
sidecar while intentionally containing no `.node` addon. The patch deletes the
formerly tracked sidecar; exact repacking therefore restores the stored sidecar
from the stored tar before running `npm pack --ignore-scripts`. That proves the
durable evidence is internally reproducible without pretending the generated
native addon is part of the browser package.

Run the offline integrity and package-surface verification:

```sh
bash scripts/verify-iroha-js-candidate.sh
```

Run the replayable native Safari QA without enabling WebDriver or Apple-event
JavaScript, then verify the stored evidence:

```sh
bash scripts/test-iroha-js-candidate-safari-qa.sh
bash scripts/run-iroha-js-candidate-safari-qa.sh
node scripts/verify-iroha-js-candidate-safari-qa-evidence.mjs
```

The immutable candidate manifest retains its truthful 0/0 freeze-time Safari
snapshot. The separate post-freeze evidence is stored under
`artifacts/iroha-js-candidate-safari-qa/15c3eabb845b5fbde419035df9085d3db6ea8fea452d77aa328d73a334ccdea8/`
and binds the exact tar without rewriting that historical manifest.

Run exact source replay and byte-identical repacking in a disposable directory:

```sh
bash scripts/verify-iroha-js-candidate.sh --replay-source
```

The dedicated parser checks compressed and expanded bounds, POSIX tar header
checksums, exact commit/tree metadata, exact entry inventory, normalized paths,
and forbids links, special files, duplicates, and extraction escapes before it
writes any file. The reconstructed 285-file subset tree is pinned as
`04fbf3b60512c7daf734d3f72c6a60ceb79316af`. Production remains blocked until
the artifact is independently reviewed, published immutably, checksum-pinned
as the actual dependency, integrated without the test-only global seam, and
backed by the documented live network evidence. Native Safari QA is now
separately green.
