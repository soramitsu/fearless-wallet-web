# Firefox Extension Submission

This guide captures the current build artefacts, signing flow, and quality checks the team should follow before publishing Fearless Wallet to the Firefox Add-ons Marketplace (AMO).

## 1. Build and Package

- `yarn build:extension:firefox:zip` produces `dist/extension/firefox/fearless-wallet-extension-firefox.zip`.
- The bundle already includes the required WebAssembly modules (Cardano signing) thanks to the async WASM config in `vue.config.base.js`.
- If the CLI warns about stale Browserslist data, run `npx update-browserslist-db@latest` and rebuild.

## 2. Pre-Submission QA

- Load the unpacked directory via `about:debugging#/runtime/this-firefox` → **Load Temporary Add-on** to smoke-test onboarding, WalletConnect, Sora interactions, and background script connectivity.
- Verify storage-driven features after the latest hardening:
  - Hidden warning networks no longer duplicate entries.
  - Custom node lists reject malformed objects and ignore missing entries on delete.
- Inspect the console for WebAssembly load errors (`cardano_message_signing_bg.wasm` should initialise without warnings).

## 3. AMO Developer Console

1. Log in at <https://addons.mozilla.org/developers/> (2FA required).
2. Choose **Submit a New Add-on** → **On this site** and upload the generated ZIP.
3. Provide listing metadata (name, summary, detailed description, categories, privacy policy URL).
4. Upload the large icon (512×512) and at least one screenshot showing core functionality.
5. For private distribution, mark the add-on **Unlisted** to receive a signed XPI immediately. Select **Listed** when targeting the public store (review queue applies).

## 4. Optional CI Automation

- Once AMO API credentials are issued, integrate `web-ext sign` into the release pipeline:
  ```bash
  web-ext sign \
    --source-dir dist/extension/firefox \
    --artifacts-dir dist/extension/firefox-signed \
    --api-key "$AMO_JWT_ISSUER" \
    --api-secret "$AMO_JWT_SECRET"
  ```
- Store credentials as Jenkins secrets and trigger the signing stage only on tagged releases.

## 5. Post-Submission Checklist

- Download the signed XPI and smoke-test it again using `about:addons`.
- Tag the repository (e.g., `firefox-vX.Y.Z`) and update release notes/roadmap.
- Monitor the AMO dashboard for review feedback or user reports.
