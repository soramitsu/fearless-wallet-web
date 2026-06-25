import vectors from '../../docs/universal-wallet-v2-vectors.json';
import {
  BITCOIN_DISCOVERY_MAX_LOOKAHEAD,
  BitcoinDiscoveryError,
  discoverBitcoinReceiveAddresses,
  type BitcoinDiscoveryClient,
} from '@/util/bitcoinDiscovery';
import { deriveBitcoinReceiveAddress, getBitcoinReceivePath } from '@/util/bitcoinKeyring';
import { UNIVERSAL_WALLET_BITCOIN_NETWORKS } from '@/consts/universalWallet';

const mnemonic = vectors.vectors[0].mnemonic;

function addressStats(address: string, txCount = 0) {
  return {
    address,
    chain_stats: {
      funded_txo_count: txCount,
      funded_txo_sum: 0,
      spent_txo_count: 0,
      spent_txo_sum: 0,
      tx_count: txCount,
    },
    mempool_stats: {
      funded_txo_count: 0,
      funded_txo_sum: 0,
      spent_txo_count: 0,
      spent_txo_sum: 0,
      tx_count: 0,
    },
  };
}

function mockDiscoveryClient(usedIndexes: number[]): BitcoinDiscoveryClient {
  return {
    getAddress: vi.fn(async (address: string) => {
      const used = usedIndexes.some((index) => {
        const expectedAddress = deriveBitcoinReceiveAddress({
          mnemonicOrSeed: mnemonic,
          path: getBitcoinReceivePath('mainnet', index),
        });

        return expectedAddress === address;
      });

      return addressStats(address, used ? 1 : 0);
    }),
  };
}

describe('Bitcoin receive address discovery', () => {
  it('scans until the configured unused gap after the last used receive address', async () => {
    const client = mockDiscoveryClient([0, 2]);

    await expect(
      discoverBitcoinReceiveAddresses({
        client,
        gapLimit: 3,
        maxLookahead: 20,
        mnemonicOrSeed: mnemonic,
      })
    ).resolves.toMatchObject({
      gapLimit: 3,
      lastUsedIndex: 2,
      nextReceiveIndex: 3,
      nextReceivePath: "m/84'/0'/0'/0/3",
      stopReason: 'gap_limit',
      usedAddresses: [
        expect.objectContaining({ index: 0, used: true }),
        expect.objectContaining({ index: 2, used: true }),
      ],
    });

    expect(client.getAddress).toHaveBeenCalledTimes(6);
  });

  it('returns index zero as the next receive address for an empty wallet', async () => {
    const client = mockDiscoveryClient([]);
    const result = await discoverBitcoinReceiveAddresses({
      client,
      gapLimit: 2,
      mnemonicOrSeed: mnemonic,
    });

    expect(result).toMatchObject({
      addresses: [
        expect.objectContaining({ index: 0, used: false }),
        expect.objectContaining({ index: 1, used: false }),
      ],
      lastUsedIndex: null,
      nextReceiveIndex: 0,
      usedAddresses: [],
    });
    expect(result.nextReceiveAddress).toBe(vectors.vectors[0].expected.bitcoin.mainnet.firstReceiveAddress);
  });

  it('treats mempool-only activity as used during restore rescans', async () => {
    const firstAddress = deriveBitcoinReceiveAddress({
      mnemonicOrSeed: mnemonic,
      path: getBitcoinReceivePath('mainnet', 0),
    });
    const client: BitcoinDiscoveryClient = {
      getAddress: vi.fn(async (address: string) => ({
        ...addressStats(address, 0),
        mempool_stats: {
          ...addressStats(address, 0).mempool_stats,
          tx_count: address === firstAddress ? 1 : 0,
        },
      })),
    };

    const result = await discoverBitcoinReceiveAddresses({
      client,
      gapLimit: 2,
      mnemonicOrSeed: mnemonic,
    });

    expect(result.lastUsedIndex).toBe(0);
    expect(result.nextReceiveIndex).toBe(1);
    expect(result.usedAddresses).toEqual([expect.objectContaining({ address: firstAddress, index: 0, used: true })]);
    expect(client.getAddress).toHaveBeenCalledTimes(3);
  });

  it('uses the registry gap limit when no override is provided', async () => {
    const client = mockDiscoveryClient([]);
    const result = await discoverBitcoinReceiveAddresses({
      client,
      mnemonicOrSeed: mnemonic,
    });

    expect(result.gapLimit).toBe(UNIVERSAL_WALLET_BITCOIN_NETWORKS.mainnet.defaultGapLimit);
    expect(client.getAddress).toHaveBeenCalledTimes(UNIVERSAL_WALLET_BITCOIN_NETWORKS.mainnet.defaultGapLimit);
  });

  it('derives testnet receive addresses when scanning testnet', async () => {
    const client: BitcoinDiscoveryClient = {
      getAddress: vi.fn(async (address: string) => addressStats(address, 0)),
    };
    const result = await discoverBitcoinReceiveAddresses({
      client,
      gapLimit: 1,
      mnemonicOrSeed: mnemonic,
      network: 'testnet',
    });

    expect(result.addresses[0].address).toBe(vectors.vectors[0].expected.bitcoin.testnet.firstReceiveAddress);
    expect(client.getAddress).toHaveBeenCalledWith(vectors.vectors[0].expected.bitcoin.testnet.firstReceiveAddress);
  });

  it('rejects unsafe discovery parameters before indexer calls', async () => {
    const client = mockDiscoveryClient([]);

    await expect(discoverBitcoinReceiveAddresses({ client, mnemonicOrSeed: '', gapLimit: 2 })).rejects.toThrow(
      BitcoinDiscoveryError
    );
    await expect(discoverBitcoinReceiveAddresses({ client, mnemonicOrSeed: mnemonic, gapLimit: 0 })).rejects.toThrow(
      BitcoinDiscoveryError
    );
    await expect(discoverBitcoinReceiveAddresses({ client, mnemonicOrSeed: mnemonic, gapLimit: 101 })).rejects.toThrow(
      BitcoinDiscoveryError
    );
    await expect(
      discoverBitcoinReceiveAddresses({ client, mnemonicOrSeed: mnemonic, gapLimit: 5, maxLookahead: 4 })
    ).rejects.toThrow(BitcoinDiscoveryError);
    await expect(
      discoverBitcoinReceiveAddresses({
        client,
        mnemonicOrSeed: mnemonic,
        gapLimit: 5,
        maxLookahead: BITCOIN_DISCOVERY_MAX_LOOKAHEAD + 1,
      })
    ).rejects.toThrow(BitcoinDiscoveryError);
    expect(client.getAddress).not.toHaveBeenCalled();
  });

  it('fails loudly when max lookahead is exhausted before the unused gap is reached', async () => {
    const client = mockDiscoveryClient([0]);

    await expect(
      discoverBitcoinReceiveAddresses({
        client,
        gapLimit: 3,
        maxLookahead: 3,
        mnemonicOrSeed: mnemonic,
      })
    ).rejects.toMatchObject({ message: 'bitcoin_discovery_lookahead_exhausted' });
  });

  it('rejects impossible transaction counts from an indexer response', async () => {
    const client: BitcoinDiscoveryClient = {
      getAddress: vi.fn(async (address: string) => ({
        ...addressStats(address, 0),
        chain_stats: { ...addressStats(address, 0).chain_stats, tx_count: Number.MAX_SAFE_INTEGER },
        mempool_stats: { ...addressStats(address, 0).mempool_stats, tx_count: 1 },
      })),
    };

    await expect(
      discoverBitcoinReceiveAddresses({
        client,
        gapLimit: 1,
        mnemonicOrSeed: mnemonic,
      })
    ).rejects.toMatchObject({ message: 'invalid_transaction_count' });
  });
});
