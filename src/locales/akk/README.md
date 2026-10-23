# Old Akkadian locale

`translation.json` is a complete, one-for-one localization of the English
message tree. The locale tag is `akk-Latn-x-old`: `akk` identifies Akkadian,
`Latn` identifies scholarly Latin transliteration, and the private `old`
subtag distinguishes this deliberately Old Akkadian register.

## Philological policy

- Grammar and spellings follow normalized Old Akkadian rather than later
  Neo-Assyrian or Neo-Babylonian usage.
- Vocabulary is checked first against I. J. Gelb's
  [_Old Akkadian Writing and Grammar_](https://isac.uchicago.edu/research/publications/mad/mad-2-old-akkadian-writing-and-grammar)
  (MAD 2) and
  [_Glossary of Old Akkadian_](https://isac.uchicago.edu/research/publications/mad/mad-3-glossary-old-akkadian)
  (MAD 3), both published by the University of Chicago's Institute for the
  Study of Ancient Cultures.
- Proper names, protocol names, and data-format identifiers remain unchanged.
  They are names, not untranslated explanatory prose.
- Runtime-authored market titles, categories, descriptions, and oracle sources
  remain authored content. The wallet translates their surrounding controls,
  statuses, outcomes, warnings, and failure states without inventing a meaning
  for arbitrary external text.
- A modern concept with no ancient equivalent is rendered as a transparent
  semantic compound. It is not represented as though the unattested modern
  sense occurred in an ancient text.

The main semantic compounds are intentionally stable:

| Modern concept | Old Akkadian rendering | Literal image         |
| -------------- | ---------------------- | --------------------- |
| wallet         | `kīsum`                | purse or money-bag    |
| password       | `awāt pirištim`        | word of secrecy       |
| recovery phrase| `awāt ḫasāsim`         | word of remembrance   |
| account        | `ṭuppum ša šumim`      | tablet of a name      |
| network        | `riksum`               | bond or joined web    |
| blockchain     | `riksāt ṭuppī`         | bonds of tablets      |
| asset          | `makkūrum`             | entrusted property    |
| validator/node | `nāṣirum` / `maṣṣarum` | guardian / guard      |
| liquidity      | `mê kaspim`            | waters of silver      |
| pool           | `būrum ša makkūrī`     | well of property      |
| staking        | `šakān makkūrim`       | placing property      |
| private key    | `namzāqum ša pirištim` | secret opening-key    |
| portfolio      | `puḫur makkūrī`         | assembly of property  |
| DeFi farming   | `erēš makkūrī`          | cultivation of property |
| prediction market | `maḫīrum ša bārûtim` | market of divination  |
| cross-chain route | `ḫarrānum ina birīt riksāt ṭuppī` | road between bonds of tablets |
| indexer        | `ṭupšarrum`             | scribe                |
| synchronization | `uddūšum`              | renewal               |

This is a functional literary localization in normalized transliteration, not
a cuneiform transcription. Concepts such as apps, URLs, metadata, NFTs,
staking, and cross-chain routing are necessarily modern calques; their
wording aims to preserve the product meaning through ancient imagery.

## Integrity checks

`tests/unit/akkadian-locale.spec.ts` requires exact key coverage, placeholder
and plural-branch parity, preserved numeric literals, normalized Unicode, and
an explicit allowlist for proper names that legitimately remain unchanged.
