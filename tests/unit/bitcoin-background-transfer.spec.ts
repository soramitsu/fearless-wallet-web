import * as bitcoin from 'bitcoinjs-lib';

import {
  bitcoinAmountToSats,
  estimateBitcoinTransferFee,
  getBitcoinNetworkKind,
  makeBitcoinTransfer,
  normalizeRecipient,
  prepareBitcoinTransferForTest,
  resolveBitcoinTransferSource,
  satsToBitcoinString,
} from '@extension-base/api/bitcoin/transfer';
import vectors from '../../docs/universal-wallet-v2-vectors.json';
import type { BitcoinEsploraUtxo } from '@extension-base/services/bitcoin-indexer-service';
import type { NetworkJson } from '@extension-base/types';
import type State from '@extension-base/background/handlers/State';
import { WalletEcosystem } from '@/interfaces';

const mnemonic = vectors.vectors[0].mnemonic;
const mainnetAddress = vectors.vectors[0].expected.bitcoin.mainnet.firstReceiveAddress;
const testnetAddress = vectors.vectors[0].expected.bitcoin.testnet.firstReceiveAddress;
const recipient = vectors.vectors[1].expected.bitcoin.mainnet.firstReceiveAddress;

const network = (name: string, chainId: string): NetworkJson =>
  ({
    active: true,
    addressPrefix: 0,
    assets: [],
    chain: name,
    chainId,
    currentProvider: 'indexer',
    customNodes: [],
    disabled: false,
    ecosystem: 'bitcoin',
    favorite: [],
    genesisHash: `0x${chainId}`,
    icon: 'bitcoin',
    key: name,
    name,
    nodes: [],
    options: chainId.includes('testnet') ? ['testnet'] : [],
    providers: {},
    ss58Format: 0,
    types: { name, url: '' },
  }) as unknown as NetworkJson;

const confirmedUtxo = (value: number, txid = '11'.repeat(32), vout = 0): BitcoinEsploraUtxo => ({
  status: { confirmed: true, block_hash: '22'.repeat(32), block_height: 100, block_time: 1_700_000_000 },
  txid,
  value,
  vout,
});

const createState = ({
  seed = mnemonic,
  sourceMainnet = mainnetAddress,
  sourceTestnet = testnetAddress,
}: {
  seed?: string;
  sourceMainnet?: string;
  sourceTestnet?: string;
} = {}) =>
  ({
    balanceService: {
      fetchBalance: vi.fn(async () => []),
    },
    keyringService: {
      exportMnemonic: vi.fn(() => ({ seed })),
      getAllAccounts: vi.fn(() => [
        {
          address: 'stored-substrate-account',
          meta: {
            bitcoinAddress: sourceMainnet,
            bitcoinTestnetAddress: sourceTestnet,
            walletEcosystem: WalletEcosystem.Substrate,
          },
        },
      ]),
    },
    networkService: {
      networkMap: {
        Bitcoin: network('Bitcoin', 'bitcoin:mainnet'),
        'Bitcoin Testnet': network('Bitcoin Testnet', 'bitcoin:testnet'),
      },
    },
  }) as unknown as State;

describe('background Bitcoin transfer adapter', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('normalizes BTC amounts and display fees without floating point loss', () => {
    expect(bitcoinAmountToSats('0.00000001')).toBe(1);
    expect(bitcoinAmountToSats('1.23456789')).toBe(123_456_789);
    expect(satsToBitcoinString(123_456_789)).toBe('1.23456789');
    expect(satsToBitcoinString(100_000_000)).toBe('1');

    expect(() => bitcoinAmountToSats('0')).toThrow('invalid_bitcoin_amount');
    expect(() => bitcoinAmountToSats('0.000000001')).toThrow('invalid_bitcoin_amount');
    expect(() => bitcoinAmountToSats('-1')).toThrow('invalid_bitcoin_amount');
    expect(() => bitcoinAmountToSats('21000001')).toThrow('invalid_bitcoin_amount');
  });

  it('detects Bitcoin mainnet and testnet from registry metadata', () => {
    expect(getBitcoinNetworkKind(network('Bitcoin', 'bitcoin:mainnet'))).toBe('mainnet');
    expect(getBitcoinNetworkKind(network('Bitcoin Testnet', 'bitcoin:testnet'))).toBe('testnet');
    expect(() => getBitcoinNetworkKind({ ecosystem: 'substrate' } as NetworkJson)).toThrow('unsupported_bitcoin_network');
  });

  it('resolves the stored wallet account, mnemonic, network address, and BIP84 source path', () => {
    const state = createState();
    const mainnetSource = resolveBitcoinTransferSource(state, 'stored-substrate-account', 'mainnet');
    const testnetSource = resolveBitcoinTransferSource(state, testnetAddress, 'testnet');

    expect(mainnetSource.source).toEqual({
      address: mainnetAddress,
      derivationPath: "m/84'/0'/0'/0/0",
    });
    expect(testnetSource.source).toEqual({
      address: testnetAddress,
      derivationPath: "m/84'/1'/0'/0/0",
    });
    expect(mainnetSource.mnemonicOrSeed).toBe(mnemonic);
    expect(state.keyringService.exportMnemonic).toHaveBeenCalledWith({
      address: 'stored-substrate-account',
      walletEcosystem: WalletEcosystem.Substrate,
    });
  });

  it('rejects missing source metadata, unavailable mnemonic, and wrong-network recipients', () => {
    expect(() =>
      resolveBitcoinTransferSource(createState({ sourceTestnet: '' }), 'stored-substrate-account', 'testnet')
    ).toThrow('invalid_bitcoin_source_address');
    expect(() => resolveBitcoinTransferSource(createState({ seed: '' }), mainnetAddress, 'mainnet')).toThrow(
      'bitcoin_mnemonic_unavailable'
    );
    expect(() => normalizeRecipient(testnetAddress, 'mainnet')).toThrow('invalid_bitcoin_recipient');
  });

  it('estimates fees through Esplora fee estimates without fetching UTXOs', async () => {
    const client = {
      getFeeEstimates: vi.fn(async () => ({ 1: 5, 3: 2 })),
    };

    await expect(estimateBitcoinTransferFee({ client, network: 'mainnet' })).resolves.toBe('0.00000282');
    expect(client.getFeeEstimates).toHaveBeenCalledTimes(1);
  });

  it('prepares, signs, broadcasts, and schedules a Bitcoin balance refresh', async () => {
    vi.useFakeTimers();

    const state = createState();
    const callback = vi.fn();
    const client = {
      broadcastTransaction: vi.fn(async (txHex: string) => bitcoin.Transaction.fromHex(txHex).getId()),
      getFeeEstimates: vi.fn(async () => ({ 1: 2 })),
      getUtxos: vi.fn(async () => [confirmedUtxo(100_000)]),
    };

    const prepared = await prepareBitcoinTransferForTest(
      {
        amount: '0.0005',
        callback,
        from: 'stored-substrate-account',
        networkKey: 'Bitcoin',
        state,
        to: recipient,
      },
      client
    );

    await makeBitcoinTransfer(
      {
        amount: '0.0005',
        callback,
        from: 'stored-substrate-account',
        networkKey: 'Bitcoin',
        state,
        to: recipient,
      },
      client
    );

    expect(prepared.txid).toBe(bitcoin.Transaction.fromHex(prepared.txHex).getId());
    expect(client.getUtxos).toHaveBeenCalledWith(mainnetAddress);
    expect(client.broadcastTransaction).toHaveBeenCalledWith(expect.stringMatching(/^[0-9a-f]+$/u));
    expect(callback).toHaveBeenCalledWith({ status: true });

    await vi.advanceTimersByTimeAsync(8000);
    expect(state.balanceService.fetchBalance).toHaveBeenCalledWith({
      address: 'stored-substrate-account',
      bitcoinAddress: mainnetAddress,
      bitcoinNetworks: ['Bitcoin'],
      bitcoinTestnetAddress: testnetAddress,
      ethereumAddress: '',
      walletEcosystem: WalletEcosystem.Bitcoin,
    });
  });

  it('passes explicit Bitcoin fee and coin-control options into send preparation', async () => {
    const selectedTxid = '55'.repeat(32);
    const state = createState();
    const client = {
      broadcastTransaction: vi.fn(async (txHex: string) => bitcoin.Transaction.fromHex(txHex).getId()),
      getFeeEstimates: vi.fn(async () => ({ 1: 50 })),
      getUtxos: vi.fn(async () => [
        confirmedUtxo(250_000, '66'.repeat(32), 0),
        confirmedUtxo(70_000, selectedTxid, 2),
      ]),
    };

    const prepared = await prepareBitcoinTransferForTest(
      {
        amount: '0.0005',
        bitcoinFeeRateSatPerVbyte: 1,
        bitcoinMaxInputs: 1,
        bitcoinSelectedOutpoints: [{ txid: selectedTxid, vout: 2 }],
        callback: vi.fn(),
        from: 'stored-substrate-account',
        networkKey: 'Bitcoin',
        state,
        to: recipient,
      },
      client
    );

    expect(prepared.feeRateSatPerVbyte).toBe(1);
    expect(prepared.inputTotal).toBe(70_000);
    expect(prepared.selectedUtxos).toEqual([expect.objectContaining({ txid: selectedTxid, vout: 2 })]);
    expect(client.getFeeEstimates).not.toHaveBeenCalled();
  });
});
