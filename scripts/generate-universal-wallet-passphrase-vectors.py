#!/usr/bin/env python3
"""Independent generator for the Universal Wallet passphrase vectors.

Uses only the Python standard library and its own BIP39, BIP32 (secp256k1),
SLIP-10 (Ed25519), bech32, base58, TON cell-hash and Iroha i105 code. It does
not import or call any Fearless client code, so the clients' derivations can be
checked against it.

Usage:
  python3 -I generate-universal-wallet-passphrase-vectors.py --check-v2 <v2 json>
  python3 -I generate-universal-wallet-passphrase-vectors.py > universal-wallet-v2-passphrase-vectors.json
"""

import argparse
import base64
import hashlib
import hmac
import json
import struct
import sys
import unicodedata

# ---------------------------------------------------------------- BIP39 seed


def bip39_seed(mnemonic: str, passphrase: str) -> bytes:
    words = unicodedata.normalize('NFKD', ' '.join(mnemonic.split()))
    salt = 'mnemonic' + unicodedata.normalize('NFKD', passphrase)
    return hashlib.pbkdf2_hmac('sha512', words.encode('utf-8'), salt.encode('utf-8'), 2048, 64)


def parse_path(path: str):
    parts = path.split('/')
    if parts[0] != 'm':
        raise ValueError(path)
    result = []
    for part in parts[1:]:
        hardened = part.endswith("'")
        index = int(part[:-1] if hardened else part)
        result.append(index | 0x80000000 if hardened else index)
    return result


# ---------------------------------------------------------------- secp256k1

P = 2**256 - 2**32 - 977
N = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141
G = (0x79BE667EF9DCBBAC55A06295CE870B07029BFCDB2DCE28D959F2815B16F81798,
     0x483ADA7726A3C4655DA4FBFC0E1108A8FD17B448A68554199C47D08FFB10D4B8)


def ec_add(a, b):
    if a is None:
        return b
    if b is None:
        return a
    if a[0] == b[0] and (a[1] + b[1]) % P == 0:
        return None
    if a == b:
        lam = 3 * a[0] * a[0] * pow(2 * a[1], P - 2, P) % P
    else:
        lam = (b[1] - a[1]) * pow(b[0] - a[0], P - 2, P) % P
    x = (lam * lam - a[0] - b[0]) % P
    return x, (lam * (a[0] - x) - a[1]) % P


def ec_mul(k, point=G):
    result = None
    while k:
        if k & 1:
            result = ec_add(result, point)
        point = ec_add(point, point)
        k >>= 1
    return result


def compressed(point) -> bytes:
    return bytes([2 + (point[1] & 1)]) + point[0].to_bytes(32, 'big')


def hash160(data: bytes) -> bytes:
    return hashlib.new('ripemd160', hashlib.sha256(data).digest()).digest()


def bip32_derive(seed: bytes, path: str):
    digest = hmac.new(b'Bitcoin seed', seed, hashlib.sha512).digest()
    key, chain = int.from_bytes(digest[:32], 'big'), digest[32:]
    parent_fingerprint, depth, child = b'\0\0\0\0', 0, 0
    for index in parse_path(path):
        public = compressed(ec_mul(key))
        if index & 0x80000000:
            data = b'\0' + key.to_bytes(32, 'big') + struct.pack('>I', index)
        else:
            data = public + struct.pack('>I', index)
        digest = hmac.new(chain, data, hashlib.sha512).digest()
        tweak = int.from_bytes(digest[:32], 'big')
        if tweak >= N:
            raise ValueError('invalid child')
        parent_fingerprint = hash160(public)[:4]
        key, chain = (tweak + key) % N, digest[32:]
        depth, child = depth + 1, index
        if key == 0:
            raise ValueError('invalid child')
    return {'key': key, 'chain': chain, 'depth': depth, 'child': child, 'parent': parent_fingerprint}


B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'


def base58(data: bytes) -> str:
    value = int.from_bytes(data, 'big')
    out = ''
    while value:
        value, rem = divmod(value, 58)
        out = B58[rem] + out
    return '1' * (len(data) - len(data.lstrip(b'\0'))) + out


def base58check(data: bytes) -> str:
    return base58(data + hashlib.sha256(hashlib.sha256(data).digest()).digest()[:4])


def xpub(node) -> str:
    public = compressed(ec_mul(node['key']))
    payload = (bytes.fromhex('0488b21e') + bytes([node['depth']]) + node['parent']
               + struct.pack('>I', node['child']) + node['chain'] + public)
    return base58check(payload)


BECH32_CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l'


def bech32_polymod(values):
    generators = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3]
    chk = 1
    for value in values:
        top = chk >> 25
        chk = (chk & 0x1ffffff) << 5 ^ value
        for i in range(5):
            chk ^= generators[i] if ((top >> i) & 1) else 0
    return chk


def hrp_expand(hrp):
    return [ord(c) >> 5 for c in hrp] + [0] + [ord(c) & 31 for c in hrp]


def to_base32(data: bytes):
    acc, bits, out = 0, 0, []
    for byte in data:
        acc = (acc << 8) | byte
        bits += 8
        while bits >= 5:
            bits -= 5
            out.append((acc >> bits) & 31)
    if bits:
        out.append((acc << (5 - bits)) & 31)
    return out


def segwit_v0_address(hrp: str, program: bytes) -> str:
    data = [0] + to_base32(program)
    polymod = bech32_polymod(hrp_expand(hrp) + data + [0] * 6) ^ 1  # BIP173 bech32
    checksum = [(polymod >> 5 * (5 - i)) & 31 for i in range(6)]
    return hrp + '1' + ''.join(BECH32_CHARSET[d] for d in data + checksum)


def bitcoin(seed: bytes, coin: int, hrp: str):
    account_path = f"m/84'/{coin}'/0'"
    receive_path = account_path + '/0/0'
    account = bip32_derive(seed, account_path)
    receive = bip32_derive(seed, receive_path)
    return {
        'accountPath': account_path,
        'firstReceivePath': receive_path,
        'accountXpub': xpub(account),
        'firstReceiveAddress': segwit_v0_address(hrp, hash160(compressed(ec_mul(receive['key'])))),
    }


# ---------------------------------------------------------------- Ed25519 (RFC 8032)

EP = 2**255 - 19
EL = 2**252 + 27742317777372353535851937790883648493
ED = -121665 * pow(121666, EP - 2, EP) % EP
EGY = 4 * pow(5, EP - 2, EP) % EP


def ed_recover_x(y, sign):
    x2 = (y * y - 1) * pow(ED * y * y + 1, EP - 2, EP) % EP
    x = pow(x2, (EP + 3) // 8, EP)
    if (x * x - x2) % EP:
        x = x * pow(2, (EP - 1) // 4, EP) % EP
    if x & 1 != sign:
        x = EP - x
    return x


EG = (ed_recover_x(EGY, 0), EGY, 1, ed_recover_x(EGY, 0) * EGY % EP)


def ed_add(a, b):
    A = (a[1] - a[0]) * (b[1] - b[0]) % EP
    B = (a[1] + a[0]) * (b[1] + b[0]) % EP
    C = 2 * a[3] * b[3] * ED % EP
    D = 2 * a[2] * b[2] % EP
    E, F, G_, H = B - A, D - C, D + C, B + A
    return E * F % EP, G_ * H % EP, F * G_ % EP, E * H % EP


def ed_mul(s, point):
    result = (0, 1, 1, 0)
    while s:
        if s & 1:
            result = ed_add(result, point)
        point = ed_add(point, point)
        s >>= 1
    return result


def ed_public_key(seed32: bytes) -> bytes:
    h = hashlib.sha512(seed32).digest()
    scalar = int.from_bytes(h[:32], 'little')
    scalar &= (1 << 254) - 8
    scalar |= 1 << 254
    x, y, z, _ = ed_mul(scalar, EG)
    zinv = pow(z, EP - 2, EP)
    x, y = x * zinv % EP, y * zinv % EP
    return (y | ((x & 1) << 255)).to_bytes(32, 'little')


def slip10_ed25519(seed: bytes, path: str) -> bytes:
    digest = hmac.new(b'ed25519 seed', seed, hashlib.sha512).digest()
    key, chain = digest[:32], digest[32:]
    for index in parse_path(path):
        if not index & 0x80000000:
            raise ValueError('SLIP-10 Ed25519 needs hardened indexes')
        digest = hmac.new(chain, b'\0' + key + struct.pack('>I', index), hashlib.sha512).digest()
        key, chain = digest[:32], digest[32:]
    return key


# ---------------------------------------------------------------- TON v4r2

V4R2_CODE_BOC = (
    'te6ccgECFAEAAtQAART/APSkE/S88sgLAQIBIAIDAgFIBAUE+PKDCNcYINMf0x/THwL4I7vyZO1E0NMf0x/T//QE0VFDuvKhUVG68qIF+QFUEGT5EPKj'
    '+AAkpMjLH1JAyx9SMMv/UhD0AMntVPgPAdMHIcAAn2xRkyDXSpbTB9QC+wDoMOAhwAHjACHAAuMAAcADkTDjDQOkyMsfEssfy/8QERITAubQAdDTAyFx'
    'sJJfBOAi10nBIJJfBOAC0x8hghBwbHVnvSKCEGRzdHK9sJJfBeAD+kAwIPpEAcjKB8v/ydDtRNCBAUDXIfQEMFyBAQj0Cm+hMbOSXwfgBdM/yCWCEHBs'
    'dWe6kjgw4w0DghBkc3RyupJfBuMNBgcCASAICQB4AfoA9AQw+CdvIjBQCqEhvvLgUIIQcGx1Z4MesXCAGFAEywUmzxZY+gIZ9ADLaRfLH1Jgyz8gyYBA'
    '+wAGAIpQBIEBCPRZMO1E0IEBQNcgyAHPFvQAye1UAXKwjiOCEGRzdHKDHrFwgBhQBcsFUAPPFiP6AhPLassfyz/JgED7AJJfA+ICASAKCwBZvSQrb2om'
    'hAgKBrkPoCGEcNQICEekk30pkQzmkD6f+YN4EoAbeBAUiYcVnzGEAgFYDA0AEbjJftRNDXCx+AA9sp37UTQgQFA1yH0BDACyMoHy//J0AGBAQj0Cm+h'
    'MYAIBIA4PABmtznaiaEAga5Drhf/AABmvHfaiaEAQa5DrhY/AAG7SB/oA1NQi+QAFyMoHFcv/ydB3dIAYyMsFywIizxZQBfoCFMtrEszMyXP7AMhAFIEB'
    'CPRR8qcCAHCBAQjXGPoA0z/IVCBHgQEI9FHyp4IQbm90ZXB0gBjIywXLAlAGzxZQBPoCFMtqEssfyz/Jc/sAAgBsgQEI1xj6ANM/MFIkgQEI9Fnyp4IQ'
    'ZHN0cnB0gBjIywXLAlAFzxZQA/oCE8tqyx8Syz/Jc/sAAAr0AMntVA=='
)
V4R2_CODE_HASH = 'feb5ff6820e2ff0d9483e7e0d62c817d846789fb4ae580c878866d959dabd5c0'


class Cell:
    def __init__(self, bits: str, refs=()):
        self.bits, self.refs = bits, list(refs)

    def depth(self) -> int:
        return 0 if not self.refs else 1 + max(ref.depth() for ref in self.refs)

    def data(self) -> bytes:
        bits = self.bits
        if len(bits) % 8:
            bits += '1' + '0' * (7 - len(bits) % 8)
        return int(bits, 2).to_bytes(len(bits) // 8, 'big') if bits else b''

    def hash(self) -> bytes:
        d1 = len(self.refs)
        d2 = (len(self.bits) + 7) // 8 + len(self.bits) // 8
        out = bytes([d1, d2]) + self.data()
        out += b''.join(ref.depth().to_bytes(2, 'big') for ref in self.refs)
        out += b''.join(ref.hash() for ref in self.refs)
        return hashlib.sha256(out).digest()


def parse_boc(boc: bytes) -> Cell:
    if boc[:4] != bytes.fromhex('b5ee9c72'):
        raise ValueError('not a BOC')
    flags = boc[4]
    has_idx, size = flags & 0x80, flags & 0x07
    off_bytes = boc[5]
    pos = 6
    read = lambda n: int.from_bytes(boc[pos:pos + n], 'big')
    cells = read(size); pos += size
    roots = read(size); pos += size
    pos += size  # absent
    pos += off_bytes  # total cell size
    root_indexes = []
    for _ in range(roots):
        root_indexes.append(read(size)); pos += size
    if has_idx:
        pos += cells * off_bytes
    raw = []
    for _ in range(cells):
        d1, d2 = boc[pos], boc[pos + 1]
        pos += 2
        if d1 & 0x08 or d1 >> 5:
            raise ValueError('exotic or levelled cell')
        length = (d2 + 1) // 2
        data = boc[pos:pos + length]
        pos += length
        bits = ''.join(f'{byte:08b}' for byte in data)
        if d2 % 2:
            bits = bits[:bits.rindex('1')]
        refs = []
        for _ in range(d1 & 0x07):
            refs.append(read(size)); pos += size
        raw.append((bits, refs))
    built = {}

    def build(index):
        if index not in built:
            bits, refs = raw[index]
            built[index] = Cell(bits, [build(ref) for ref in refs])
        return built[index]

    return build(root_indexes[0])


V4R2_CODE = parse_boc(base64.b64decode(V4R2_CODE_BOC))
if V4R2_CODE.hash().hex() != V4R2_CODE_HASH:
    raise SystemExit('v4r2 code hash mismatch')


def crc16_xmodem(data: bytes) -> int:
    crc = 0
    for byte in data:
        crc ^= byte << 8
        for _ in range(8):
            crc = ((crc << 1) ^ 0x1021) & 0xffff if crc & 0x8000 else (crc << 1) & 0xffff
    return crc


def ton_address(account_hash: bytes, bounceable: bool, testnet: bool) -> str:
    tag = (0x11 if bounceable else 0x51) | (0x80 if testnet else 0)
    body = bytes([tag, 0]) + account_hash
    return base64.urlsafe_b64encode(body + crc16_xmodem(body).to_bytes(2, 'big')).decode()


def ton(seed: bytes):
    path = "m/44'/607'/0'/0'/0'"
    public = ed_public_key(slip10_ed25519(seed, path))
    wallet_id = 698983191
    data = Cell(f'{0:032b}{wallet_id:032b}' + ''.join(f'{b:08b}' for b in public) + '0')
    state_init = Cell('00110', [V4R2_CODE, data])
    account_hash = state_init.hash()
    return {
        'derivationPath': path,
        'walletVersion': 'v4r2',
        'workchain': 0,
        'publicKeyHex': public.hex(),
        'addressBounceable': ton_address(account_hash, True, False),
        'addressNonBounceable': ton_address(account_hash, False, False),
        'testnetNonBounceable': ton_address(account_hash, False, True),
    }


# ---------------------------------------------------------------- Iroha i105

# The 47 kana of the Iroha poem in half-width katakana. WI and WE have no
# half-width form, so they use the full-width characters.
IROHA_POEM = 'ｲﾛﾊﾆﾎﾍﾄﾁﾘﾇﾙｦﾜｶﾖﾀﾚｿﾂﾈﾅﾗﾑｳヰﾉｵｸﾔﾏｹﾌｺｴﾃｱｻｷﾕﾒﾐｼヱﾋﾓｾｽ'
I105_ALPHABET = B58 + IROHA_POEM
assert len(IROHA_POEM) == 47 and len(I105_ALPHABET) == 105


def i105(canonical: bytes, sentinel: str) -> str:
    value = int.from_bytes(canonical, 'big')
    digits = []
    while value:
        value, rem = divmod(value, 105)
        digits.append(rem)
    digits = [0] * (len(canonical) - len(canonical.lstrip(b'\0'))) + digits[::-1]
    values = hrp_expand('snx') + to_base32(canonical) + [0] * 6
    polymod = bech32_polymod(values) ^ 0x2bc830a3  # bech32m
    checksum = [(polymod >> 5 * (5 - i)) & 31 for i in range(6)]
    return sentinel + ''.join(I105_ALPHABET[d] for d in digits + checksum)


def iroha(seed: bytes):
    path = "m/44'/617'/0'/0'"
    public = ed_public_key(slip10_ed25519(seed, path))
    canonical = bytes([0x02, 0x00, 0x01, 0x20]) + public
    entry = lambda sentinel, discriminant: {
        'publicKeyHex': public.hex(),
        'canonicalHex': '0x' + canonical.hex(),
        'i105': i105(canonical, sentinel),
        'chainDiscriminant': discriminant,
    }
    return {'derivationPath': path, 'taira': entry('test', 369), 'nexus': entry('sora', 753)}


def solana(seed: bytes):
    path = "m/44'/501'/0'/0'"
    public = ed_public_key(slip10_ed25519(seed, path))
    return {'derivationPath': path, 'publicKeyHex': public.hex(), 'address': base58(public)}


def universal_accounts(mnemonic: str, passphrase: str):
    seed = bip39_seed(mnemonic, passphrase)
    return {
        'bitcoin': {'mainnet': bitcoin(seed, 0, 'bc'), 'testnet': bitcoin(seed, 1, 'tb')},
        'solana': solana(seed),
        'ton': ton(seed),
        'iroha': iroha(seed),
    }


# ---------------------------------------------------------------- vectors

IMPORT12 = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'
DEFAULT24 = ('abandon amount liar amount expire adjust cage candy arch gather drum bullet absurd math era live '
             'bid rhythm alien crouch range attend journey unaware')
# NFC input: precomposed umlauts and full-width Latin, which NFKD rewrites.
UNICODE_PASSPHRASE = 'pässwörd ＦＷ'


def passphrase_vectors():
    cases = [
        ('import12-trezor', IMPORT12, 12, 'TREZOR'),
        ('default24-unicode', DEFAULT24, 24, UNICODE_PASSPHRASE),
    ]
    vectors = []
    for case_id, mnemonic, words, passphrase in cases:
        vectors.append({
            'id': case_id,
            'mnemonic': mnemonic,
            'wordCount': words,
            'passphrase': passphrase,
            'passphraseNfkdUtf8Hex': unicodedata.normalize('NFKD', passphrase).encode('utf-8').hex(),
            'expected': universal_accounts(mnemonic, passphrase),
        })
    return vectors


PASSPHRASE_SOURCES = [
    {'id': 'substrate-path-password', 'substrateDerivationPath': '//polkadot///TREZOR',
     'ethereumPathPassword': None, 'passphrase': 'TREZOR'},
    {'id': 'substrate-password-only', 'substrateDerivationPath': '///TREZOR',
     'ethereumPathPassword': None, 'passphrase': 'TREZOR'},
    {'id': 'ethereum-path-password', 'substrateDerivationPath': '//polkadot',
     'ethereumPathPassword': 'TREZOR', 'passphrase': 'TREZOR'},
    {'id': 'substrate-password-wins', 'substrateDerivationPath': '//polkadot///TREZOR',
     'ethereumPathPassword': 'other', 'passphrase': 'TREZOR'},
    {'id': 'path-without-password', 'substrateDerivationPath': '//polkadot',
     'ethereumPathPassword': None, 'passphrase': ''},
    {'id': 'no-paths', 'substrateDerivationPath': '', 'ethereumPathPassword': None, 'passphrase': ''},
]


def document():
    return {
        'version': 1,
        'generatedAt': '2026-10-31',
        'derivationSpec': 'Fearless Universal Wallet V2 with the wallet password as the BIP39 passphrase',
        'passphraseRule': (
            "The BIP39 passphrase is the password after '///' in the wallet's Substrate derivation path, "
            "or, when that path has none, the password after '///' in its Ethereum derivation path. It is "
            "NFKD-normalised as BIP39 specifies. Without a password the passphrase is empty and the accounts "
            "are the v2 ones in universal-wallet-v2-vectors.json. Paths and derivation are unchanged."
        ),
        'generator': ('fearless-wallet-web scripts/generate-universal-wallet-passphrase-vectors.py '
                      '(Python standard library only, no client code)'),
        'vectors': passphrase_vectors(),
        'passphraseSources': PASSPHRASE_SOURCES,
        'negativeCases': [
            {'id': 'password-ignored',
             'reason': 'A password wallet must not resolve to the no-password v2 addresses.'},
            {'id': 'passphrase-not-normalised',
             'reason': 'Deriving from the NFC bytes of default24-unicode gives different addresses than NFKD.'},
            {'id': 'path-is-not-password',
             'reason': 'A derivation path without ///password leaves the passphrase empty.'},
        ],
    }


def check_v2(path: str):
    with open(path, encoding='utf-8') as handle:
        fixture = json.load(handle)
    for vector in fixture['vectors']:
        derived = universal_accounts(vector['mnemonic'], '')
        expected = vector['expected']
        for key in ('bitcoin', 'solana', 'ton', 'iroha'):
            if derived[key] != expected[key]:
                raise SystemExit(f"{vector['id']} {key} differs:\n{json.dumps(derived[key], ensure_ascii=False)}\n"
                                 f"{json.dumps(expected[key], ensure_ascii=False)}")
    print(f"v2 fixture reproduced: {len(fixture['vectors'])} vectors, bitcoin/solana/ton/iroha")


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--check-v2', metavar='V2_JSON')
    args = parser.parse_args()
    if args.check_v2:
        check_v2(args.check_v2)
    else:
        sys.stdout.write(json.dumps(document(), indent=2) + '\n')
