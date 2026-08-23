import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  createIrohaWalletSmokeMetadata,
  estimateIrohaTransferFee,
  getIrohaNetworkKey,
  isIrohaTransferEnabled,
  makeIrohaTransfer,
  makeIrohaWalletSmokeTransfer,
  normalizeIrohaAssetDefinitionId,
  normalizeIrohaToriiBaseUrl,
  normalizeIrohaTransferAmount,
  normalizeIrohaWalletSmokeMetadata,
  prepareIrohaTransfer,
  resolveIrohaTransferSource,
  type IrohaTransferCodec,
  type IrohaTransferCodecInput,
} from '@extension-base/api/iroha/transfer';
import {
  createIrohaNexusSdkTransferCodec,
  type NexusTransactionCodec,
} from '@extension-base/api/iroha/nexusSdkTransferCodec';
import {
  loadProductionIrohaTransferCodec,
  requireProductionIrohaTransferCodec,
  resetProductionIrohaTransferCodecForTest,
  type NativeBrowserTransactionBinding,
} from '@extension-base/api/iroha/productionTransferCodec';
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
const TAIRA_CHAIN_ID = 'fc56984b-2be7-431d-840e-21514d1883f0';
const TAIRA_XOR_ASSET_ID = '6TEAJqbb8oEPmLncoNiMRbLEK6tw';
const ROUTE_GOVERNANCE_ACTION_HASH = `sha256:${'33'.repeat(32)}`;
const WALLET_COMMIT = '44'.repeat(20);

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
    Taira: irohaNetwork('Taira', TAIRA_CHAIN_ID, { chainDiscriminant: 369 }),
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

function submitAndWaitResponse(requestId: number, receiptHash = HASH): Response {
  return jsonResponse({
    jsonrpc: '2.0',
    id: requestId,
    result: {
      isError: false,
      structuredContent: {
        status: 200,
        hash: HASH,
        tx_hash: HASH,
        terminal_kind: 'Applied',
        terminal_statuses: ['Applied'],
        attempts: 2,
        elapsed_ms: 500,
        submit: {
          status: 202,
          headers: {},
          content_type: 'application/json',
          body: { tx_hash_hex: receiptHash },
        },
        final_status: {
          status: 200,
          headers: {},
          content_type: 'application/json',
          body: { hash: HASH, status: { kind: 'Applied' } },
        },
      },
    },
  });
}

function transferParams(state = createState()) {
  return {
    amount: '12.34',
    assetId: TAIRA_XOR_ASSET_ID,
    from: TAIRA_ACCOUNT_ID,
    networkKey: 'Taira',
    state,
    to: TAIRA_COUNTERPARTY,
  };
}

function transferCodecInput(overrides: Record<string, unknown> = {}): IrohaTransferCodecInput {
  return {
    amount: '1',
    assetDefinitionId: TAIRA_XOR_ASSET_ID,
    authority: TAIRA_ACCOUNT_ID,
    chainId: TAIRA_CHAIN_ID,
    derivationPath: "m/44'/617'/0'/0'",
    destinationAccountId: TAIRA_COUNTERPARTY,
    mnemonicOrSeed: MNEMONIC,
    network: 'taira',
    signingPublicKeyHex: IROHA_PUBLIC_KEY,
    sourceAccountId: TAIRA_ACCOUNT_ID,
    sourceAssetId: `${TAIRA_XOR_ASSET_ID}#${TAIRA_ACCOUNT_ID}`,
    ...overrides,
  } as IrohaTransferCodecInput;
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
    delete (globalThis as typeof globalThis & { __IROHA_NATIVE_BINDING__?: unknown }).__IROHA_NATIVE_BINDING__;
    resetProductionIrohaTransferCodecForTest();
  });

  it('normalizes transfer inputs and resolves the stored Iroha source account', async () => {
    process.env.VUE_APP_ENABLE_IROHA_TRANSFERS = 'true';
    const state = createState();
    const prepared = prepareIrohaTransfer(transferParams(state));

    expect(isIrohaTransferEnabled()).toBe(true);
    await expect(estimateIrohaTransferFee(transferParams(state))).rejects.toThrow(
      'iroha_fee_estimation_unavailable'
    );
    expect(prepared).toMatchObject({
      amount: '12.34',
      assetDefinitionId: TAIRA_XOR_ASSET_ID,
      chainId: TAIRA_CHAIN_ID,
      destinationAccountId: TAIRA_COUNTERPARTY,
      network: 'taira',
      sourceAssetId: `${TAIRA_XOR_ASSET_ID}#${TAIRA_ACCOUNT_ID}`,
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
    expect(normalizeIrohaAssetDefinitionId(TAIRA_XOR_ASSET_ID)).toBe(TAIRA_XOR_ASSET_ID);
    expect(() => normalizeIrohaAssetDefinitionId('xor#sora')).toThrow('invalid_iroha_asset_id');
    expect(() => normalizeIrohaAssetDefinitionId(` ${TAIRA_XOR_ASSET_ID}`)).toThrow('invalid_iroha_asset_id');

    expect(() => prepareIrohaTransfer({ ...transferParams(), to: NEXUS_COUNTERPARTY })).toThrow();
    expect(() =>
      prepareIrohaTransfer(
        transferParams(
          createState({
            networks: {
              Taira: irohaNetwork('Taira', 'iroha3-taira', { chainDiscriminant: 369 }),
            },
          })
        )
      )
    ).toThrow('noncanonical_iroha_chain_id');
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
    expect(() => getIrohaNetworkKey(irohaNetwork('Unknown', 'iroha:unknown'))).toThrow(
      'unsupported_iroha_network'
    );
    expect(() =>
      getIrohaNetworkKey(irohaNetwork('Taira', TAIRA_CHAIN_ID, { chainDiscriminant: 753 }))
    ).toThrow('ambiguous_iroha_network');
    expect(() =>
      getIrohaNetworkKey(irohaNetwork('Nexus', 'sora:nexus:global', { chainDiscriminant: 999 }))
    ).toThrow('unsupported_iroha_network');
    expect(normalizeIrohaToriiBaseUrl('https://minamoto.sora.org/v1/mcp')).toBe(
      'https://minamoto.sora.org/v1/mcp'
    );
    expect(normalizeIrohaToriiBaseUrl('http://[::1]:8080')).toBe('http://[::1]:8080');
    expect(() => normalizeIrohaToriiBaseUrl('ftp://localhost/torii')).toThrow('invalid_iroha_torii_url');
    expect(() => normalizeIrohaToriiBaseUrl('https://user:secret@minamoto.sora.org')).toThrow(
      'invalid_iroha_torii_url'
    );
    expect(() => normalizeIrohaToriiBaseUrl('https://minamoto.sora.org?redirect=attacker')).toThrow(
      'invalid_iroha_torii_url'
    );
  });

  it('creates an immutable exact wallet-smoke metadata snapshot', () => {
    const metadata = createIrohaWalletSmokeMetadata(ROUTE_GOVERNANCE_ACTION_HASH, WALLET_COMMIT);

    expect(metadata).toEqual({
      evidence_role: 'wallet-smoke',
      route_governance_action_hash: ROUTE_GOVERNANCE_ACTION_HASH,
      wallet_platform: 'web',
      wallet_commit: WALLET_COMMIT,
    });
    expect(Object.isFrozen(metadata)).toBe(true);

    const source = {
      evidence_role: 'wallet-smoke',
      route_governance_action_hash: ROUTE_GOVERNANCE_ACTION_HASH,
      wallet_platform: 'web',
      wallet_commit: WALLET_COMMIT,
    };
    const snapshot = normalizeIrohaWalletSmokeMetadata(source);

    source.wallet_commit = '55'.repeat(20);
    expect(snapshot.wallet_commit).toBe(WALLET_COMMIT);
    expect(snapshot).not.toBe(source);
    expect(Object.isFrozen(snapshot)).toBe(true);
  });

  it('rejects malformed and adversarial wallet-smoke metadata before signing', async () => {
    const buildTransferDraft = vi.fn(() => {
      throw new Error('must not build');
    });
    const signEd25519 = vi.fn(() => new Uint8Array(64));
    const finalizeSignedTransaction = vi.fn(() => new Uint8Array([1]));
    const codec = createIrohaNexusSdkTransferCodec({
      NexusAppClient: class {
        buildTransferDraft = buildTransferDraft;
      },
      signEd25519,
      transactionCodec: {
        buildTransferPayload: vi.fn(() => new Uint8Array([1])),
        finalizeSignedTransaction,
      },
    });
    let accessorCalls = 0;
    const accessorMetadata = {
      evidence_role: 'wallet-smoke',
      route_governance_action_hash: ROUTE_GOVERNANCE_ACTION_HASH,
      wallet_platform: 'web',
    } as Record<string, unknown>;

    Object.defineProperty(accessorMetadata, 'wallet_commit', {
      enumerable: true,
      get() {
        accessorCalls += 1;
        return WALLET_COMMIT;
      },
    });

    const inherited = Object.create({ attacker: 'inherited' }) as Record<string, unknown>;
    Object.assign(inherited, {
      evidence_role: 'wallet-smoke',
      route_governance_action_hash: ROUTE_GOVERNANCE_ACTION_HASH,
      wallet_platform: 'web',
      wallet_commit: WALLET_COMMIT,
    });
    const withSymbol = {
      evidence_role: 'wallet-smoke',
      route_governance_action_hash: ROUTE_GOVERNANCE_ACTION_HASH,
      wallet_platform: 'web',
      wallet_commit: WALLET_COMMIT,
      [Symbol('attacker')]: 'hidden',
    };
    const valid = {
      evidence_role: 'wallet-smoke',
      route_governance_action_hash: ROUTE_GOVERNANCE_ACTION_HASH,
      wallet_platform: 'web',
      wallet_commit: WALLET_COMMIT,
    };
    const invalidMetadata: unknown[] = [
      null,
      [],
      {},
      { ...valid, extra: 'attacker' },
      { ...valid, evidence_role: 'route-canary' },
      { ...valid, evidence_role: 'Wallet-Smoke' },
      { ...valid, wallet_platform: 'android' },
      { ...valid, wallet_platform: 'Web' },
      { ...valid, route_governance_action_hash: '33'.repeat(32) },
      { ...valid, route_governance_action_hash: `sha256:${'AA'.repeat(32)}` },
      { ...valid, route_governance_action_hash: `sha256:${'33'.repeat(31)}` },
      { ...valid, route_governance_action_hash: `sha256:${'00'.repeat(32)}` },
      { ...valid, wallet_commit: '44'.repeat(19) },
      { ...valid, wallet_commit: 'AA'.repeat(20) },
      { ...valid, wallet_commit: '00'.repeat(20) },
      inherited,
      accessorMetadata,
      withSymbol,
    ];

    for (const metadata of invalidMetadata) {
      await expect(
        codec.buildAndSignTransfer(transferCodecInput({ metadata }))
      ).rejects.toThrow('invalid_iroha_wallet_smoke_metadata');
    }

    expect(accessorCalls).toBe(0);
    expect(buildTransferDraft).not.toHaveBeenCalled();
    expect(signEd25519).not.toHaveBeenCalled();
    expect(finalizeSignedTransaction).not.toHaveBeenCalled();
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

  it('fails closed when transfers are enabled but no reviewed bundled Iroha transaction codec artifact is configured', async () => {
    process.env.VUE_APP_ENABLE_IROHA_TRANSFERS = 'true';

    await expect(makeIrohaTransfer(transferParams())).rejects.toThrow('iroha_transfer_codec_unavailable');
    await expect(loadProductionIrohaTransferCodec()).resolves.toBeUndefined();
    await expect(requireProductionIrohaTransferCodec()).rejects.toThrow('iroha_transfer_codec_unavailable');
  });

  it('exercises the global transaction host only as an isolated test seam', async () => {
    const finalized = vi.fn((_input: Record<string, unknown>) => ({
      hashHex: HASH,
      signedTransaction: new Uint8Array([1, 2, 3]),
    }));
    const binding: NativeBrowserTransactionBinding = {
      buildTransferAssetPayload: vi.fn(() => ({ payloadBytes: new Uint8Array([0xaa, 0xbb]) })),
      finalizeSignedTransaction: finalized,
    };
    (globalThis as typeof globalThis & { __IROHA_NATIVE_BINDING__?: NativeBrowserTransactionBinding })
      .__IROHA_NATIVE_BINDING__ = binding;

    await expect(loadProductionIrohaTransferCodec()).resolves.toBeUndefined();

    process.env.VUE_APP_ENABLE_IROHA_TRANSFERS = 'true';
    const codec = await requireProductionIrohaTransferCodec();
    const result = await codec.buildAndSignTransfer({
      amount: '12.34',
      assetDefinitionId: TAIRA_XOR_ASSET_ID,
      authority: TAIRA_ACCOUNT_ID,
      chainId: TAIRA_CHAIN_ID,
      derivationPath: "m/44'/617'/0'/0'",
      destinationAccountId: TAIRA_COUNTERPARTY,
      mnemonicOrSeed: MNEMONIC,
      network: 'taira',
      signingPublicKeyHex: IROHA_PUBLIC_KEY,
      sourceAccountId: TAIRA_ACCOUNT_ID,
      sourceAssetId: `${TAIRA_XOR_ASSET_ID}#${TAIRA_ACCOUNT_ID}`,
    });

    expect(result).toEqual({ signedTransaction: new Uint8Array([1, 2, 3]), signedTransactionHashHex: HASH });
    expect(binding.buildTransferAssetPayload).toHaveBeenCalledWith(
      TAIRA_CHAIN_ID,
      TAIRA_ACCOUNT_ID,
      `${TAIRA_XOR_ASSET_ID}#${TAIRA_ACCOUNT_ID}`,
      '12.34',
      TAIRA_COUNTERPARTY,
      null,
      null,
      null,
      null
    );
    expect(finalized).toHaveBeenCalledWith(
      expect.objectContaining({
        authority: TAIRA_ACCOUNT_ID,
        payloadHashHex: expect.stringMatching(/^[0-9a-f]{64}$/u),
        signature: expect.any(Uint8Array),
        signingPublicKey: expect.any(Uint8Array),
      })
    );
    expect((finalized.mock.calls[0]![0].signature as Uint8Array).byteLength).toBe(64);

    await codec.buildAndSignTransfer(
      transferCodecInput({
        authority: NEXUS_ACCOUNT_ID,
        chainId: 'sora:nexus:global',
        destinationAccountId: NEXUS_COUNTERPARTY,
        metadata: createIrohaWalletSmokeMetadata(ROUTE_GOVERNANCE_ACTION_HASH, WALLET_COMMIT),
        network: 'nexus',
        sourceAccountId: NEXUS_ACCOUNT_ID,
        sourceAssetId: `xor#sora#${NEXUS_ACCOUNT_ID}`,
      })
    );
    expect(binding.buildTransferAssetPayload).toHaveBeenCalledWith(
      'sora:nexus:global',
      NEXUS_ACCOUNT_ID,
      `xor#sora#${NEXUS_ACCOUNT_ID}`,
      '1',
      NEXUS_COUNTERPARTY,
      JSON.stringify({
        evidence_role: 'wallet-smoke',
        route_governance_action_hash: ROUTE_GOVERNANCE_ACTION_HASH,
        wallet_platform: 'web',
        wallet_commit: WALLET_COMMIT,
      }),
      null,
      null,
      null
    );
  });

  it('reports success and refreshes balance only after Torii confirms Applied', async () => {
    process.env.VUE_APP_ENABLE_IROHA_TRANSFERS = 'true';

    const state = createState();
    const callback = vi.fn();
    const fetchFn = vi.fn(async (_input: string | URL, init?: RequestInit) => {
      const request = JSON.parse(init?.body as string);

      return submitAndWaitResponse(request.id);
    });
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
      assetDefinitionId: TAIRA_XOR_ASSET_ID,
      authority: TAIRA_ACCOUNT_ID,
      chainId: TAIRA_CHAIN_ID,
      derivationPath: "m/44'/617'/0'/0'",
      destinationAccountId: TAIRA_COUNTERPARTY,
      mnemonicOrSeed: MNEMONIC,
      network: 'taira',
      signingPublicKeyHex: IROHA_PUBLIC_KEY,
      sourceAccountId: TAIRA_ACCOUNT_ID,
      sourceAssetId: `${TAIRA_XOR_ASSET_ID}#${TAIRA_ACCOUNT_ID}`,
    });
    expect(fetchFn).toHaveBeenCalledWith(
      'https://taira.sora.org/v1/mcp',
      expect.objectContaining({
        headers: {
          'content-type': 'application/json',
        },
        method: 'POST',
      })
    );
    const request = JSON.parse(vi.mocked(fetchFn).mock.calls[0]![1]?.body as string);

    expect(request).toMatchObject({
      params: {
        name: 'iroha.transactions.submit_and_wait',
        arguments: {
          body_base64: 'CgsM',
          hash: HASH,
          terminal_statuses: ['Applied'],
        },
      },
    });
    expect(callback).toHaveBeenCalledWith({ status: true });
    expect(state.balanceService.fetchBalance).toHaveBeenCalledWith({
      address: STORED_ACCOUNT,
      ethereumAddress: '',
      irohaAddress: TAIRA_ACCOUNT_ID,
      irohaNetworks: ['Taira'],
      walletEcosystem: WalletEcosystem.Iroha,
    });
  });

  it('never reports success without a local hash and a matching Applied receipt', async () => {
    process.env.VUE_APP_ENABLE_IROHA_TRANSFERS = 'true';

    const state = createState();
    const callback = vi.fn();
    const mismatchedReceipt = '33'.repeat(32);
    const fetchFn = vi.fn(async (_input: string | URL, init?: RequestInit) => {
      const request = JSON.parse(init?.body as string);

      return submitAndWaitResponse(request.id, mismatchedReceipt);
    });
    vi.stubGlobal('fetch', fetchFn);

    await expect(
      makeIrohaTransfer(
        { ...transferParams(state), callback },
        {
          buildAndSignTransfer: vi.fn(async () => ({
            signedTransaction: new Uint8Array([1, 2, 3]),
            signedTransactionHashHex: HASH,
          })),
        }
      )
    ).rejects.toThrow('iroha_transaction_receipt_mismatch');
    expect(callback).not.toHaveBeenCalled();
    expect(state.balanceService.fetchBalance).not.toHaveBeenCalled();

    await expect(
      makeIrohaTransfer(
        { ...transferParams(createState()), callback },
        {
          buildAndSignTransfer: vi.fn(async () => ({ signedTransaction: new Uint8Array([1, 2, 3]) })),
        }
      )
    ).rejects.toThrow('invalid_iroha_transaction_hash');
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('submits an operator-only Nexus wallet smoke with exact bound metadata', async () => {
    process.env.VUE_APP_ENABLE_IROHA_TRANSFERS = 'true';

    const state = createState({ irohaAddress: NEXUS_ACCOUNT_ID });
    const fetchFn = vi.fn(async (_input: string | URL, init?: RequestInit) => {
      const request = JSON.parse(init?.body as string);

      return submitAndWaitResponse(request.id);
    });
    const codec: IrohaTransferCodec = {
      buildAndSignTransfer: vi.fn(async () => ({
        signedTransaction: '0x0a0b0c',
        signedTransactionHashHex: HASH,
      })),
    };
    vi.stubGlobal('fetch', fetchFn);

    await makeIrohaWalletSmokeTransfer(
      {
        amount: '12.34',
        assetId: 'xor#sora',
        from: NEXUS_ACCOUNT_ID,
        networkKey: 'Nexus',
        state,
        to: NEXUS_COUNTERPARTY,
      },
      ROUTE_GOVERNANCE_ACTION_HASH,
      WALLET_COMMIT,
      codec
    );

    expect(codec.buildAndSignTransfer).toHaveBeenCalledWith(
      expect.objectContaining({
        authority: NEXUS_ACCOUNT_ID,
        chainId: 'sora:nexus:global',
        metadata: {
          evidence_role: 'wallet-smoke',
          route_governance_action_hash: ROUTE_GOVERNANCE_ACTION_HASH,
          wallet_platform: 'web',
          wallet_commit: WALLET_COMMIT,
        },
        network: 'nexus',
      })
    );
    const codecMetadata = vi.mocked(codec.buildAndSignTransfer).mock.calls[0]![0].metadata;

    expect(Object.isFrozen(codecMetadata)).toBe(true);
    expect(fetchFn).toHaveBeenCalledWith(
      'https://minamoto.sora.org/v1/mcp',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('rejects unsafe wallet-smoke requests before codec or Torii access', async () => {
    process.env.VUE_APP_ENABLE_IROHA_TRANSFERS = 'true';

    const fetchFn = vi.fn(async () => jsonResponse({ hash: HASH }));
    const codec: IrohaTransferCodec = {
      buildAndSignTransfer: vi.fn(async () => ({ signedTransaction: '0x0a0b0c' })),
    };
    vi.stubGlobal('fetch', fetchFn);
    const nexusParams = {
      amount: '1',
      assetId: 'xor#sora',
      from: NEXUS_ACCOUNT_ID,
      networkKey: 'Nexus' as const,
      state: createState({ irohaAddress: NEXUS_ACCOUNT_ID }),
      to: NEXUS_COUNTERPARTY,
    };
    const rejectedRouteStates: State[] = [nexusParams.state];

    for (const [routeHash, commit] of [
      ['33'.repeat(32), WALLET_COMMIT],
      [`sha256:${'AA'.repeat(32)}`, WALLET_COMMIT],
      [`sha256:${'00'.repeat(32)}`, WALLET_COMMIT],
      [ROUTE_GOVERNANCE_ACTION_HASH, '44'.repeat(19)],
      [ROUTE_GOVERNANCE_ACTION_HASH, 'AA'.repeat(20)],
      [ROUTE_GOVERNANCE_ACTION_HASH, '00'.repeat(20)],
    ]) {
      await expect(
        makeIrohaWalletSmokeTransfer(nexusParams, routeHash, commit, codec)
      ).rejects.toThrow('invalid_iroha_wallet_smoke_metadata');
    }

    const tairaState = createState();

    rejectedRouteStates.push(tairaState);
    await expect(
      makeIrohaWalletSmokeTransfer(
        transferParams(tairaState),
        ROUTE_GOVERNANCE_ACTION_HASH,
        WALLET_COMMIT,
        codec
      )
    ).rejects.toThrow('iroha_wallet_smoke_requires_nexus');

    for (const chainId of ['attacker:nexus:chain', 'SORA:NEXUS:GLOBAL']) {
      const chainDriftNexus = irohaNetwork('Nexus', chainId, { chainDiscriminant: 753 });
      const chainDriftState = createState({
        irohaAddress: NEXUS_ACCOUNT_ID,
        networks: { Nexus: chainDriftNexus },
      });

      rejectedRouteStates.push(chainDriftState);
      await expect(
        makeIrohaWalletSmokeTransfer(
          {
            ...nexusParams,
            state: chainDriftState,
          },
          ROUTE_GOVERNANCE_ACTION_HASH,
          WALLET_COMMIT,
          codec
        )
      ).rejects.toThrow('noncanonical_iroha_chain_id');
    }

    const noncanonicalEndpointUrls = [
      'https://attacker.example',
      'https://minamoto.sora.org/',
      'https://minamoto.sora.org:443',
      'https://MINAMOTO.SORA.ORG',
    ];

    expect(noncanonicalEndpointUrls).toHaveLength(4);
    for (const configuredEndpoint of noncanonicalEndpointUrls) {
      const noncanonicalNexus = irohaNetwork('Nexus', 'sora:nexus:global', {
        chainDiscriminant: 753,
        currentProvider: 'configured',
        providers: { configured: configuredEndpoint },
      });
      const noncanonicalEndpointState = createState({
        irohaAddress: NEXUS_ACCOUNT_ID,
        networks: { Nexus: noncanonicalNexus },
      });

      rejectedRouteStates.push(noncanonicalEndpointState);
      await expect(
        makeIrohaWalletSmokeTransfer(
          {
            ...nexusParams,
            state: noncanonicalEndpointState,
          },
          ROUTE_GOVERNANCE_ACTION_HASH,
          WALLET_COMMIT,
          codec
        )
      ).rejects.toThrow('iroha_wallet_smoke_requires_canonical_nexus_torii');
    }

    for (const state of rejectedRouteStates) {
      expect(state.keyringService.getAllAccounts).not.toHaveBeenCalled();
      expect(state.keyringService.exportMnemonic).not.toHaveBeenCalled();
    }
    expect(codec.buildAndSignTransfer).not.toHaveBeenCalled();
    expect(fetchFn).not.toHaveBeenCalled();
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
      assetDefinitionId: TAIRA_XOR_ASSET_ID,
      authority: TAIRA_ACCOUNT_ID,
      chainId: TAIRA_CHAIN_ID,
      derivationPath: "m/44'/617'/0'/0'",
      destinationAccountId: TAIRA_COUNTERPARTY,
      mnemonicOrSeed: MNEMONIC,
      network: 'taira',
      signingPublicKeyHex: IROHA_PUBLIC_KEY,
      sourceAccountId: TAIRA_ACCOUNT_ID,
      sourceAssetId: `${TAIRA_XOR_ASSET_ID}#${TAIRA_ACCOUNT_ID}`,
    });

    expect(result).toEqual({
      signedTransaction: finalizedBytes,
      signedTransactionHashHex: HASH,
    });
    expect(clientConstructors).toEqual([
      {
        authority: TAIRA_ACCOUNT_ID,
        chainId: TAIRA_CHAIN_ID,
        signingPublicKey: new Uint8Array(Buffer.from(IROHA_PUBLIC_KEY, 'hex')),
        transactionCodec,
      },
    ]);
    expect(transferDrafts).toEqual([
      {
        destinationAccountId: TAIRA_COUNTERPARTY,
        quantity: '12.34',
        sourceAssetHoldingId: `${TAIRA_XOR_ASSET_ID}#${TAIRA_ACCOUNT_ID}`,
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

  it('forwards only a snapshotted exact web wallet-smoke metadata object on Nexus', async () => {
    const sourceMetadata = {
      evidence_role: 'wallet-smoke',
      route_governance_action_hash: ROUTE_GOVERNANCE_ACTION_HASH,
      wallet_platform: 'web',
      wallet_commit: WALLET_COMMIT,
    };
    const draftInputs: Array<Record<string, unknown>> = [];
    const signEd25519 = vi.fn(() => new Uint8Array(64));
    const finalizeSignedTransaction = vi.fn(() => new Uint8Array([1, 2, 3]));
    const codec = createIrohaNexusSdkTransferCodec({
      NexusAppClient: class {
        buildTransferDraft(input: Record<string, unknown>) {
          draftInputs.push(input);
          sourceMetadata.wallet_commit = '55'.repeat(20);

          return {
            signable: {
              authority: NEXUS_ACCOUNT_ID,
              payloadBytes: new Uint8Array([1]),
              payloadHashHex: PAYLOAD_HASH,
              signatureAlgorithm: 'ed25519' as const,
              signingPublicKey: new Uint8Array(Buffer.from(IROHA_PUBLIC_KEY, 'hex')),
            },
          };
        }
      },
      signEd25519,
      transactionCodec: {
        buildTransferPayload: vi.fn(() => new Uint8Array([1])),
        finalizeSignedTransaction,
      },
    });
    const nexusInput = transferCodecInput({
      authority: NEXUS_ACCOUNT_ID,
      chainId: 'sora:nexus:global',
      destinationAccountId: NEXUS_COUNTERPARTY,
      metadata: sourceMetadata,
      network: 'nexus',
      sourceAccountId: NEXUS_ACCOUNT_ID,
      sourceAssetId: `xor#sora#${NEXUS_ACCOUNT_ID}`,
    });

    await expect(codec.buildAndSignTransfer(nexusInput)).resolves.toEqual({
      signedTransaction: new Uint8Array([1, 2, 3]),
      signedTransactionHashHex: undefined,
    });
    expect(draftInputs).toHaveLength(1);
    expect(draftInputs[0]).toEqual({
      destinationAccountId: NEXUS_COUNTERPARTY,
      metadata: {
        evidence_role: 'wallet-smoke',
        route_governance_action_hash: ROUTE_GOVERNANCE_ACTION_HASH,
        wallet_platform: 'web',
        wallet_commit: WALLET_COMMIT,
      },
      quantity: '1',
      sourceAssetHoldingId: `xor#sora#${NEXUS_ACCOUNT_ID}`,
    });
    expect(draftInputs[0].metadata).not.toBe(sourceMetadata);
    expect(Object.isFrozen(draftInputs[0].metadata)).toBe(true);

    await expect(
      codec.buildAndSignTransfer(transferCodecInput({ metadata: createIrohaWalletSmokeMetadata(
        ROUTE_GOVERNANCE_ACTION_HASH,
        WALLET_COMMIT
      ) }))
    ).rejects.toThrow('iroha_wallet_smoke_requires_nexus');
    expect(draftInputs).toHaveLength(1);
    expect(signEd25519).toHaveBeenCalledTimes(1);
    expect(finalizeSignedTransaction).toHaveBeenCalledTimes(1);
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
        assetDefinitionId: TAIRA_XOR_ASSET_ID,
        authority: TAIRA_ACCOUNT_ID,
        chainId: TAIRA_CHAIN_ID,
        derivationPath: "m/44'/617'/0'/0'",
        destinationAccountId: TAIRA_COUNTERPARTY,
        mnemonicOrSeed: MNEMONIC,
        network: 'taira',
        signingPublicKeyHex: 'ff'.repeat(32),
        sourceAccountId: TAIRA_ACCOUNT_ID,
        sourceAssetId: `${TAIRA_XOR_ASSET_ID}#${TAIRA_ACCOUNT_ID}`,
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
      assetDefinitionId: TAIRA_XOR_ASSET_ID,
      authority: TAIRA_ACCOUNT_ID,
      chainId: TAIRA_CHAIN_ID,
      derivationPath: "m/44'/617'/0'/0'",
      destinationAccountId: TAIRA_COUNTERPARTY,
      mnemonicOrSeed: MNEMONIC,
      network: 'taira' as const,
      signingPublicKeyHex: IROHA_PUBLIC_KEY,
      sourceAccountId: TAIRA_ACCOUNT_ID,
      sourceAssetId: `${TAIRA_XOR_ASSET_ID}#${TAIRA_ACCOUNT_ID}`,
    };

    await expect(emptySignedCodec.buildAndSignTransfer(input)).rejects.toThrow('invalid_iroha_signed_transaction');
    await expect(malformedHashCodec.buildAndSignTransfer(input)).rejects.toThrow(
      'invalid_iroha_signed_transaction_hash'
    );
  });

  it('rejects SDK signables that change the authority, public key, or payload hash', async () => {
    const transactionCodec: NexusTransactionCodec = {
      buildTransferPayload: vi.fn(() => new Uint8Array([1])),
      finalizeSignedTransaction: vi.fn(() => new Uint8Array([2])),
    };
    const input = {
      amount: '1',
      assetDefinitionId: TAIRA_XOR_ASSET_ID,
      authority: TAIRA_ACCOUNT_ID,
      chainId: TAIRA_CHAIN_ID,
      derivationPath: "m/44'/617'/0'/0'",
      destinationAccountId: TAIRA_COUNTERPARTY,
      mnemonicOrSeed: MNEMONIC,
      network: 'taira' as const,
      signingPublicKeyHex: IROHA_PUBLIC_KEY,
      sourceAccountId: TAIRA_ACCOUNT_ID,
      sourceAssetId: `${TAIRA_XOR_ASSET_ID}#${TAIRA_ACCOUNT_ID}`,
    };
    const makeCodec = (overrides: Record<string, unknown>, payloadHashHex?: (payload: Uint8Array) => string) =>
      createIrohaNexusSdkTransferCodec({
        NexusAppClient: class {
          buildTransferDraft() {
            return {
              signable: {
                authority: TAIRA_ACCOUNT_ID,
                payloadBytes: new Uint8Array([1]),
                payloadHashHex: PAYLOAD_HASH,
                signatureAlgorithm: 'ed25519' as const,
                signingPublicKey: new Uint8Array(Buffer.from(IROHA_PUBLIC_KEY, 'hex')),
                ...overrides,
              },
            };
          }
        },
        payloadHashHex,
        signEd25519: vi.fn(() => new Uint8Array(64)),
        transactionCodec,
      });

    await expect(makeCodec({ authority: NEXUS_ACCOUNT_ID }).buildAndSignTransfer(input)).rejects.toThrow(
      'iroha_signable_authority_mismatch'
    );
    await expect(
      makeCodec({ signingPublicKey: new Uint8Array(32).fill(0xff) }).buildAndSignTransfer(input)
    ).rejects.toThrow('iroha_signable_public_key_mismatch');
    await expect(
      makeCodec({}, () => '33'.repeat(32)).buildAndSignTransfer(input)
    ).rejects.toThrow('iroha_payload_hash_mismatch');
    expect(transactionCodec.finalizeSignedTransaction).not.toHaveBeenCalled();
  });
});
