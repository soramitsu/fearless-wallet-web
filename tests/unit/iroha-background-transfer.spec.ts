import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  estimateIrohaTransferFee,
  getIrohaNetworkKey,
  isIrohaTransferEnabled,
  makeIrohaTransfer,
  normalizeIrohaAssetDefinitionId,
  normalizeIrohaTransferAmount,
  prepareIrohaTransfer,
  resolveIrohaTransferSource,
  type IrohaTransferCodec,
} from '@extension-base/api/iroha/transfer';
import {
  createIrohaNexusSdkTransferCodec,
  type NexusTransactionCodec,
} from '@extension-base/api/iroha/nexusSdkTransferCodec';
import type State from '@extension-base/background/handlers/State';
import type { NetworkJson } from '@extension-base/types';
import { WalletEcosystem } from '@/interfaces';

const fixture = JSON.parse(
  readFileSync(resolve(__dirname, '../../docs/universal-wallet-v2-vectors.json'), 'utf8')
) as {
  vectors: Array<{
    mnemonic: string;
    expected: {
      iroha: {
        nexus: { i105: string; publicKeyHex: string };
        taira: { i105: string; publicKeyHex: string };
      };
    };
  }>;
};

const MNEMONIC = fixture.vectors[0].mnemonic;
const TAIRA_ACCOUNT_ID = fixture.vectors[0].expected.iroha.taira.i105;
const NEXUS_ACCOUNT_ID = fixture.vectors[0].expected.iroha.nexus.i105;
const IROHA_PUBLIC_KEY = fixture.vectors[0].expected.iroha.taira.publicKeyHex;
const TAIRA_COUNTERPARTY = fixture.vectors[1].expected.iroha.taira.i105;
const NEXUS_COUNTERPARTY = fixture.vectors[1].expected.iroha.nexus.i105;
const STORED_ACCOUNT = 'stored-substrate-account';
const HASH = '11'.repeat(32);
const PAYLOAD_HASH = '22'.repeat(32);

function irohaNetwork(
  name: string,
  chainId: string,
  options: Partial<NetworkJson> & { chainDiscriminant?: number } = {}
): NetworkJson {
  return {
    active: true,
    addressPrefix: 0,
    assets: [],
    chain: name,
    chainId,
    currentProvider: '',
    customNodes: [],
    disabled: false,
    ecosystem: 'iroha',
    favorite: [],
    genesisHash: chainId,
    icon: 'iroha',
    key: name,
    name,
    nodes: [],
    providers: {},
    ss58Format: 0,
    types: { name, url: '' },
    ...options,
  } as unknown as NetworkJson;
}

function createState({
  irohaAddress = TAIRA_ACCOUNT_ID,
  publicKeyHex = IROHA_PUBLIC_KEY,
  seed = MNEMONIC,
  walletEcosystem = WalletEcosystem.Iroha,
  networks = {
    Taira: irohaNetwork('Taira', 'iroha3-taira', { chainDiscriminant: 369 }),
    Nexus: irohaNetwork('Nexus', 'sora:nexus:global', { chainDiscriminant: 753 }),
  },
}: {
  irohaAddress?: string;
  publicKeyHex?: string;
  seed?: string;
  walletEcosystem?: WalletEcosystem;
  networks?: Record<string, NetworkJson>;
} = {}) {
  return {
    balanceService: {
      fetchBalance: vi.fn(async () => []),
    },
    keyringService: {
      exportMnemonic: vi.fn(() => ({ seed })),
      getAllAccounts: vi.fn(() => [
        {
          address: STORED_ACCOUNT,
          meta: {
            irohaAddress,
            irohaPublicKeyHex: publicKeyHex,
            walletEcosystem,
          },
        },
      ]),
    },
    networkService: {
      networkMap: networks,
    },
  } as unknown as State;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json' },
    status,
  });
}

function transferParams(state = createState()) {
  return {
    amount: '12.34',
    assetId: 'xor#sora',
    from: TAIRA_ACCOUNT_ID,
    networkKey: 'Taira',
    state,
    to: TAIRA_COUNTERPARTY,
  };
}

describe('background Iroha transfer adapter', () => {
  const originalEnableIrohaTransfers = process.env.VUE_APP_ENABLE_IROHA_TRANSFERS;

  afterEach(() => {
    if (originalEnableIrohaTransfers === undefined) {
      delete process.env.VUE_APP_ENABLE_IROHA_TRANSFERS;
    } else {
      process.env.VUE_APP_ENABLE_IROHA_TRANSFERS = originalEnableIrohaTransfers;
    }
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('normalizes transfer inputs and resolves the stored Iroha source account', async () => {
    process.env.VUE_APP_ENABLE_IROHA_TRANSFERS = 'true';
    const state = createState();
    const prepared = prepareIrohaTransfer(transferParams(state));

    expect(isIrohaTransferEnabled()).toBe(true);
    expect(await estimateIrohaTransferFee(transferParams(state))).toBe('0');
    expect(prepared).toMatchObject({
      amount: '12.34',
      assetDefinitionId: 'xor#sora',
      chainId: 'iroha3-taira',
      destinationAccountId: TAIRA_COUNTERPARTY,
      network: 'taira',
      sourceAssetId: `xor#sora#${TAIRA_ACCOUNT_ID}`,
      toriiBaseUrl: 'https://taira.sora.org',
    });
    expect(prepared.source).toMatchObject({
      accountAddress: STORED_ACCOUNT,
      derivationPath: "m/44'/617'/0'/0'",
      irohaAddress: TAIRA_ACCOUNT_ID,
      mnemonicOrSeed: MNEMONIC,
      publicKeyHex: IROHA_PUBLIC_KEY,
    });
    expect(state.keyringService.exportMnemonic).toHaveBeenCalledWith({
      address: STORED_ACCOUNT,
      walletEcosystem: WalletEcosystem.Iroha,
    });
  });

  it('derives the Nexus source literal from the stored public key when a runtime Torii URL is configured', () => {
    const nexus = irohaNetwork('Nexus', 'sora:nexus:global', {
      chainDiscriminant: 753,
      providers: { custom: 'https://nexus.example.org/v1/mcp' },
      currentProvider: 'custom',
    });
    const state = createState({ networks: { Nexus: nexus } });
    const prepared = prepareIrohaTransfer({
      amount: '1',
      assetId: 'xor#sora',
      from: STORED_ACCOUNT,
      networkKey: 'Nexus',
      state,
      to: NEXUS_COUNTERPARTY,
    });

    expect(getIrohaNetworkKey(nexus)).toBe('nexus');
    expect(prepared.source.irohaAddress).toBe(NEXUS_ACCOUNT_ID);
    expect(prepared.sourceAssetId).toBe(`xor#sora#${NEXUS_ACCOUNT_ID}`);
    expect(prepared.toriiBaseUrl).toBe('https://nexus.example.org/v1/mcp');
  });

  it('rejects malformed amounts, assets, missing sources, and malformed network config', () => {
    expect(normalizeIrohaTransferAmount('0.0000000000000000000000000001')).toBe(
      '0.0000000000000000000000000001'
    );
    expect(() => normalizeIrohaTransferAmount(' 1')).toThrow('invalid_iroha_amount');
    expect(() => normalizeIrohaTransferAmount('0')).toThrow('invalid_iroha_amount');
    expect(() => normalizeIrohaTransferAmount('1.00000000000000000000000000000')).toThrow('invalid_iroha_amount');
    expect(() => normalizeIrohaTransferAmount('1e3')).toThrow('invalid_iroha_amount');
    expect(() => normalizeIrohaAssetDefinitionId('xor#sora')).not.toThrow();
    expect(() => normalizeIrohaAssetDefinitionId('xor#sora#extra')).toThrow('invalid_iroha_asset_id');
    expect(() => normalizeIrohaAssetDefinitionId('xor #sora')).toThrow('invalid_iroha_asset_id');

    expect(() => prepareIrohaTransfer({ ...transferParams(), to: NEXUS_COUNTERPARTY })).toThrow();
    expect(() => prepareIrohaTransfer({ ...transferParams(createState()), from: 'missing' })).toThrow(
      'iroha_account_not_found'
    );
    expect(() =>
      prepareIrohaTransfer({
        amount: '1',
        assetId: 'xor#sora',
        from: NEXUS_ACCOUNT_ID,
        networkKey: 'Nexus',
        state: createState({
          irohaAddress: NEXUS_ACCOUNT_ID,
          publicKeyHex: '',
          networks: {
            Nexus: irohaNetwork('Nexus', ' ', { chainDiscriminant: 753 }),
          },
        }),
        to: NEXUS_COUNTERPARTY,
      })
    ).toThrow('invalid_iroha_chain_id');
    expect(() => resolveIrohaTransferSource(createState({ seed: '' }), TAIRA_ACCOUNT_ID, 'taira')).toThrow(
      'iroha_mnemonic_unavailable'
    );
  });

  it('fails closed while Iroha transfers are not release-enabled', async () => {
    const codec: IrohaTransferCodec = {
      buildAndSignTransfer: vi.fn(async () => ({ signedTransaction: new Uint8Array([1]) })),
    };

    expect(isIrohaTransferEnabled()).toBe(false);
    await expect(estimateIrohaTransferFee(transferParams())).rejects.toThrow('iroha_transfer_disabled');
    await expect(makeIrohaTransfer(transferParams(), codec)).rejects.toThrow('iroha_transfer_disabled');
    expect(codec.buildAndSignTransfer).not.toHaveBeenCalled();
  });

  it('fails closed when transfers are enabled but no browser-safe Iroha transaction codec is configured', async () => {
    process.env.VUE_APP_ENABLE_IROHA_TRANSFERS = 'true';

    await expect(makeIrohaTransfer(transferParams())).rejects.toThrow('iroha_transfer_codec_unavailable');
  });

  it('builds, submits, and schedules balance refresh when a transaction codec is supplied', async () => {
    process.env.VUE_APP_ENABLE_IROHA_TRANSFERS = 'true';
    vi.useFakeTimers();

    const state = createState();
    const callback = vi.fn();
    const fetchFn = vi.fn(async () => jsonResponse({ hash: HASH }));
    const codec: IrohaTransferCodec = {
      buildAndSignTransfer: vi.fn(async () => ({
        signedTransaction: '0x0a0b0c',
        signedTransactionHashHex: HASH,
      })),
    };
    vi.stubGlobal('fetch', fetchFn);

    await makeIrohaTransfer({ ...transferParams(state), callback }, codec);

    expect(codec.buildAndSignTransfer).toHaveBeenCalledWith({
      amount: '12.34',
      assetDefinitionId: 'xor#sora',
      authority: TAIRA_ACCOUNT_ID,
      chainId: 'iroha3-taira',
      derivationPath: "m/44'/617'/0'/0'",
      destinationAccountId: TAIRA_COUNTERPARTY,
      mnemonicOrSeed: MNEMONIC,
      network: 'taira',
      signingPublicKeyHex: IROHA_PUBLIC_KEY,
      sourceAccountId: TAIRA_ACCOUNT_ID,
      sourceAssetId: `xor#sora#${TAIRA_ACCOUNT_ID}`,
    });
    expect(fetchFn).toHaveBeenCalledWith(
      'https://taira.sora.org/v1/pipeline/transactions',
      expect.objectContaining({
        body: expect.any(ArrayBuffer),
        headers: {
          accept: 'application/json',
          'content-type': 'application/x-norito',
        },
        method: 'POST',
      })
    );
    expect(callback).toHaveBeenCalledWith({ status: true });

    await vi.advanceTimersByTimeAsync(8000);
    expect(state.balanceService.fetchBalance).toHaveBeenCalledWith({
      address: STORED_ACCOUNT,
      ethereumAddress: '',
      irohaAddress: TAIRA_ACCOUNT_ID,
      irohaNetworks: ['Taira'],
      walletEcosystem: WalletEcosystem.Iroha,
    });
  });

  it('builds and signs with an injected Nexus browser SDK transaction codec', async () => {
    const finalizedBytes = new Uint8Array([1, 2, 3, 4]);
    const signature = new Uint8Array(64).fill(0x33);
    const payloadBytes = new Uint8Array([0xaa, 0xbb]);
    const clientConstructors: unknown[] = [];
    const transferDrafts: unknown[] = [];
    const signedMessages: Uint8Array[] = [];
    const privateKeys: Uint8Array[] = [];
    const finalized: unknown[] = [];
    const transactionCodec: NexusTransactionCodec = {
      buildTransferPayload: vi.fn(() => payloadBytes),
      finalizeSignedTransaction: vi.fn((signable, walletSignature, signingPublicKey) => {
        finalized.push({ signable, signingPublicKey, walletSignature });

        return {
          hashHex: HASH,
          signedTransaction: finalizedBytes,
        };
      }),
    };
    class FakeNexusAppClient {
      constructor(config: unknown) {
        clientConstructors.push(config);
      }

      buildTransferDraft(input: unknown) {
        transferDrafts.push(input);

        return {
          signable: {
            authority: TAIRA_ACCOUNT_ID,
            payloadBytes,
            payloadHashHex: PAYLOAD_HASH,
            signatureAlgorithm: 'ed25519' as const,
            signingPublicKey: new Uint8Array(Buffer.from(IROHA_PUBLIC_KEY, 'hex')),
          },
        };
      }
    }

    const codec = createIrohaNexusSdkTransferCodec({
      NexusAppClient: FakeNexusAppClient,
      signEd25519(message, privateKey) {
        signedMessages.push(message);
        privateKeys.push(privateKey);

        return signature;
      },
      transactionCodec,
    });
    const result = await codec.buildAndSignTransfer({
      amount: '12.34',
      assetDefinitionId: 'xor#sora',
      authority: TAIRA_ACCOUNT_ID,
      chainId: 'iroha3-taira',
      derivationPath: "m/44'/617'/0'/0'",
      destinationAccountId: TAIRA_COUNTERPARTY,
      mnemonicOrSeed: MNEMONIC,
      network: 'taira',
      signingPublicKeyHex: IROHA_PUBLIC_KEY,
      sourceAccountId: TAIRA_ACCOUNT_ID,
      sourceAssetId: `xor#sora#${TAIRA_ACCOUNT_ID}`,
    });

    expect(result).toEqual({
      signedTransaction: finalizedBytes,
      signedTransactionHashHex: HASH,
    });
    expect(clientConstructors).toEqual([
      {
        authority: TAIRA_ACCOUNT_ID,
        chainId: 'iroha3-taira',
        signingPublicKey: new Uint8Array(Buffer.from(IROHA_PUBLIC_KEY, 'hex')),
        transactionCodec,
      },
    ]);
    expect(transferDrafts).toEqual([
      {
        destinationAccountId: TAIRA_COUNTERPARTY,
        quantity: '12.34',
        sourceAssetHoldingId: `xor#sora#${TAIRA_ACCOUNT_ID}`,
      },
    ]);
    expect(signedMessages).toEqual([new Uint8Array(Buffer.from(PAYLOAD_HASH, 'hex'))]);
    expect(privateKeys).toHaveLength(1);
    expect(privateKeys[0]).toHaveLength(32);
    expect(finalized).toEqual([
      {
        signable: {
          authority: TAIRA_ACCOUNT_ID,
          payloadBytes,
          payloadHashHex: PAYLOAD_HASH,
          signatureAlgorithm: 'ed25519',
          signingPublicKey: new Uint8Array(Buffer.from(IROHA_PUBLIC_KEY, 'hex')),
        },
        signingPublicKey: new Uint8Array(Buffer.from(IROHA_PUBLIC_KEY, 'hex')),
        walletSignature: {
          algorithm: 'ed25519',
          signature,
        },
      },
    ]);
  });

  it('rejects Nexus SDK signing when the stored mnemonic does not match the account public key', async () => {
    const transactionCodec: NexusTransactionCodec = {
      buildTransferPayload: vi.fn(() => new Uint8Array([1])),
      finalizeSignedTransaction: vi.fn(() => new Uint8Array([2])),
    };
    const signEd25519 = vi.fn(() => new Uint8Array(64));
    class FakeNexusAppClient {
      buildTransferDraft(): never {
        throw new Error('should not build transfer draft');
      }
    }

    const codec = createIrohaNexusSdkTransferCodec({
      NexusAppClient: FakeNexusAppClient,
      signEd25519,
      transactionCodec,
    });

    await expect(
      codec.buildAndSignTransfer({
        amount: '1',
        assetDefinitionId: 'xor#sora',
        authority: TAIRA_ACCOUNT_ID,
        chainId: 'iroha3-taira',
        derivationPath: "m/44'/617'/0'/0'",
        destinationAccountId: TAIRA_COUNTERPARTY,
        mnemonicOrSeed: MNEMONIC,
        network: 'taira',
        signingPublicKeyHex: 'ff'.repeat(32),
        sourceAccountId: TAIRA_ACCOUNT_ID,
        sourceAssetId: `xor#sora#${TAIRA_ACCOUNT_ID}`,
      })
    ).rejects.toThrow('iroha_signing_key_mismatch');
    expect(signEd25519).not.toHaveBeenCalled();
    expect(transactionCodec.finalizeSignedTransaction).not.toHaveBeenCalled();
  });

  it('rejects incomplete or malformed Nexus SDK transaction codec outputs', async () => {
    class FakeNexusAppClient {
      buildTransferDraft() {
        return {
          signable: {
            authority: TAIRA_ACCOUNT_ID,
            payloadBytes: new Uint8Array([1]),
            payloadHashHex: PAYLOAD_HASH,
            signatureAlgorithm: 'ed25519' as const,
            signingPublicKey: new Uint8Array(Buffer.from(IROHA_PUBLIC_KEY, 'hex')),
          },
        };
      }
    }

    expect(() =>
      createIrohaNexusSdkTransferCodec({
        NexusAppClient: FakeNexusAppClient,
        signEd25519: () => new Uint8Array(64),
        transactionCodec: {
          buildTransferPayload: vi.fn(() => new Uint8Array([1])),
        } as unknown as NexusTransactionCodec,
      })
    ).toThrow('iroha_transaction_codec_unavailable');

    const emptySignedCodec = createIrohaNexusSdkTransferCodec({
      NexusAppClient: FakeNexusAppClient,
      signEd25519: () => new Uint8Array(64),
      transactionCodec: {
        buildTransferPayload: vi.fn(() => new Uint8Array([1])),
        finalizeSignedTransaction: vi.fn(() => ({ hashHex: HASH, signedTransaction: new Uint8Array() })),
      },
    });
    const malformedHashCodec = createIrohaNexusSdkTransferCodec({
      NexusAppClient: FakeNexusAppClient,
      signEd25519: () => new Uint8Array(64),
      transactionCodec: {
        buildTransferPayload: vi.fn(() => new Uint8Array([1])),
        finalizeSignedTransaction: vi.fn(() => ({ hashHex: '1234', signedTransaction: new Uint8Array([1]) })),
      },
    });
    const input = {
      amount: '1',
      assetDefinitionId: 'xor#sora',
      authority: TAIRA_ACCOUNT_ID,
      chainId: 'iroha3-taira',
      derivationPath: "m/44'/617'/0'/0'",
      destinationAccountId: TAIRA_COUNTERPARTY,
      mnemonicOrSeed: MNEMONIC,
      network: 'taira' as const,
      signingPublicKeyHex: IROHA_PUBLIC_KEY,
      sourceAccountId: TAIRA_ACCOUNT_ID,
      sourceAssetId: `xor#sora#${TAIRA_ACCOUNT_ID}`,
    };

    await expect(emptySignedCodec.buildAndSignTransfer(input)).rejects.toThrow('invalid_iroha_signed_transaction');
    await expect(malformedHashCodec.buildAndSignTransfer(input)).rejects.toThrow(
      'invalid_iroha_signed_transaction_hash'
    );
  });
});
