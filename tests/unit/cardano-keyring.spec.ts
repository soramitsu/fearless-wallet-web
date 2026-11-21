// Fearless has no Cardano accounts: the Cardano libraries @subwallet/keyring imports are fail-closed stubs
// (vendor/cardano-*), so no Cardano WebAssembly loads in the worker that holds the keys.
import * as CardanoWasm from '@emurgo/cardano-serialization-lib-nodejs';
import * as CardanoMessageSigning from '@emurgo/cardano-message-signing-browser';
import { Keyring as PolkadotKeyring } from '@polkadot/keyring';
import { cryptoWaitReady } from '@polkadot/util-crypto';
import { Address as TonAddress } from '@ton/core';
import Keyring from '@subwallet/keyring';
import { decodeAddress, encodeAddress } from '@subwallet/keyring/utils/address';
import { isCardanoAddress } from '@subwallet/keyring/utils/address/validate';
import { CoseLabel } from '@subwallet/keyring/utils/cardano/coseKey';
import { beforeAll, describe, expect, it, vi } from 'vitest';

// As in the other keyring specs: the keyring's unused development pair builds a TON contract on import.
vi.mock('@subwallet/keyring/pair/nobody', () => ({ nobody: () => { throw new Error('Unused development pair'); } }));

const MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
// A mainnet Cardano base address (its shape is all that matters here).
const CARDANO_ADDRESS =
  'addr1qy8ac7qqy0vtulyl7wntmsxc6wex80gvcyjy33qffrhm7sh927ysx5sftuw0dlft05dz3c7revpf7jx0xnlcjz3g69mq4afdhv';

beforeAll(() => cryptoWaitReady());

describe('Cardano libraries in the keyring', () => {
  it('are stubs that refuse every Cardano operation', () => {
    expect(() => CardanoWasm.Address.from_bech32(CARDANO_ADDRESS)).toThrow('Cardano is not supported');
    expect(() => CardanoWasm.Bip32PrivateKey.from_bip39_entropy(new Uint8Array(16), new Uint8Array())).toThrow('Cardano is not supported');
    expect(() => CardanoWasm.make_vkey_witness()).toThrow('Cardano is not supported');
    expect(() => new (CardanoWasm.Address as unknown as new () => unknown)()).toThrow('Cardano is not supported');
    expect(() => CardanoMessageSigning.COSEKey.new()).toThrow('Cardano is not supported');
  });

  it('let the keyring load: its load-time Cardano constants are inert values', () => {
    expect(CoseLabel.address).toEqual({ fearlessUnsupportedCardanoValue: true });
    expect(Object.isFrozen(CoseLabel.crv)).toBe(true);
  });

  it('are neither promises nor JSON', async () => {
    expect((CardanoWasm.Address as unknown as { then?: unknown }).then).toBeUndefined();
    expect(await Promise.resolve(CardanoWasm.Address)).toBe(CardanoWasm.Address);
    expect(JSON.stringify({ label: CoseLabel.address })).toBe('{"label":{"fearlessUnsupportedCardanoValue":true}}');
  });
});

describe('the keyring with the Cardano stubs', () => {
  it('still creates and reopens the account types Fearless uses', () => {
    const keyring = new Keyring({ type: 'sr25519' });
    const substrate = keyring.addFromUri(MNEMONIC, {}, 'sr25519');
    const ed25519 = keyring.addFromUri(MNEMONIC, {}, 'ed25519');
    const ethereum = keyring.addFromUri(`${MNEMONIC}/m/44'/60'/0'/0/0`, {}, 'ethereum');

    const reference = new PolkadotKeyring({ type: 'sr25519' });
    expect(substrate.address).toBe(reference.addFromUri(MNEMONIC).address);
    expect(ed25519.address).toBe(reference.addFromUri(MNEMONIC, {}, 'ed25519').address);
    expect(ethereum.address.toLowerCase()).toBe('0x9858effd232b4033e47d90003d41ec34ecaeda94');
    expect(substrate.verify('fixture', substrate.sign('fixture'), substrate.publicKey)).toBe(true);
  });

  it('still decodes Substrate, EVM, TON and Bitcoin addresses, and answers "not Cardano" for them', () => {
    const ss58 = new PolkadotKeyring({ type: 'sr25519' }).addFromUri(MNEMONIC).address;
    const ton = TonAddress.parseRaw(`0:${'ab'.repeat(32)}`).toString({ bounceable: false });
    expect(encodeAddress(decodeAddress(ss58), 42)).toBe(ss58);
    expect(decodeAddress('0x9858EfFD232B4033E47d90003D41EC34EcaEda94')).toHaveLength(20);
    // The keyring's TON decoding is the friendly form: tag, workchain, 32-byte hash, CRC.
    expect(decodeAddress(ton)).toHaveLength(36);
    expect(decodeAddress('bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu')).toHaveLength(20);
    for (const address of [ss58, ton, 'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu']) {
      expect(isCardanoAddress(address), address).toBe(false);
    }
  });

  it('refuses a Cardano address and a Cardano account', () => {
    expect(isCardanoAddress(CARDANO_ADDRESS)).toBe(false);
    expect(() => decodeAddress(CARDANO_ADDRESS)).toThrow();
    expect(() => new Keyring({ type: 'sr25519' }).addFromUri(MNEMONIC, {}, 'cardano')).toThrow();
  });
});
