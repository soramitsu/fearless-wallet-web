import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from 'tiny-secp256k1';

import { normalizeRecipient } from '@extension-base/api/bitcoin/transfer';
import vectors from '../../docs/universal-wallet-v2-vectors.json';
import {
  decodeBitcoinRecipient,
  getBitcoinDustThresholdSat,
  isBitcoinAddress,
  isBitcoinRecipientAddress,
} from '@/util/bitcoin';
import {
  buildBitcoinP2wpkhTransaction,
  estimateBitcoinTransactionVSize,
  getBitcoinMinimumOutputSat,
} from '@/util/bitcoinTransaction';

bitcoin.initEccLib(ecc);

const mnemonic = vectors.vectors[0].mnemonic;
const mainnetAddress = vectors.vectors[0].expected.bitcoin.mainnet.firstReceiveAddress;
// BIP173/BIP350/BIP86 and widely published Base58 vectors.
const RECIPIENTS = {
  mainnet: {
    p2pkh: '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2',
    p2sh: '3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy',
    p2wpkh: 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4',
    p2wsh: 'bc1qrp33g0q5c5txsp9arysrx4k6zdkfs4nce4xj0gdcccefvpysxf3qccfmv3',
    p2tr: 'bc1p5cyxnuxmeuwuvkwfem96lqzszd02n6xdcjrs20cac6yqjjwudpxqkedrcr',
  },
  testnet: {
    p2pkh: 'mipcBbFg9gMiCh81Kj8tqqdgoZub1ZJRfn',
    p2sh: '2MzQwSSnBHWHqSAqtTVQ6v47XtaisrJa1Vc',
    p2wpkh: 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx',
    p2wsh: 'tb1qrp33g0q5c5txsp9arysrx4k6zdkfs4nce4xj0gdcccefvpysxf3q0sl5k7',
    p2tr: 'tb1pqqqqp399et2xygdj5xreqhjjvcmzhxw4aywxecjdzew6hylgvsesf3hn0c',
  },
} as const;

const addressesFor = (network: bitcoin.Network) =>
  network === bitcoin.networks.bitcoin ? RECIPIENTS.mainnet : RECIPIENTS.testnet;

describe('Bitcoin recipient address types', () => {
  it.each([
    ['mainnet', bitcoin.networks.bitcoin],
    ['testnet', bitcoin.networks.testnet],
  ] as const)('decodes every supported %s recipient type to the canonical output script', (kind, network) => {
    Object.entries(addressesFor(network)).forEach(([type, address]) => {
      const recipient = decodeBitcoinRecipient(address, kind);

      expect(recipient).toMatchObject({ network: kind, type });
      expect(Buffer.from(recipient!.scriptPubKey).toString('hex')).toBe(
        bitcoin.address.toOutputScript(address, network).toString('hex')
      );
    });
  });

  it('accepts upper-case bech32 (QR codes) but never mixed case', () => {
    const address = addressesFor(bitcoin.networks.bitcoin).p2wpkh;

    expect(decodeBitcoinRecipient(address.toUpperCase(), 'mainnet')?.type).toBe('p2wpkh');
    expect(decodeBitcoinRecipient(`${address.slice(0, 6).toUpperCase()}${address.slice(6)}`, 'mainnet')).toBeNull();
    expect(normalizeRecipient(address.toUpperCase(), 'mainnet')).toBe(address);
  });

  it('keeps case-sensitive Base58 recipients exactly as entered', () => {
    const { p2pkh, p2sh } = addressesFor(bitcoin.networks.bitcoin);

    expect(normalizeRecipient(p2pkh, 'mainnet')).toBe(p2pkh);
    expect(normalizeRecipient(p2sh, 'mainnet')).toBe(p2sh);
    expect(decodeBitcoinRecipient(p2pkh.toLowerCase(), 'mainnet')).toBeNull();
  });

  it.each([
    // BIP350: a witness v1 program with a bech32 (not bech32m) checksum.
    'bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqh2y7hd',
    // BIP350: a witness v0 program with a bech32m checksum.
    'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kemeawh',
    // BIP350: witness v16 is valid bech32m but reserved for future upgrades.
    'BC1SW50QGDZ25J',
    // Witness v1 with a 20-byte program is not Taproot.
    'bc1pw508d6qejxtdg4y5r3zarvary0c5xw7kw508d6qejxtdg4y5r3zarvary0c5xw7kt5nd6y',
    // Base58 with a broken checksum.
    `${addressesFor(bitcoin.networks.bitcoin).p2pkh.slice(0, -1)}1`,
    // Regtest and unknown prefixes.
    'bcrt1qw508d6qejxtdg4y5r3zarvary0c5xw7kygt080',
    '',
    ' bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4',
  ])('rejects %j', (address) => {
    expect(decodeBitcoinRecipient(address)).toBeNull();
    expect(isBitcoinRecipientAddress(address, 'mainnet')).toBe(false);
  });

  it('refuses a recipient from the other network', () => {
    Object.values(addressesFor(bitcoin.networks.testnet)).forEach((address) => {
      expect(isBitcoinRecipientAddress(address, 'mainnet')).toBe(false);
      expect(() => normalizeRecipient(address, 'mainnet')).toThrow('invalid_bitcoin_recipient');
    });
  });

  it('keeps the wallet-owned address check limited to native SegWit P2WPKH', () => {
    const { p2pkh, p2sh, p2wsh, p2tr, p2wpkh } = addressesFor(bitcoin.networks.bitcoin);

    expect(isBitcoinAddress(p2wpkh, 'mainnet')).toBe(true);
    [p2pkh, p2sh, p2wsh, p2tr].forEach((address) => expect(isBitcoinAddress(address, 'mainnet')).toBe(false));
  });

  it("uses Bitcoin Core's dust thresholds with the wallet's 330-sat floor", () => {
    expect(getBitcoinDustThresholdSat('p2pkh')).toBe(546);
    expect(getBitcoinDustThresholdSat('p2sh')).toBe(540);
    expect(getBitcoinMinimumOutputSat('p2pkh')).toBe(546);
    expect(getBitcoinMinimumOutputSat('p2wpkh')).toBe(330);
    expect(getBitcoinMinimumOutputSat('p2tr')).toBe(330);
  });

  it('signs payments to every recipient type with an exact virtual-size estimate', () => {
    Object.entries(addressesFor(bitcoin.networks.bitcoin)).forEach(([type, address]) => {
      const result = buildBitcoinP2wpkhTransaction({
        changeAddress: mainnetAddress,
        feeRateSatPerVbyte: 3,
        inputs: [{ address: mainnetAddress, txid: '11'.repeat(32), value: 100_000, vout: 0 }],
        mnemonicOrSeed: mnemonic,
        outputs: [{ address, value: 40_000 }],
      });
      const tx = bitcoin.Transaction.fromHex(result.txHex);
      const estimate = estimateBitcoinTransactionVSize(1, [type as never, 'p2wpkh']);

      expect(tx.outs[0].script.toString('hex')).toBe(
        bitcoin.address.toOutputScript(address, bitcoin.networks.bitcoin).toString('hex')
      );
      // The estimate assumes a 72-byte signature, so it never under-pays.
      expect(estimate).toBeGreaterThanOrEqual(tx.virtualSize());
      expect(estimate - tx.virtualSize()).toBeLessThanOrEqual(1);
      expect(result.fee).toBe(estimate * 3);
    });
  });

  it('signals BIP125 replaceability on every input', () => {
    const result = buildBitcoinP2wpkhTransaction({
      feeSat: 1_000,
      inputs: [
        { address: mainnetAddress, txid: '11'.repeat(32), value: 30_000, vout: 0 },
        { address: mainnetAddress, txid: '22'.repeat(32), value: 30_000, vout: 1 },
      ],
      changeAddress: mainnetAddress,
      mnemonicOrSeed: mnemonic,
      outputs: [{ address: addressesFor(bitcoin.networks.bitcoin).p2tr, value: 20_000 }],
    });

    expect(bitcoin.Transaction.fromHex(result.txHex).ins.map(({ sequence }) => sequence)).toEqual([
      0xfffffffd, 0xfffffffd,
    ]);
  });

  it('refuses a payment below the minimum for its output type', () => {
    expect(() =>
      buildBitcoinP2wpkhTransaction({
        feeSat: 1_000,
        inputs: [{ address: mainnetAddress, txid: '11'.repeat(32), value: 30_000, vout: 0 }],
        changeAddress: mainnetAddress,
        mnemonicOrSeed: mnemonic,
        outputs: [{ address: addressesFor(bitcoin.networks.bitcoin).p2pkh, value: 545 }],
      })
    ).toThrow('invalid_output_value');
  });
});
