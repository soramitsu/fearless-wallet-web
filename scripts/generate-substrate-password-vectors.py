#!/usr/bin/env python3
"""Independent generator for the Substrate derivation-path password vectors.

Uses only the Python standard library and its own BIP39 entropy, PBKDF2 mini-secret,
sr25519 (Ristretto255, Merlin/STROBE-128, Keccak-f[1600]), Ed25519, secp256k1 and SS58
code. It does not import or call any Fearless client code or Substrate library, so the
clients' derivations can be checked against it. Before writing anything it checks itself
against the well-known Substrate development accounts and the RFC 9496 Ristretto255
encodings, and its Keccak-f[1600] against hashlib's SHA3-256.

The BIP39 English wordlist is read from a file (a JSON array or one word per line) and
must hash to the canonical list's SHA-256.

Usage:
  python3 -I generate-substrate-password-vectors.py --wordlist english.json > substrate-password-vectors.json
"""

import argparse
import hashlib
import json
import sys
import unicodedata

ENGLISH_SHA256 = '2f5eed53a4727b4bf8880d8f3f199efc90e58503646d9ff8eff3a2ed3b24dbda'

# ---------------------------------------------------------------- BIP39 entropy and mini secret


def load_wordlist(path: str):
    with open(path, encoding='utf-8') as handle:
        text = handle.read()
    words = json.loads(text) if text.lstrip().startswith('[') else text.split()
    digest = hashlib.sha256(('\n'.join(words) + '\n').encode('utf-8')).hexdigest()
    if len(words) != 2048 or digest != ENGLISH_SHA256:
        raise SystemExit(f'{path} is not the canonical BIP39 English wordlist ({digest})')
    return words


def mnemonic_entropy(mnemonic: str, wordlist) -> bytes:
    words = unicodedata.normalize('NFKD', mnemonic).split()
    if len(words) not in (12, 15, 18, 21, 24):
        raise ValueError('word count')
    bits = ''.join(format(wordlist.index(word), '011b') for word in words)
    split = len(bits) // 33 * 32
    entropy = int(bits[:split], 2).to_bytes(split // 8, 'big')
    checksum = format(hashlib.sha256(entropy).digest()[0], '08b')[:len(bits) - split]
    if bits[split:] != checksum:
        raise ValueError('checksum')
    return entropy


def mini_secret(entropy: bytes, salt_password: str) -> bytes:
    """substrate-bip39: PBKDF2-HMAC-SHA512 over the entropy (not the words), first 32 bytes."""
    salt = ('mnemonic' + salt_password).encode('utf-8')
    return hashlib.pbkdf2_hmac('sha512', entropy, salt, 2048, 64)[:32]


# ---------------------------------------------------------------- SCALE, BLAKE2, SS58


def compact(n: int) -> bytes:
    if n < 1 << 6:
        return bytes([n << 2])
    if n < 1 << 14:
        return ((n << 2) | 1).to_bytes(2, 'little')
    raise ValueError(n)


def blake2_256(data: bytes) -> bytes:
    return hashlib.blake2b(data, digest_size=32).digest()


B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'


def base58(data: bytes) -> str:
    n = int.from_bytes(data, 'big')
    out = ''
    while n:
        n, r = divmod(n, 58)
        out = B58[r] + out
    return '1' * (len(data) - len(data.lstrip(b'\0'))) + out


def ss58(account_id: bytes, prefix: int) -> str:
    payload = bytes([prefix]) + account_id
    checksum = hashlib.blake2b(b'SS58PRE' + payload, digest_size=64).digest()[:2]
    return base58(payload + checksum)


def chain_code(junction: str) -> bytes:
    """A '//name' junction's chain code: the SCALE-encoded value, padded or hashed to 32 bytes."""
    if junction.isdigit():
        encoded = int(junction).to_bytes(8, 'little')
    else:
        raw = junction.encode('utf-8')
        encoded = compact(len(raw)) + raw
    return encoded.ljust(32, b'\0') if len(encoded) <= 32 else blake2_256(encoded)


def parse_path(path: str):
    """'//hard//hard///password' -> (['hard', 'hard'], password or None). Hard junctions only."""
    password = None
    if '///' in path:
        path, password = path.split('///', 1)
    junctions = []
    while path:
        if not path.startswith('//'):
            raise ValueError('only hard junctions are used in these vectors')
        rest = path[2:]
        cut = rest.find('/')
        junctions.append(rest if cut < 0 else rest[:cut])
        path = '' if cut < 0 else rest[cut:]
    return junctions, password


# ---------------------------------------------------------------- Ed25519 / Ristretto255 field and group

EP = 2**255 - 19
EL = 2**252 + 27742317777372353535851937790883648493
ED = -121665 * pow(121666, EP - 2, EP) % EP
SQRT_M1 = pow(2, (EP - 1) // 4, EP)


def ed_recover_x(y, sign):
    x2 = (y * y - 1) * pow(ED * y * y + 1, EP - 2, EP) % EP
    x = pow(x2, (EP + 3) // 8, EP)
    if (x * x - x2) % EP:
        x = x * SQRT_M1 % EP
    if x & 1 != sign:
        x = EP - x
    return x


EGY = 4 * pow(5, EP - 2, EP) % EP
EGX = ed_recover_x(EGY, 0)
EG = (EGX, EGY, 1, EGX * EGY % EP)


def ed_add(a, b):
    A = (a[1] - a[0]) * (b[1] - b[0]) % EP
    B = (a[1] + a[0]) * (b[1] + b[0]) % EP
    C = 2 * a[3] * b[3] * ED % EP
    D = 2 * a[2] * b[2] % EP
    E, F, G, H = B - A, D - C, D + C, B + A
    return E * F % EP, G * H % EP, F * G % EP, E * H % EP


def ed_mul(s, point=EG):
    result = (0, 1, 1, 0)
    while s:
        if s & 1:
            result = ed_add(result, point)
        point = ed_add(point, point)
        s >>= 1
    return result


def ed_encode(point) -> bytes:
    x, y, z, _ = point
    zinv = pow(z, EP - 2, EP)
    x, y = x * zinv % EP, y * zinv % EP
    return (y | ((x & 1) << 255)).to_bytes(32, 'little')


def is_negative(x):
    return (x % EP) & 1


def ct_abs(x):
    return (EP - x) % EP if is_negative(x) else x % EP


def sqrt_ratio_m1(u, v):
    r = (u * pow(v, 3, EP)) * pow(u * pow(v, 7, EP), (EP - 5) // 8, EP) % EP
    check = v * r * r % EP
    correct = check == u % EP
    flipped = check == (-u) % EP
    flipped_i = check == (-u * SQRT_M1) % EP
    if flipped or flipped_i:
        r = SQRT_M1 * r % EP
    return correct or flipped, ct_abs(r)


INVSQRT_A_MINUS_D = sqrt_ratio_m1(1, (-1 - ED) % EP)[1]


def ristretto_encode(point) -> bytes:
    """RFC 9496 section 4.3.2."""
    x0, y0, z0, t0 = point
    u1 = (z0 + y0) * (z0 - y0) % EP
    u2 = x0 * y0 % EP
    _, invsqrt = sqrt_ratio_m1(1, u1 * u2 * u2 % EP)
    den1 = invsqrt * u1 % EP
    den2 = invsqrt * u2 % EP
    z_inv = den1 * den2 * t0 % EP
    rotate = is_negative(t0 * z_inv)
    x, y = (y0 * SQRT_M1 % EP, x0 * SQRT_M1 % EP) if rotate else (x0, y0)
    den_inv = den1 * INVSQRT_A_MINUS_D % EP if rotate else den2
    if is_negative(x * z_inv):
        y = (-y) % EP
    return ct_abs(den_inv * (z0 - y)).to_bytes(32, 'little')


# ---------------------------------------------------------------- Keccak-f[1600], STROBE-128, Merlin

ROTATIONS = [[0, 36, 3, 41, 18], [1, 44, 10, 45, 2], [62, 6, 43, 15, 61], [28, 55, 25, 21, 56], [27, 20, 39, 8, 14]]
MASK64 = (1 << 64) - 1


def _round_constants():
    constants, state = [], 1
    for _ in range(24):
        constant = 0
        for j in range(7):
            if state & 1:
                constant |= 1 << ((1 << j) - 1)
            state = ((state << 1) ^ (0x71 if state & 0x80 else 0)) & 0xFF
        constants.append(constant)
    return constants


ROUND_CONSTANTS = _round_constants()


def _rol(value, shift):
    return ((value << shift) | (value >> (64 - shift))) & MASK64 if shift else value


def keccak_f1600(state: bytearray):
    lanes = [int.from_bytes(state[8 * i:8 * i + 8], 'little') for i in range(25)]
    for constant in ROUND_CONSTANTS:
        c = [lanes[x] ^ lanes[x + 5] ^ lanes[x + 10] ^ lanes[x + 15] ^ lanes[x + 20] for x in range(5)]
        d = [c[(x - 1) % 5] ^ _rol(c[(x + 1) % 5], 1) for x in range(5)]
        lanes = [lanes[i] ^ d[i % 5] for i in range(25)]
        b = [0] * 25
        for x in range(5):
            for y in range(5):
                b[y + 5 * ((2 * x + 3 * y) % 5)] = _rol(lanes[x + 5 * y], ROTATIONS[x][y])
        lanes = [b[i] ^ ((~b[(i % 5 + 1) % 5 + 5 * (i // 5)]) & b[(i % 5 + 2) % 5 + 5 * (i // 5)]) for i in range(25)]
        lanes[0] ^= constant
    state[:] = b''.join(lane.to_bytes(8, 'little') for lane in lanes)


def sha3_256_with_own_keccak(data: bytes) -> bytes:
    rate = 136
    padded = bytearray(data) + b'\x06' + b'\0' * ((-len(data) - 2) % rate) + b'\x80'
    if len(padded) % rate:
        raise AssertionError('padding')
    state = bytearray(200)
    for offset in range(0, len(padded), rate):
        for i in range(rate):
            state[i] ^= padded[offset + i]
        keccak_f1600(state)
    return bytes(state[:32])


STROBE_R = 166
FLAG_I, FLAG_A, FLAG_C, FLAG_T, FLAG_M, FLAG_K = 1, 2, 4, 8, 16, 32


class Strobe128:
    """The minimal STROBE-128 that Merlin uses (AD, meta-AD and PRF only)."""

    def __init__(self, protocol_label: bytes):
        self.state = bytearray(200)
        self.state[0:6] = bytes([1, STROBE_R + 2, 1, 0, 1, 96])
        self.state[6:18] = b'STROBEv1.0.2'
        keccak_f1600(self.state)
        self.pos = self.pos_begin = self.cur_flags = 0
        self.meta_ad(protocol_label, False)

    def _run_f(self):
        self.state[self.pos] ^= self.pos_begin
        self.state[self.pos + 1] ^= 0x04
        self.state[STROBE_R + 1] ^= 0x80
        keccak_f1600(self.state)
        self.pos = self.pos_begin = 0

    def _absorb(self, data: bytes):
        for byte in data:
            self.state[self.pos] ^= byte
            self.pos += 1
            if self.pos == STROBE_R:
                self._run_f()

    def _squeeze(self, length: int) -> bytes:
        out = bytearray()
        for _ in range(length):
            out.append(self.state[self.pos])
            self.state[self.pos] = 0
            self.pos += 1
            if self.pos == STROBE_R:
                self._run_f()
        return bytes(out)

    def _begin_op(self, flags: int, more: bool):
        if more:
            if self.cur_flags != flags:
                raise AssertionError('flags changed mid-operation')
            return
        old_begin = self.pos_begin
        self.pos_begin = self.pos + 1
        self.cur_flags = flags
        self._absorb(bytes([old_begin, flags]))
        if flags & (FLAG_C | FLAG_K) and self.pos != 0:
            self._run_f()

    def meta_ad(self, data: bytes, more: bool):
        self._begin_op(FLAG_M | FLAG_A, more)
        self._absorb(data)

    def ad(self, data: bytes, more: bool):
        self._begin_op(FLAG_A, more)
        self._absorb(data)

    def prf(self, length: int, more: bool) -> bytes:
        self._begin_op(FLAG_I | FLAG_A | FLAG_C, more)
        return self._squeeze(length)


class Transcript:
    def __init__(self, label: bytes):
        self.strobe = Strobe128(b'Merlin v1.0')
        self.append_message(b'dom-sep', label)

    def append_message(self, label: bytes, message: bytes):
        self.strobe.meta_ad(label, False)
        self.strobe.meta_ad(len(message).to_bytes(4, 'little'), True)
        self.strobe.ad(message, False)

    def challenge_bytes(self, label: bytes, length: int) -> bytes:
        self.strobe.meta_ad(label, False)
        self.strobe.meta_ad(length.to_bytes(4, 'little'), True)
        return self.strobe.prf(length, False)


# ---------------------------------------------------------------- sr25519 (schnorrkel, ExpansionMode::Ed25519)


def sr25519_expand(mini: bytes) -> bytes:
    """MiniSecretKey::expand_ed25519: the secret scalar's 32 bytes (the nonce half is not needed here)."""
    h = bytearray(hashlib.sha512(mini).digest()[:32])
    h[0] &= 248
    h[31] &= 63
    h[31] |= 64
    key = int.from_bytes(h, 'little') >> 3  # divide by the cofactor
    if key >= EL:
        raise AssertionError('unreduced scalar')
    return key.to_bytes(32, 'little')


def sr25519_public(mini: bytes) -> bytes:
    return ristretto_encode(ed_mul(int.from_bytes(sr25519_expand(mini), 'little')))


def sr25519_hard(mini: bytes, code: bytes) -> bytes:
    """SecretKey::hard_derive_mini_secret_key(Some(chain code), b"") as sp-core's sr25519 derive uses it."""
    transcript = Transcript(b'SchnorrRistrettoHDKD')
    transcript.append_message(b'sign-bytes', b'')
    transcript.append_message(b'chain-code', code)
    transcript.append_message(b'secret-key', sr25519_expand(mini))
    return transcript.challenge_bytes(b'HDKD-hard', 32)


# ---------------------------------------------------------------- Ed25519 and ECDSA (sp-core)


def ed25519_public(seed: bytes) -> bytes:
    h = hashlib.sha512(seed).digest()
    scalar = int.from_bytes(h[:32], 'little')
    scalar &= (1 << 254) - 8
    scalar |= 1 << 254
    return ed_encode(ed_mul(scalar))


def ed25519_hard(seed: bytes, code: bytes) -> bytes:
    return blake2_256(compact(11) + b'Ed25519HDKD' + seed + code)


SP = 2**256 - 2**32 - 977
SN = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141
SG = (0x79BE667EF9DCBBAC55A06295CE870B07029BFCDB2DCE28D959F2815B16F81798,
      0x483ADA7726A3C4655DA4FBFC0E1108A8FD17B448A68554199C47D08FFB10D4B8)


def ec_add(a, b):
    if a is None:
        return b
    if b is None:
        return a
    if a[0] == b[0] and (a[1] + b[1]) % SP == 0:
        return None
    if a == b:
        lam = 3 * a[0] * a[0] * pow(2 * a[1], SP - 2, SP) % SP
    else:
        lam = (b[1] - a[1]) * pow(b[0] - a[0], SP - 2, SP) % SP
    x = (lam * lam - a[0] - b[0]) % SP
    return x, (lam * (a[0] - x) - a[1]) % SP


def ec_mul(k, point=SG):
    result = None
    while k:
        if k & 1:
            result = ec_add(result, point)
        point = ec_add(point, point)
        k >>= 1
    return result


def ecdsa_public(seed: bytes) -> bytes:
    k = int.from_bytes(seed, 'big')
    if not 0 < k < SN:
        raise ValueError('invalid secp256k1 secret')
    x, y = ec_mul(k)
    return bytes([2 + (y & 1)]) + x.to_bytes(32, 'big')


def ecdsa_hard(seed: bytes, code: bytes) -> bytes:
    return blake2_256(compact(13) + b'Secp256k1HDKD' + seed + code)


# ---------------------------------------------------------------- accounts

HARD = {'sr25519': sr25519_hard, 'ed25519': ed25519_hard, 'ecdsa': ecdsa_hard}


def account(mini: bytes, junctions, crypto: str):
    secret = mini
    for junction in junctions:
        secret = HARD[crypto](secret, chain_code(junction))
    if crypto == 'sr25519':
        public = sr25519_public(secret)
        account_id = public
    elif crypto == 'ed25519':
        public = ed25519_public(secret)
        account_id = public
    else:
        public = ecdsa_public(secret)
        account_id = blake2_256(public)
    return {
        'publicKey': '0x' + public.hex(),
        'accountId': '0x' + account_id.hex(),
        'ss58Generic': ss58(account_id, 42),
        'ss58Polkadot': ss58(account_id, 0),
    }


def self_check(wordlist):
    """Fails unless this code reproduces published Substrate, RFC 9496 and SHA3 values."""
    for data in (b'', b'abc', bytes(range(200))):
        if sha3_256_with_own_keccak(data) != hashlib.sha3_256(data).digest():
            raise SystemExit('Keccak-f[1600] self-check failed')
    if ristretto_encode(EG).hex() != 'e2f2ae0a6abc4e71a884a961c500515f58e30b6aa582dd8db6a65945e08d2d76' or \
            ristretto_encode(ed_mul(2)).hex() != '6a493210f7499cd17fecb510ae0cea23a110e8d5b901f8acadd3095c73a3b919':
        raise SystemExit('Ristretto255 self-check failed')
    dev = 'bottom drive obey lake curtain smoke basket hold race lonely fit walk'
    mini = mini_secret(mnemonic_entropy(dev, wordlist), '')
    expected = [
        ([], 'sr25519', '5DfhGyQdFobKM8NsWvEeAKk5EQQgYe9AydgJ7rMB6E1EqRzV'),
        (['Alice'], 'sr25519', '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY'),
        (['Alice'], 'ed25519', '5FA9nQDVg267DEd8m1ZypXLBnvN7SFxYwV7ndqSYGiN9TTpu'),
        (['Alice'], 'ecdsa', '5C7C2Z5sWbytvHpuLTvzKunnnRwQxft1jiqrLD5rhucQ5S9X'),
    ]
    for junctions, crypto, address in expected:
        if account(mini, junctions, crypto)['ss58Generic'] != address:
            raise SystemExit(f'Substrate development account self-check failed: {crypto} {junctions}')


# ---------------------------------------------------------------- vectors

IMPORT12 = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'
DEFAULT24 = ('abandon amount liar amount expire adjust cage candy arch gather drum bullet absurd math era live '
             'bid rhythm alien crouch range attend journey unaware')
# Precomposed umlauts and full-width Latin (NFC input), as a keyboard types them.
UNICODE_NFC = 'pässwörd ＦＷ'
# The same password with decomposed umlauts (NFD input), as text pasted from some sources arrives.
UNICODE_NFD = unicodedata.normalize('NFD', UNICODE_NFC)
# Katakana with voiced marks, typed by a Japanese input method (NFC).
KATAKANA = 'パスワード'

CASES = [
    ('import12-ascii', IMPORT12, '//polkadot///TREZOR'),
    ('default24-unicode', DEFAULT24, '//polkadot///' + UNICODE_NFC),
    ('default24-unicode-decomposed-input', DEFAULT24, '//polkadot///' + UNICODE_NFD),
    ('default24-unicode-password-only', DEFAULT24, '///' + UNICODE_NFC),
    ('import12-katakana', IMPORT12, '//polkadot///' + KATAKANA),
]

RULES = {
    'nfkd': lambda password: unicodedata.normalize('NFKD', password),
    'nfc': lambda password: unicodedata.normalize('NFC', password),
    'asTyped': lambda password: password,
}


def vectors(wordlist):
    result = []
    for case_id, mnemonic, path in CASES:
        junctions, password = parse_path(path)
        entropy = mnemonic_entropy(mnemonic, wordlist)
        derived = {}
        for rule, normalise in RULES.items():
            salt_password = normalise(password)
            mini = mini_secret(entropy, salt_password)
            derived[rule] = {
                'saltPasswordUtf8Hex': salt_password.encode('utf-8').hex(),
                'miniSecret': '0x' + mini.hex(),
                'sr25519': account(mini, junctions, 'sr25519'),
                'ed25519': account(mini, junctions, 'ed25519'),
                'ecdsa': account(mini, junctions, 'ecdsa'),
            }
        result.append({
            'id': case_id,
            'mnemonic': mnemonic,
            'entropy': '0x' + entropy.hex(),
            'derivationPath': path,
            'derivationPathUtf8Hex': path.encode('utf-8').hex(),
            'hardJunctions': junctions,
            'password': password,
            'passwordUtf8Hex': password.encode('utf-8').hex(),
            'rulesAgree': len({entry['miniSecret'] for entry in derived.values()}) == 1,
            'accounts': derived,
        })
    return result


def document(wordlist):
    return {
        'version': 1,
        'generatedAt': '2026-10-31',
        'derivationSpec': "Substrate account from BIP39 words and a derivation path '//hard...///password'",
        'canonicalRule': 'nfkd',
        'rules': {
            'nfkd': ("miniSecret = PBKDF2-HMAC-SHA512(BIP39 entropy, 'mnemonic' + NFKD(password), 2048 rounds)[0..32]. "
                     'iOS (IrohaCrypto SNBIP39SeedCreator) and Android (fearless-utils SeedCreator) have always '
                     'used it, and it is the BIP39 passphrase rule.'),
            'nfc': ('The same with NFC(password): Fearless web 4.2.x (@polkadot/util-crypto 14 keyExtractSuri '
                    'NFC-normalises the SURI, bip39ToMiniSecret salts with the bytes as given).'),
            'asTyped': ('The same with the password bytes exactly as entered: Fearless web 3.0.x and earlier '
                        '(@polkadot/util-crypto 12 does not normalise).'),
        },
        'derivation': ('Hard junctions only: sr25519 uses schnorrkel hard_derive_mini_secret_key (Merlin '
                       "'SchnorrRistrettoHDKD') and ExpansionMode::Ed25519; ed25519 and ecdsa use "
                       "blake2_256(SCALE('Ed25519HDKD' | 'Secp256k1HDKD', seed, chainCode)). An ecdsa account id "
                       'is blake2_256 of the 33-byte compressed public key. ss58Generic uses prefix 42, ss58Polkadot 0.'),
        'generator': ('scripts/generate-substrate-password-vectors.py (Python standard library only, no client '
                      'code; self-checked against the Substrate development accounts and RFC 9496)'),
        'vectors': vectors(wordlist),
    }


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--wordlist', required=True, help='BIP39 English wordlist (JSON array or one word per line)')
    args = parser.parse_args()
    words = load_wordlist(args.wordlist)
    self_check(words)
    sys.stdout.write(json.dumps(document(words), indent=2, ensure_ascii=False) + '\n')
