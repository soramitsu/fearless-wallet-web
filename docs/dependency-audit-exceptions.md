# Dependency audit exceptions

## `image-size` advisories 1138808 and 1138809

Status: temporary development-tool exception; review on every release.

The full dependency audit ignores npm advisory IDs `1138808`
(`GHSA-w3rx-r6r6-pgpr`) and `1138809` (`GHSA-5p2g-fcmc-qvqq`). Both affect
`image-size@2.0.2`, which is an exact transitive dependency of
`addons-linter@10.10.0` through the development-only `web-ext@10.6.0` tool.
The package is not in the production dependency audit or the Chrome extension
runtime artifact.

As of 2026-08-23, npm publishes no version newer than `2.0.2` and both reviewed
GitHub advisories list no patched version. The vulnerable ICNS/JXL/HEIF parser
paths can hang on crafted image buffers. Pull-request CI necessarily runs
`web-ext` against PR-controlled extension assets, so this input is not trusted.
The wrapper strips `WEB_EXT_*`, `NODE_OPTIONS`, and `NODE_PATH`, disables config
discovery, limits output, and terminates lint after 120 seconds; the entire CI
job also has a 30-minute limit. Do not expose this command as a service for
arbitrary extensions or run it outside those resource bounds.

The production audit remains unignored and must be clean:

```sh
yarn audit:dependencies:production
```

Remove both ignores as soon as `addons-linter` consumes a patched
`image-size`, or replace the tooling if upstream does not publish a fix. Do not
extend this exception to any production dependency.

References:

- <https://github.com/advisories/GHSA-w3rx-r6r6-pgpr>
- <https://github.com/advisories/GHSA-5p2g-fcmc-qvqq>
