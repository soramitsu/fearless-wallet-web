# Substrate path password

A Substrate account made from recovery words can carry a password at the end of its derivation path:
`//hard/soft///password`. The account's mini secret is
PBKDF2-HMAC-SHA512(BIP39 entropy, "mnemonic" + password, 2048 rounds), first 32 bytes.

Fearless clients have not always fed that password in the same form:

| Rule | Salt | Clients |
| --- | --- | --- |
| `nfkd` | "mnemonic" + NFKD(password) | Fearless for iOS and Android, always; every Fearless app for new accounts now |
| `nfc` | "mnemonic" + NFC(password) | this extension 4.2.x before this change (`@polkadot/util-crypto` 14 NFC-normalises the whole SURI) |
| `asTyped` | "mnemonic" + the password exactly as entered | this extension 3.0.x and earlier (`@polkadot/util-crypto` 12) |

The rules agree for ASCII passwords. They disagree when normalisation changes the password: accented
letters, full-width letters, kana with voiced marks and similar text open different accounts.

## Behaviour

- New wallets and imports use `nfkd`, so the same words, path and password open the same account in every
  Fearless app. `SubstratePassword.ts` derives the mini secret itself, because util-crypto would
  NFC-normalise a pre-normalised SURI again.
- An import whose password reads differently under `nfc` or `asTyped` asks which account to open
  (`SubstrateAddressChoice.vue`), the current one preselected. Wallets made from new words never ask.
- Stored wallets keep their keys. Account access recovery and the Universal Wallet "enter the path" check
  accept whichever rule reproduces the stored key, including 3.0's for a password pasted decomposed (NFD).
- Ethereum, Bitcoin, Solana, TON and Taira are unchanged: their passwords were already NFKD.

## Vectors

`docs/substrate-password-vectors.json` holds five cases with the account of every rule for sr25519,
ed25519 and ECDSA. `scripts/generate-substrate-password-vectors.py` writes it with the Python standard
library only (its own BIP39, PBKDF2, sr25519 with Ristretto255 and Merlin, Ed25519, secp256k1 and SS58),
after checking itself against the Substrate development accounts and RFC 9496:

```bash
python3 -I scripts/generate-substrate-password-vectors.py --wordlist node_modules/bip39/src/wordlists/english.json > docs/substrate-password-vectors.json
```

Fearless for iOS and Android test against the same file.
