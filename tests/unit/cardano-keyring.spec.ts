import * as CardanoWasm from '@emurgo/cardano-serialization-lib-nodejs';
import { u8aToHex } from '@polkadot/util';
import { mnemonicToEntropy } from '@polkadot/util-crypto';
import { describe, expect, it } from 'vitest';

const MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

function harden(num: number): number {
  return 0x80000000 + num;
}

function createBaseAddress() {
  const entropy = u8aToHex(mnemonicToEntropy(MNEMONIC)).slice(2);
  const accountKey = CardanoWasm.Bip32PrivateKey.from_bip39_entropy(
    Buffer.from(entropy, 'hex'),
    Buffer.from('')
  )
    .derive(harden(1852))
    .derive(harden(1815))
    .derive(harden(0));
  const accountPubKey = accountKey.to_public();
  const paymentPubKey = accountPubKey.derive(0).derive(0);
  const stakePubKey = accountPubKey.derive(2).derive(0);

  return CardanoWasm.BaseAddress.new(
    CardanoWasm.NetworkInfo.mainnet().network_id(),
    CardanoWasm.Credential.from_keyhash(paymentPubKey.to_raw_key().hash()),
    CardanoWasm.Credential.from_keyhash(stakePubKey.to_raw_key().hash())
  )
    .to_address()
    .to_bech32();
}

describe('Cardano keyring browser build', () => {
  it('creates and re-encodes Cardano addresses through the browser WASM alias', () => {
    const firstAddress = createBaseAddress();
    const secondAddress = createBaseAddress();

    expect(firstAddress).toBe(secondAddress);
    expect(firstAddress).toMatch(/^addr1/);
    expect(CardanoWasm.Address.from_bech32(firstAddress).network_id()).toBe(1);

    const mainnetBaseAddress = CardanoWasm.BaseAddress.from_address(CardanoWasm.Address.from_bech32(firstAddress));
    const testnetAddress = CardanoWasm.BaseAddress.new(
      0,
      mainnetBaseAddress.payment_cred(),
      mainnetBaseAddress.stake_cred()
    )
      .to_address()
      .to_bech32();

    expect(testnetAddress).toMatch(/^addr_test1/);
    expect(CardanoWasm.Address.from_bech32(testnetAddress).network_id()).toBe(0);
  });

  it('rejects malformed Cardano-like addresses without executing payload-looking text', () => {
    const malformed = 'addr1<script>alert(1)</script>';

    expect(() => CardanoWasm.Address.from_bech32(malformed)).toThrow();
  });
});
