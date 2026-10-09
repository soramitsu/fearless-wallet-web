# Old Akkadian cuneiform locale

`translation.json` is a complete, one-for-one localization of the English
message tree, written in Unicode cuneiform. The locale tag is
`akk-Xsux-x-old`: `akk` identifies Akkadian, `Xsux` identifies the
Sumero-Akkadian cuneiform script, and the private `old` subtag distinguishes
this deliberately Old Akkadian register. The language selector names it
`𒀝𒅗𒁺𒌑𒌝 𒆷𒁉𒊒𒌝 · Akkadûm labīrum`, keeping the transliteration beside the
signs so the option stays findable for readers who do not read cuneiform.

Earlier builds stored this locale as `akk-Latn-x-old` (normalized Latin
transliteration). `accountController.getLang()` resolves that retired tag to
`akk-Xsux-x-old` and saves the new tag, so a user who chose Old Akkadian keeps
it after upgrading instead of being reset to English.

## Philological policy

- Grammar and spellings follow normalized Old Akkadian rather than later
  Neo-Assyrian or Neo-Babylonian usage.
- Vocabulary is checked first against I. J. Gelb's
  [_Old Akkadian Writing and Grammar_](https://isac.uchicago.edu/research/publications/mad/mad-2-old-akkadian-writing-and-grammar)
  (MAD 2) and
  [_Glossary of Old Akkadian_](https://isac.uchicago.edu/research/publications/mad/mad-3-glossary-old-akkadian)
  (MAD 3), both published by the University of Chicago's Institute for the
  Study of Ancient Cultures.
- Proper names, protocol names, and data-format identifiers remain unchanged
  in Latin script (Fearless Wallet, Polkaswap, SORA, Google Drive, JSON, URL,
  and so on). They are names, not untranslated explanatory prose.
- Runtime-authored market titles, categories, descriptions, and oracle sources
  remain authored content. The wallet translates their surrounding controls,
  statuses, outcomes, warnings, and failure states without inventing a meaning
  for arbitrary external text.
- A modern concept with no ancient equivalent is rendered as a transparent
  semantic compound. It is not represented as though the unattested modern
  sense occurred in an ancient text, and English words are never spelled out
  phonetically in cuneiform.

## Script and orthography

Every Akkadian word is written in signs from the Unicode Cuneiform blocks
(`U+12000–U+1254F`). The spelling follows one fixed policy so that a word
always looks the same wherever it appears:

- purely syllabic spelling with Old Akkadian / Old Babylonian sign values (V,
  CV, VC, CVC); no logograms or determinatives;
- mimation is written; geminated consonants are written VC-CV
  (`makkūrum` → `ma-ak-ku-ru-um`);
- macron long vowels are not written plene; circumflex contracted vowels are
  (`bašû` → `ba-šu-ú`);
- each phonetic syllable is always written with the same sign (for example
  `ši` with IGI, `wa` with PI, `ṭu` with TU), and aleph with the ALEPH
  sign 𒀪.

Two modern digital conventions keep the interface readable: words are
separated by spaces, and modern punctuation, digits, and interpolation markers
stay as they are. Text runs left to right. The strings do not claim to
reproduce the sign forms, ligatures, or line layout of a particular tablet.

The app bundles Noto Sans Cuneiform (`@fontsource/noto-sans-cuneiform`, SIL
Open Font License 1.1) next to Noto Sans Egyptian Hieroglyphs and places it in
the global and onboarding fallback stacks, so the signs render without a
cuneiform font installed on the user's system. Every sign the locale uses lies
inside the font's published `unicode-range`.

## Stable semantic compounds

| Modern concept | Cuneiform | Transliteration | Sign reading | Literal image |
| -------------- | --------- | --------------- | ------------ | ------------- |
| wallet | 𒆠𒋢𒌝 | `kīsum` | `ki-su-um` | purse or money-bag |
| password | 𒀀𒉿𒀜 𒉿𒊑𒅖𒋾𒅎 | `awāt pirištim` | `a-wa-at pi-ri-iš-ti-im` | word of secrecy |
| recovery phrase | 𒀀𒉿𒀜 𒄩𒊓𒋛𒅎 | `awāt ḫasāsim` | `a-wa-at ḫa-sa-si-im` | word of remembrance |
| account | 𒌅𒌒𒁍𒌝 𒊭 𒋗𒈪𒅎 | `ṭuppum ša šumim` | `ṭu-up-pú-um ša šu-mi-im` | tablet of a name |
| network | 𒊑𒅅𒋢𒌝 | `riksum` | `ri-ik-su-um` | bond or joined web |
| blockchain | 𒊑𒅅𒊓𒀜 𒌅𒌒𒉿 | `riksāt ṭuppī` | `ri-ik-sa-at ṭu-up-pi` | bonds of tablets |
| asset | 𒈠𒀝𒆪𒊒𒌝 | `makkūrum` | `ma-ak-ku-ru-um` | entrusted property |
| validator / node | 𒈾𒍣𒊒𒌝 / 𒈠𒊍𒍝𒊒𒌝 | `nāṣirum / maṣṣarum` | `na-ṣí-ru-um / ma-aṣ-ṣa-ru-um` | guardian / guard |
| liquidity | 𒈨𒂊 𒅗𒊍𒉿𒅎 | `mê kaspim` | `me-e ka-as-pi-im` | waters of silver |
| pool | 𒁍𒊒𒌝 𒊭 𒈠𒀝𒆪𒊑 | `būrum ša makkūrī` | `bu-ru-um ša ma-ak-ku-ri` | well of property |
| staking | 𒊭𒅗𒀭 𒈠𒀝𒆪𒊑𒅎 | `šakān makkūrim` | `ša-ka-an ma-ak-ku-ri-im` | placing property |
| private key | 𒈾𒄠𒍝𒆪𒌝 𒊭 𒉿𒊑𒅖𒋾𒅎 | `namzāqum ša pirištim` | `na-am-za-qú-um ša pi-ri-iš-ti-im` | secret opening-key |
| portfolio | 𒁍𒄷𒌨 𒈠𒀝𒆪𒊑 | `puḫur makkūrī` | `pú-ḫu-ur ma-ak-ku-ri` | assembly of property |
| DeFi farming | 𒂊𒊑𒌍 𒈠𒀝𒆪𒊑 | `erēš makkūrī` | `e-re-eš ma-ak-ku-ri` | cultivation of property |
| prediction market | 𒈠𒄭𒊒𒌝 𒊭 𒁀𒊒𒌑𒋾𒅎 | `maḫīrum ša bārûtim` | `ma-ḫi-ru-um ša ba-ru-ú-ti-im` | market of divination |
| cross-chain route | 𒄩𒅈𒊏𒉡𒌝 𒄿𒈾 𒁉𒊑𒀉 𒊑𒅅𒊓𒀜 𒌅𒌒𒉿 | `ḫarrānum ina birīt riksāt ṭuppī` | `ḫa-ar-ra-nu-um i-na bi-ri-it ri-ik-sa-at ṭu-up-pi` | road between bonds of tablets |
| indexer | 𒌅𒌒𒊭𒅈𒊒𒌝 | `ṭupšarrum` | `ṭu-up-ša-ar-ru-um` | scribe |
| synchronization | 𒌓𒁺𒋗𒌝 | `uddūšum` | `ud-du-šu-um` | renewal |
| web3 | 𒊑𒅅𒋛𒅎 3 | `riksim 3` | `ri-ik-si-im 3` | joined web 3 |
| minutes (m) | 𒍣𒀉𒋫𒀜 𒀀𒁕𒀭𒉌𒅎 𒍣𒄴𒊏𒋾𒅎 | `zittāt adannim ṣeḫrātim` | `zi-it-ta-at a-da-an-ni-im ṣé-eḫ-ra-ti-im` | shares of the small appointed time |
| hours (h) | 𒈪𒅆𒅋 𒁁𒊑𒅎 | `mišil bērim` | `mi-ši-il be-ri-im` | half a double-hour |
| identifier (ID) | 𒋗𒈬𒌝 | `šumum` | `šu-mu-um` | name |
| alpha version | 𒅆𒅁𒊒𒌝 𒊭 𒊑𒅆𒅎 | `šiprum ša rēšim` | `ši-ip-ru-um ša re-ši-im` | work of the beginning |
| sakura | 𒉿𒅕𒄭𒅎 | `pirḫim` | `pi-ir-ḫi-im` | blossom |

This is a functional literary localization, not a cuneiform transcription of
an attested ancient text. Concepts such as apps, URLs, metadata, NFTs,
staking, and cross-chain routing are necessarily modern calques; their
wording aims to preserve the product meaning through ancient imagery.

## Adding or changing strings

1. Write the message in normalized Old Akkadian, reusing the compounds above.
2. Convert it to cuneiform with the Codex command used for every ancient-script
   string in this release (read-only sandbox, prompt on stdin):
   `codex exec -m gpt-6-astra -c model_reasoning_effort='"ultra"' -s read-only --skip-git-repo-check -o <outfile> -`.
   Ask for the orthography policy above, byte-identical placeholders, plural
   separators, and digits, and strict JSON output. Reuse the spelling of words
   that already occur in `translation.json`.
3. Run `tests/unit/akkadian-locale.spec.ts`.

## Integrity checks

`tests/unit/akkadian-locale.spec.ts` requires exact English-key coverage;
placeholder, plural-branch, numeric-literal, and intentional-empty parity; NFC
normalization; cuneiform in every non-empty explanatory message; no leftover
Latin transliteration; an explicit allowlist for proper names that stay in
Latin script; only signs covered by the bundled font; and stable renderings
for the core semantic compounds. `tests/unit/akkadian-onboarding.spec.ts`
checks the bundled onboarding stories, and `tests/unit/language-preference.spec.ts`
checks the upgrade from the retired `akk-Latn-x-old` tag.
