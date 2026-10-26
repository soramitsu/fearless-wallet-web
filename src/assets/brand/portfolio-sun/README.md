# Portfolio sun layers

`wings.svg`, `uraeus-left.svg`, `uraeus-right.svg` and `sun-disc.svg` are the approved `../winged-sun-colour.svg`
(`1002 x 206`, 55 paths) split **by path index**, so the portfolio sky can give each part its own depth:

| File | Master paths |
| --- | --- |
| `wings.svg` | 0 to 8 |
| `uraeus-left.svg` | 9 to 29 |
| `uraeus-right.svg` | 30 to 50 |
| `sun-disc.svg` | 51 to 54 |

No geometry or colour is edited, and every layer keeps the master's `viewBox`, so stacking them reproduces the master
exactly. `tests/unit/portfolio-dashboard-sun-layers.spec.ts` keeps it so: the layers concatenated equal the master's
paths byte for byte. The master itself stays unmodified; its hash is in `docs/release/brand-asset-provenance.json`.
The layers are used only by the portfolio dashboard (`src/screens/portfolio/PortfolioSky.vue`) and are not part of a
production build.

The sky draws `wings.svg` inline so the wings can run off the hero card's edges: from 160 units out from the disc
centre (the cobras end at 151) each wing stretches sideways until its tip runs off its own edge (`wingsLayer` in
`src/portfolio/dashboard/skyGeometry.ts`). The file is not edited, and the sun, the cobras and the inner wing are drawn
exactly as the master.
