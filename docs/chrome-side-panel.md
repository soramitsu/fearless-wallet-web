# Chrome side panel

The toolbar button opens Fearless in Chrome's side panel, as current MetaMask does. The 561 x 600 popup left little
room for the wallet under the header and notices; the panel is as tall as the browser. Settings > Preferences >
Switch to popup goes back to the popup, and Switch to side panel returns.

## How the toolbar decides

`src/extension/toolbarSurface.ts`, registered with the worker's other wake listeners. Two values in
`chrome.storage.local` give one of three modes:

| `fearless:toolbar-surface` | `fearless:side-panel-status` | Mode | Toolbar |
| --- | --- | --- | --- |
| `popup` | any | popup | action popup set |
| any | `unavailable` | popup | action popup set |
| unset or `side-panel` | `working` | side-panel | no popup; Chrome toggles the panel (`openPanelOnActionClick`) |
| unset or `side-panel` | unset | probe | no popup and no panel behaviour |

In probe mode, the first click after this update, the click reaches `action.onClicked`. The worker opens the panel
synchronously, while the click still counts as a user gesture. The panel page records `working` as it starts, which
switches the toolbar to Chrome's own toggle. If the panel cannot open, or its page has not reported within 10 s, the
worker records `unavailable`, sets the popup and opens it (a popup window where `action.openPopup` is missing, before
Chrome 127). Some Chromium browsers (Arc and Vivaldi have been reported) expose the API without showing a panel; there
the button falls back to the popup instead of doing nothing. Clicks while a check runs share it, so the popup opens
once. An open panel records `working` again if a check that timed out as it loaded wrote `unavailable`.

Switch to side panel opens the panel in the current window from the click and switches the toolbar only once Chrome
lists the panel's page (`runtime.getContexts`); otherwise it says this browser cannot show the panel and keeps the
popup. Switch to popup stores the choice, opens the popup in the panel's place and closes the panel.

The manifest keeps `action.default_popup`, so a browser without `chrome.sidePanel` and a worker that has not run yet
both open the popup. Firefox has no side panel: its manifest, package and behaviour are unchanged.

## The panel page

`sidepanel.html` loads the popup's bundle and marks `<html data-fw-surface="side-panel">` (`IS_SIDE_PANEL`). The panel
uses the popup's layout (`IS_POPUP`) at any width, in the same column of at most 561px, and keeps the popup's expand
button and site connection dot. Expanding opens the full tab and leaves the panel open. The
dot follows the active tab, because the panel stays open while the person browses. Session expiry (4.2.1) locks the
wallet and clears open pages, the panel included.

dApp requests still open their own approval window. Like a full tab, an open panel also shows the request.

## Release

- `sidePanel` carries no install warning, so the update does not disable the extension. The Chrome Web Store
  dashboard asks for a justification: "Opens the wallet in Chrome's side panel when the toolbar button is clicked."
- The Chrome release audit requires `side_panel.default_path` to be `sidepanel.html`, the `sidePanel` permission, and
  `sidepanel.html` to be `popup.html` byte for byte apart from the side panel mark, so it loads nothing the popup does
  not.

## Checks

- Unit: `tests/unit/toolbar-surface.spec.ts`, `settings-toolbar-surface.spec.ts`, `side-panel-page.spec.ts`,
  `manifest.spec.ts`.
- Real Chrome: `node scripts/solana-extension-smoke.mjs --side-panel-screenshots <dir>` on a test build. It clicks
  the toolbar through `Extensions.triggerAction` (pipe transport), checks every mode change, both switches and the
  expand button in the real panel, then runs the portfolio tour on the panel page. `SIDE_PANEL_SMOKE_WIDTH=320` runs
  the tour at the narrowest panel. A panel or full tab wider than 600px still fails the tour on the By network rows:
  `PortfolioNetworkSection.vue` switches to its compact layout by viewport width, while the extension's column stays
  561px wide.
