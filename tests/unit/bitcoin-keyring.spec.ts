import vectors from '../../docs/universal-wallet-v2-vectors.json';
import {
  BITCOIN_MAINNET_FIRST_RECEIVE_PATH,
  BITCOIN_TESTNET_FIRST_RECEIVE_PATH,
  buildBitcoinReceiveSuri,
  deriveBitcoinKey,
  deriveBitcoinReceiveAddress,
  getBitcoinFirstReceivePath,
  getBitcoinKeypairType,
  getBitcoinReceivePath,
} from '@/util/bitcoinKeyring';

describe('Bitcoin keyring derivation', () => {
  it('matches the shared Universal Wallet V2 BIP84 receive-address vectors', () => {
    for (const vector of vectors.vectors) {
      expect(deriveBitcoinReceiveAddress({ mnemonicOrSeed: vector.mnemonic, network: 'mainnet' })).toBe(
        vector.expected.bitcoin.mainnet.firstReceiveAddress
      );
      expect(deriveBitcoinReceiveAddress({ mnemonicOrSeed: vector.mnemonic, network: 'testnet' })).toBe(
        vector.expected.bitcoin.testnet.firstReceiveAddress
      );
    }
  });

  it('centralizes the BIP84 receive paths and keypair types', () => {
    expect(getBitcoinFirstReceivePath('mainnet')).toBe(BITCOIN_MAINNET_FIRST_RECEIVE_PATH);
    expect(getBitcoinFirstReceivePath('testnet')).toBe(BITCOIN_TESTNET_FIRST_RECEIVE_PATH);
    expect(getBitcoinReceivePath('mainnet', 7)).toBe("m/84'/0'/0'/0/7");
    expect(getBitcoinReceivePath('testnet', 7)).toBe("m/84'/1'/0'/0/7");
    expect(getBitcoinReceivePath('mainnet', 2, 1)).toBe("m/84'/0'/0'/1/2");
    expect(getBitcoinKeypairType('mainnet')).toBe('bitcoin-84');
    expect(getBitcoinKeypairType('testnet')).toBe('bittest-84');
  });

  it('rejects unsafe Bitcoin receive path indexes', () => {
    expect(() => getBitcoinReceivePath('mainnet', -1)).toThrow('Invalid Bitcoin receive index');
    expect(() => getBitcoinReceivePath('mainnet', 0.5)).toThrow('Invalid Bitcoin receive index');
    expect(() => getBitcoinReceivePath('mainnet', 0, 2)).toThrow('Invalid Bitcoin change index');
  });

  it('derives signing material without changing the public receive address', () => {
    const vector = vectors.vectors[0];
    const key = deriveBitcoinKey({ mnemonicOrSeed: vector.mnemonic, network: 'mainnet' });

    expect(key.path).toBe(BITCOIN_MAINNET_FIRST_RECEIVE_PATH);
    expect(key.address).toBe(vector.expected.bitcoin.mainnet.firstReceiveAddress);
    expect(key.privateKey).toHaveLength(32);
    expect(key.publicKey).toHaveLength(33);
  });

  it('normalizes custom receive paths into Subwallet SURI format', () => {
    expect(
      buildBitcoinReceiveSuri({
        mnemonicOrSeed: 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',
        path: "m/84'/0'/0'/0/1",
      })
    ).toBe("abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about/m/84'/0'/0'/0/1");
  });
});
