# Classical Middle Egyptian hieroglyph locale

`translation.json` is a complete, one-for-one localization of the English
message tree. The locale tag is `egy-Egyp`: `egy` identifies Ancient Egyptian
and `Egyp` identifies the Unicode Egyptian Hieroglyphs script. The language
selector names it `𓂋 𓈖 𓆎𓅓𓏏 · R n Kmt` ("speech of Kemet").

## Language and display policy

- The grammatical target is Classical Middle Egyptian, the classical literary
  register conventionally associated with Middle Kingdom language. Later
  Egyptian, Demotic, Coptic, and modern Arabic forms are not silently mixed
  into it to fill lexical gaps.
- Messages use Unicode Egyptian Hieroglyphs (`U+13000–U+1342F`) in a stable
  left-to-right reading order. This is a digital UI convention, not a claim
  that Egyptian monuments used one exclusive direction: historical texts can
  face and read in either direction.
- The app bundles Noto Sans Egyptian Hieroglyphs and places it in the global
  fallback stack, including the onboarding display faces, so glyph rendering
  does not depend on a font already installed on the user's system.
- The strings prioritize readable linear sign order. They do not claim to
  reproduce the artistic quadrats, sign orientation, damage, honorific
  transposition, or palaeographic variation of a particular inscription.
- Egyptian hieroglyphic spelling principally records consonants. The locale is
  therefore not a reconstruction of ancient pronunciation and does not insert
  speculative vowels into the displayed Egyptian text.

## Semantic translation policy

The UI meaning, including security distinctions, is translated before the
English wording is mapped to Egyptian. Where a close Classical Middle Egyptian
word is attested, the locale uses that lexical core. Where the product concept
has no ancient equivalent, it uses a transparent poetic compound built from
ancient words and imagery, for example:

| Modern concept    | Stable Egyptian rendering        | Literal semantic image                   |
| ----------------- | -------------------------------- | ---------------------------------------- |
| wallet / treasury | `𓉒` (`pr-ḥḏ`)                    | the White House, or treasury             |
| password          | `𓂋𓈖 𓈙𓇾𓍔𓄿𓏴𓏛` (`rn štꜣ`)           | secret name                              |
| account           | `𓇋𓊪𓏥 𓈖 𓂋𓈖` (`jp.w n rn`)         | reckonings of a name                     |
| network           | `𓄡𓈖𓅓𓏥` (`ẖnm.w`)                 | joinings or unions                       |
| blockchain        | `𓈙𓈖𓏥 𓈖 𓅓𓆓𓄿𓅱𓏏𓏥` (`šn.w n mḏꜣ.wt`) | rings or chains of records               |
| network fee       | `𓇋𓋴𓅱 𓈖 𓄡𓈖𓅓𓏥` (`jsw n ẖnm.w`)     | payment or value of the joinings         |
| asset             | context-sensitive                | property or entrusted possession         |
| validator / node  | context-sensitive                | guardian or watch-post                   |
| liquidity         | context-sensitive                | flowing property or waters of wealth     |
| staking           | context-sensitive                | placing or binding property for a reward |
| private key       | context-sensitive                | secret opening-key or instrument         |

These compounds are literary localization choices. They must not be cited as
evidence that an Egyptian text used an ancient word with a modern computing,
cryptographic, or financial sense. Repeated product concepts keep the same
semantic image throughout the locale so that poetic language does not blur UI
distinctions such as password versus recovery phrase, account versus wallet,
or fee versus transferred amount.

Interpolation markers such as `{asset}`, `{count}`, and `%s`, plural branches,
and numeric literals are runtime data and remain byte-for-byte compatible with
the English source. The destructive reset confirmation likewise continues to
show the exact Latin phrase `Reset wallet`, because that phrase is the literal
the application requires the user to type.

## Proper names and protocols

Proper names, brands, protocol names, network names, ticker symbols, URLs, and
data-format identifiers remain in their recognized Latin form when translating
them would change identity or make a safety-sensitive instruction ambiguous.
Examples include Fearless Wallet, Polkaswap, Google, Twitter, Wallet Connect,
DApps, and JSON. Explanatory words around such identifiers are translated;
preserving a name is not a license to leave its surrounding message in English.

The onboarding stories live outside the Vue I18n message tree. A matching
bundled `onboarding.ts` catalog covers both new- and returning-user flows so the
Egyptian locale never silently falls back to English story text.

## Sources and attestation

The localization policy checks vocabulary, spelling, and usage against these
primary scholarly reference points:

- [Thesaurus Linguae Aegyptiae (TLA) lemma and corpus search](https://thesaurus-linguae-aegyptiae.de/search)
  for attested lexemes, spellings, periods, and contexts.
- UCL Digital Egypt's overviews of
  [the development of the Egyptian language](https://www.ucl.ac.uk/museums-static/digitalegypt/literature/language/development.html)
  and [the hieroglyphic writing system](https://www.ucl.ac.uk/museums-static/digitalegypt/writing/system.html)
  for the relationship between language phase, phonetic signs, classifiers,
  and logograms, plus its [accountancy overview](https://www.ucl.ac.uk/museums-static/digitalegypt/pdf/accountancy.pdf)
  for `pr-ḥḏ`, the “White House” or treasury.
- [The Unicode Egyptian Hieroglyphs code chart](https://www.unicode.org/charts/PDF/U13000.pdf)
  for character identity and code-point encoding. Unicode names and reference
  glyphs are an encoding standard, not a dictionary or grammar.

Attestation belongs to individual ancient lexemes and constructions, not to
the modern product sentence assembled from them. No ancient corpus contains
wallet-extension screens, URLs, NFTs, blockchains, or cross-chain routing.
Consequently this locale can be internally consistent, source-informed, and
semantically faithful without being a verbatim historical translation. Any
claim that a complete modern message is itself attested requires a cited
ancient passage and independent Egyptological review.

## Integrity checks

`tests/unit/egyptian-hieroglyph-locale.spec.ts` requires exact English-key
coverage; placeholder, plural-branch, numeric-literal, and intentional-empty
parity; NFC normalization; a hieroglyph in every non-empty explanatory message;
an explicit term-level proper-name/protocol allowlist; stable semantic anchors
for the core poetic calques; and distinct renderings for safety-sensitive
states and warnings. `tests/unit/egyptian-onboarding.spec.ts` separately checks
the bundled story counts and their account and password anchors.
