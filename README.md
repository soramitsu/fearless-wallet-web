# fearless-wallet-web

Soramitsu-owned code, including the browser wallet, website, release tools, and
local compatibility shims, is licensed under the [Apache License 2.0](LICENSE).
Third-party components retain their original licenses and attribution; see
[NOTICE](NOTICE), the component license files, and the font notices bundled
with release builds. The license does not grant trademark rights.

## Project setup
Requires Node 24 (`.nvmrc`: `24.19.0`) and Yarn 4.17.0 through Corepack; see
[CONTRIBUTING.md](CONTRIBUTING.md#toolchain) for the Homebrew `node@24` setup.
```
corepack enable
yarn install --immutable
```

### Compiles and hot-reloads for development
```
yarn serve
```

### Compiles and minifies for production
```
yarn build
```
### Build extension
```
yarn build:extension
```
###  Build extension in watch mode
```
yarn build-watch:extension
```
### Run your unit tests
```
yarn test:unit
```

### Run your end-to-end tests
```
yarn test:e2e
```

### Lints and fixes files
```
yarn lint
```
### Customize configuration
See [Configuration Reference](https://cli.vuejs.org/config/).
