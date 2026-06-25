import { getBitcoinAddressNetwork, isBitcoinAddress } from '@/util/bitcoin';

const MAINNET_P2WPKH = 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4';
const TESTNET_P2WPKH = 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx';
const MAINNET_P2WSH = 'bc1qqyqszqgpqyqszqgpqyqszqgpqyqszqgpqyqszqgpqyqszqgpqyqsw9e2a9';

describe('Bitcoin BIP84 address validation', () => {
  it('accepts mainnet and testnet native SegWit P2WPKH addresses', () => {
    expect(getBitcoinAddressNetwork(MAINNET_P2WPKH)).toBe('mainnet');
    expect(getBitcoinAddressNetwork(TESTNET_P2WPKH)).toBe('testnet');
    expect(getBitcoinAddressNetwork(MAINNET_P2WPKH.toUpperCase())).toBe('mainnet');

    expect(isBitcoinAddress(MAINNET_P2WPKH, 'mainnet')).toBe(true);
    expect(isBitcoinAddress(TESTNET_P2WPKH, 'testnet')).toBe(true);
  });

  it('rejects wrong-network, malformed, and checksum-corrupted addresses', () => {
    expect(isBitcoinAddress(MAINNET_P2WPKH, 'testnet')).toBe(false);
    expect(isBitcoinAddress(TESTNET_P2WPKH, 'mainnet')).toBe(false);
    expect(isBitcoinAddress(`${MAINNET_P2WPKH.slice(0, -1)}q`)).toBe(false);
    expect(isBitcoinAddress(` ${MAINNET_P2WPKH}`)).toBe(false);
    expect(isBitcoinAddress('bc1qw508D6qejxtdg4y5r3zarvary0c5xw7kv8f3t4')).toBe(false);
    expect(isBitcoinAddress('0x0000000000000000000000000000000000000001')).toBe(false);
  });

  it('keeps the current wallet scope to BIP84 P2WPKH addresses', () => {
    expect(isBitcoinAddress(MAINNET_P2WSH, 'mainnet')).toBe(false);
  });
});
