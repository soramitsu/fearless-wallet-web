import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  computeIrohaTransferFee,
  estimateIrohaTransferFee,
  getIrohaNetworkKey,
  isIrohaTransferEnabled,
  makeIrohaTransfer,
  normalizeIrohaAssetDefinitionId,
  normalizeIrohaToriiBaseUrl,
  normalizeIrohaTransferAmount,
  prepareIrohaTransfer,
  type IrohaTransferCodec,
  type IrohaTransferCodecInput,
  type IrohaTransferFrameSizer,
} from '@extension-base/api/iroha/transfer';
import {
  browserIrohaTransferCodec,
  getIrohaTransferFrameBytes,
  requireProductionIrohaTransferCodec,
} from '@extension-base/api/iroha/productionTransferCodec';
import {
  IrohaToriiWalletClient,
  IrohaTransactionRejectedError,
} from '@extension-base/services/iroha-torii-service';
import type State from '@extension-base/background/handlers/State';
import type { NetworkJson } from '@extension-base/types';
import { IROHA_TRANSACTION_WIRE, UNIVERSAL_WALLET_IROHA_NETWORKS } from '@/consts/universalWallet';
import { WalletEcosystem } from '@/interfaces';

const fixture = JSON.parse(readFileSync(resolve(__dirname, '../../docs/universal-wallet-v2-vectors.json'), 'utf8')) as {
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
const IROHA_PUBLIC_KEY = fixture.vectors[0].expected.iroha.taira.publicKeyHex;
const TAIRA_COUNTERPARTY = fixture.vectors[1].expected.iroha.taira.i105;
const NEXUS_COUNTERPARTY = fixture.vectors[1].expected.iroha.nexus.i105;
const OTHER_PUBLIC_KEY = fixture.vectors[1].expected.iroha.taira.publicKeyHex;
const STORED_ACCOUNT = 'stored-substrate-account';
const TAIRA_CHAIN_ID = 'fc56984b-2be7-431d-840e-21514d1883f0';
const TAIRA_XOR_ASSET_ID = '6TEAJqbb8oEPmLncoNiMRbLEK6tw';
const KINA_ASSET_ID = '5HFTUK41MFWnFdeHo5XySHC7PQun';
const NETWORK_ID = UNIVERSAL_WALLET_IROHA_NETWORKS.taira.networkId;
const TAIRA_FEES = {
  base_fee: '0',
  fee_asset_id: TAIRA_XOR_ASSET_ID,
  per_byte_fee: '0',
  per_gas_unit_fee: '0.00005',
  per_instruction_fee: '0.001',
};

type ToriiScript = {
  balances?: ReadonlyArray<{ asset: string; quantity: string }>;
  capabilities?: Record<string, unknown>;
  definitions?: Record<string, number>;
  fees?: Record<string, unknown>;
  genesis?: string;
  statuses?: Array<Record<string, unknown> | 'missing'>;
  submit?: (body: Uint8Array) => Response;
};

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
  publicKeyHex = IROHA_PUBLIC_KEY,
  seed = MNEMONIC,
  networks = {
    Taira: irohaNetwork('Taira', TAIRA_CHAIN_ID, { chainDiscriminant: 369 }),
    Nexus: irohaNetwork('Nexus', 'sora:nexus:global', { chainDiscriminant: 753 }),
  },
}: {
  publicKeyHex?: string;
  seed?: string;
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
            irohaAddress: TAIRA_ACCOUNT_ID,
            irohaPublicKeyHex: publicKeyHex,
            walletEcosystem: WalletEcosystem.Iroha,
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
    headers: { 'content-type': 'application/json; charset=utf-8' },
    status,
  });
}

function scriptedTorii(script: ToriiScript = {}) {
  const submitted: Uint8Array[] = [];
  const statusHashes: string[] = [];
  const statuses = [...(script.statuses ?? [])];
  const fetchFn = vi.fn(async (input: string | URL, init: RequestInit = {}) => {
    const url = new URL(input.toString());
    const path = decodeURIComponent(url.pathname);

    if (path === '/v1/explorer/blocks/1') {
      return jsonResponse({ hash: script.genesis ?? NETWORK_ID, height: 1, prev_block_hash: null });
    }
    if (path === '/v1/node/capabilities') {
      return jsonResponse(
        script.capabilities ?? {
          abi_version: 1,
          data_model_version: IROHA_TRANSACTION_WIRE.dataModelVersion,
          signed_transaction_schema_hash_hex: IROHA_TRANSACTION_WIRE.signedTransactionSchemaHash,
        }
      );
    }
    if (path === '/v1/parameters') {
      return jsonResponse({ custom: { root_fees_v1: { id: 'root_fees_v1', payload: script.fees ?? TAIRA_FEES } } });
    }
    if (path.startsWith('/v1/assets/definitions/')) {
      const id = path.slice('/v1/assets/definitions/'.length);
      const scale = (script.definitions ?? { [TAIRA_XOR_ASSET_ID]: 9, [KINA_ASSET_ID]: 2 })[id];

      return scale === undefined
        ? jsonResponse({ code: 'not_found', message: 'unknown asset' }, 404)
        : jsonResponse({ id, spec: { scale } });
    }
    if (path === `/v1/accounts/${TAIRA_ACCOUNT_ID}/assets`) {
      const balances = script.balances ?? [{ asset: TAIRA_XOR_ASSET_ID, quantity: '100' }];

      return jsonResponse({
        items: balances.map(({ asset, quantity }) => ({ account_id: TAIRA_ACCOUNT_ID, asset, quantity, scope: 'global' })),
        next_cursor: null,
      });
    }
    if (path === '/v1/pipeline/transactions' && init.method === 'POST') {
      const body = new Uint8Array(init.body as Uint8Array);

      submitted.push(body);

      return script.submit ? script.submit(body) : jsonResponse({ payload: {} }, 202);
    }
    if (path === '/v1/pipeline/transactions/status') {
      const hash = url.searchParams.get('hash') ?? '';
      const next = statuses.shift() ?? { kind: 'Applied', block_height: 7 };

      statusHashes.push(hash);
      if (next === 'missing') {
        return jsonResponse({ code: 'pipeline_transaction_status_not_found', message: 'none' }, 404);
      }

      return jsonResponse({ hash, scope: 'global', resolved_from: 'state', status: next });
    }

    throw new Error(`unexpected ${init.method ?? 'GET'} ${path}`);
  });
  const client = new IrohaToriiWalletClient({ baseUrl: 'https://taira.sora.org', fetchFn, network: 'taira' });

  return { client, fetchFn, statusHashes, submitted };
}

function transferParams(state = createState(), overrides: Record<string, unknown> = {}) {
  return {
    amount: '12.34',
    assetId: TAIRA_XOR_ASSET_ID,
    callback: vi.fn(),
    from: TAIRA_ACCOUNT_ID,
    networkKey: 'Taira',
    state,
    to: TAIRA_COUNTERPARTY,
    ...overrides,
  };
}

describe('background Iroha transfer', () => {
  const originalEnableIrohaTransfers = process.env.VUE_APP_ENABLE_IROHA_TRANSFERS;

  beforeEach(() => {
    process.env.VUE_APP_ENABLE_IROHA_TRANSFERS = 'true';
  });

  afterEach(() => {
    if (originalEnableIrohaTransfers === undefined) delete process.env.VUE_APP_ENABLE_IROHA_TRANSFERS;
    else process.env.VUE_APP_ENABLE_IROHA_TRANSFERS = originalEnableIrohaTransfers;
  });

  it('stays disabled without the release flag and makes no request', async () => {
    process.env.VUE_APP_ENABLE_IROHA_TRANSFERS = 'false';
    const { client, fetchFn } = scriptedTorii();

    expect(isIrohaTransferEnabled()).toBe(false);
    await expect(estimateIrohaTransferFee(transferParams(), getIrohaTransferFrameBytes, client)).rejects.toThrow(
      'iroha_transfer_disabled'
    );
    await expect(
      makeIrohaTransfer(transferParams(), browserIrohaTransferCodec, getIrohaTransferFrameBytes, client)
    ).rejects.toThrow('iroha_transfer_disabled');
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('normalizes the transfer request against the stored Taira account', () => {
    const state = createState({
      networks: {
        Taira: irohaNetwork('Taira', TAIRA_CHAIN_ID, {
          chainDiscriminant: 369,
          currentProvider: 'torii',
          providers: { torii: 'https://taira.sora.org/v1/mcp' },
        }),
      },
    });

    expect(prepareIrohaTransfer(transferParams(state, { amount: '12.3400' }))).toMatchObject({
      amount: '12.34',
      assetDefinitionId: TAIRA_XOR_ASSET_ID,
      destinationAccountId: TAIRA_COUNTERPARTY,
      network: 'taira',
      networkKey: 'Taira',
      source: { accountAddress: STORED_ACCOUNT, irohaAddress: TAIRA_ACCOUNT_ID, publicKeyHex: IROHA_PUBLIC_KEY },
      sourceAssetId: `${TAIRA_XOR_ASSET_ID}#${TAIRA_ACCOUNT_ID}`,
      toriiBaseUrl: 'https://taira.sora.org',
    });
    expect(() => prepareIrohaTransfer(transferParams(state, { to: NEXUS_COUNTERPARTY }))).toThrow();
    expect(() => prepareIrohaTransfer(transferParams(state, { assetId: 'xor#sora' }))).toThrow('invalid_iroha_asset_id');
  });

  it.each(['0', '0.000', '-1', ' 1', '1e3', '01', '1.', '.5', '1.12345678901234567890123456789'])(
    'rejects the noncanonical amount %j',
    (amount) => {
      expect(() => normalizeIrohaTransferAmount(amount)).toThrow('invalid_iroha_amount');
    }
  );

  it('keeps only https or loopback Torii endpoints', () => {
    expect(normalizeIrohaToriiBaseUrl('https://taira.sora.org/')).toBe('https://taira.sora.org');
    expect(normalizeIrohaToriiBaseUrl('http://127.0.0.1:8080/v1/mcp')).toBe('http://127.0.0.1:8080');
    expect(() => normalizeIrohaToriiBaseUrl('http://taira.sora.org')).toThrow('invalid_iroha_torii_url');
    expect(() => normalizeIrohaToriiBaseUrl('https://taira.sora.org?q=1')).toThrow('invalid_iroha_torii_url');
    expect(normalizeIrohaAssetDefinitionId(TAIRA_XOR_ASSET_ID)).toBe(TAIRA_XOR_ASSET_ID);
  });

  it('maps Iroha networks by registry chain id and I105 discriminant', () => {
    expect(getIrohaNetworkKey(irohaNetwork('Taira', TAIRA_CHAIN_ID, { chainDiscriminant: 369 }))).toBe('taira');
    expect(getIrohaNetworkKey(irohaNetwork('Nexus', 'sora:nexus:global'))).toBe('nexus');
    expect(() => getIrohaNetworkKey(irohaNetwork('Taira', TAIRA_CHAIN_ID, { chainDiscriminant: 753 }))).toThrow(
      'ambiguous_iroha_network'
    );
    expect(() => getIrohaNetworkKey(irohaNetwork('Other', 'other', { chainDiscriminant: 369 }))).toThrow(
      'noncanonical_iroha_chain_id'
    );
  });

  it('prices a transfer exactly from the live fee schedule', async () => {
    const { client } = scriptedTorii();

    await expect(estimateIrohaTransferFee(transferParams(), getIrohaTransferFrameBytes, client)).resolves.toBe('0.01');
    expect(
      computeIrohaTransferFee(
        {
          assetDefinitionId: TAIRA_XOR_ASSET_ID,
          baseFee: '0.5',
          perByteFee: '0.000001',
          perGasUnitFee: '0.00005',
          perInstructionFee: '0.001',
        },
        600
      )
    ).toBe('0.5106');
  });

  it('prices an incomplete send form as a placeholder transfer', async () => {
    const { client } = scriptedTorii();

    await expect(
      estimateIrohaTransferFee(transferParams(createState(), { amount: '0', to: '' }), getIrohaTransferFrameBytes, client)
    ).resolves.toBe('0.01');
    await expect(
      estimateIrohaTransferFee(transferParams(createState(), { to: NEXUS_COUNTERPARTY }), getIrohaTransferFrameBytes, client)
    ).resolves.toBe('0.01');
  });

  it('settles the signed fee cap when the fee depends on the encoded size', async () => {
    const { client } = scriptedTorii({ fees: { ...TAIRA_FEES, per_byte_fee: '0.000001' } });
    const sizes: string[] = [];
    const sizer: IrohaTransferFrameSizer = (input) => {
      sizes.push(input.maxFee);

      return getIrohaTransferFrameBytes(input);
    };
    const fee = await estimateIrohaTransferFee(transferParams(), sizer, client);
    const frameBytes = getIrohaTransferFrameBytes({
      amount: '12.34',
      authority: TAIRA_ACCOUNT_ID,
      creationTimeMs: 1,
      destinationAccountId: TAIRA_COUNTERPARTY,
      feeAssetDefinitionId: TAIRA_XOR_ASSET_ID,
      maxFee: fee,
      networkId: NETWORK_ID,
      networkPrefix: 369,
      signingPublicKeyHex: IROHA_PUBLIC_KEY,
      sourceAssetId: `${TAIRA_XOR_ASSET_ID}#${TAIRA_ACCOUNT_ID}`,
      ttlMs: 60_000,
    });

    expect(fee).toBe(
      computeIrohaTransferFee(
        {
          assetDefinitionId: TAIRA_XOR_ASSET_ID,
          baseFee: '0',
          perByteFee: '0.000001',
          perGasUnitFee: '0.00005',
          perInstructionFee: '0.001',
        },
        frameBytes
      )
    );
    expect(sizes.at(-1)).toBe(fee);
  });

  it.each([
    ['a reset Taira genesis', { genesis: 'hash:0000000000000000000000000000000000000000000000000000000000000001#2E2B' }, 'iroha_network_reset'],
    [
      'an upgraded transaction schema',
      { capabilities: { data_model_version: 5, signed_transaction_schema_hash_hex: IROHA_TRANSACTION_WIRE.signedTransactionSchemaHash } },
      'iroha_node_protocol_unsupported',
    ],
    ['a missing fee schedule', { fees: { fee_asset_id: TAIRA_XOR_ASSET_ID } }, 'iroha_fee_estimation_unavailable'],
  ] as const)('refuses to sign against %s', async (_label, script, message) => {
    const { client, submitted } = scriptedTorii(script);
    const codec = { buildAndSignTransfer: vi.fn() };

    await expect(makeIrohaTransfer(transferParams(), codec, getIrohaTransferFrameBytes, client)).rejects.toThrow(message);
    expect(codec.buildAndSignTransfer).not.toHaveBeenCalled();
    expect(submitted).toHaveLength(0);
  });

  it('refuses amounts finer than the asset scale', async () => {
    const { client } = scriptedTorii();

    await expect(
      estimateIrohaTransferFee(transferParams(createState(), { amount: '1.0000000001' }), getIrohaTransferFrameBytes, client)
    ).rejects.toThrow('invalid_iroha_amount_precision');
  });

  it.each([
    ['the amount plus fee', { balances: [{ asset: TAIRA_XOR_ASSET_ID, quantity: '12.34' }] }, {}, 'iroha_insufficient_balance'],
    [
      'the fee in XOR for another asset',
      { balances: [{ asset: KINA_ASSET_ID, quantity: '50' }] },
      { amount: '5', assetId: KINA_ASSET_ID },
      'iroha_insufficient_fee_balance',
    ],
  ] as const)('refuses to sign without funds for %s', async (_label, script, overrides, message) => {
    const { client, submitted } = scriptedTorii(script);
    const codec = { buildAndSignTransfer: vi.fn() };

    await expect(
      makeIrohaTransfer(transferParams(createState(), overrides), codec, getIrohaTransferFrameBytes, client)
    ).rejects.toThrow(message);
    expect(codec.buildAndSignTransfer).not.toHaveBeenCalled();
    expect(submitted).toHaveLength(0);
  });

  it('signs with the bundled browser codec and submits the exact bytes to Torii', async () => {
    const { client, statusHashes, submitted } = scriptedTorii({ statuses: ['missing', { kind: 'Queued' }] });
    const inputs: IrohaTransferCodecInput[] = [];
    const codec: IrohaTransferCodec = {
      async buildAndSignTransfer(input) {
        inputs.push(input);

        return browserIrohaTransferCodec.buildAndSignTransfer(input);
      },
    };
    const params = transferParams();

    await makeIrohaTransfer(params, codec, getIrohaTransferFrameBytes, client);

    expect(inputs).toHaveLength(1);
    expect(inputs[0]).toMatchObject({
      amount: '12.34',
      authority: TAIRA_ACCOUNT_ID,
      destinationAccountId: TAIRA_COUNTERPARTY,
      feeAssetDefinitionId: TAIRA_XOR_ASSET_ID,
      maxFee: '0.01',
      networkId: NETWORK_ID,
      networkPrefix: 369,
      signingPublicKeyHex: IROHA_PUBLIC_KEY,
      sourceAssetId: `${TAIRA_XOR_ASSET_ID}#${TAIRA_ACCOUNT_ID}`,
      ttlMs: 60_000,
    });
    expect(submitted).toHaveLength(1);
    expect(submitted[0][0]).toBe(1);
    expect(new Set(statusHashes).size).toBe(1);
    expect(statusHashes[0]).toMatch(/^[0-9a-f]{63}[13579bdf]$/u);
    expect(params.callback).toHaveBeenCalledWith({ status: true });
    expect(params.state.balanceService.fetchBalance).toHaveBeenCalledWith(
      expect.objectContaining({ irohaAddress: TAIRA_ACCOUNT_ID, irohaNetworks: ['Taira'] })
    );
  });

  it('surfaces a ledger rejection without reporting success', async () => {
    const { client } = scriptedTorii({ statuses: [{ kind: 'Rejected', reason: 'insufficient funds' }] });
    const params = transferParams();
    const error = await makeIrohaTransfer(params, browserIrohaTransferCodec, getIrohaTransferFrameBytes, client).catch(
      (caught: unknown) => caught
    );

    expect(error).toBeInstanceOf(IrohaTransactionRejectedError);
    expect(params.callback).not.toHaveBeenCalled();
  });

  it('produces deterministic canonical bytes and refuses a key that does not control the account', async () => {
    const input: IrohaTransferCodecInput = {
      amount: '1.5',
      authority: TAIRA_ACCOUNT_ID,
      creationTimeMs: 1_792_674_000_000,
      derivationPath: "m/44'/617'/0'/0'",
      destinationAccountId: TAIRA_COUNTERPARTY,
      feeAssetDefinitionId: TAIRA_XOR_ASSET_ID,
      maxFee: '0.01',
      mnemonicOrSeed: MNEMONIC,
      networkId: NETWORK_ID,
      networkPrefix: 369,
      signingPublicKeyHex: IROHA_PUBLIC_KEY,
      sourceAssetId: `${TAIRA_XOR_ASSET_ID}#${TAIRA_ACCOUNT_ID}`,
      ttlMs: 60_000,
    };
    const first = await browserIrohaTransferCodec.buildAndSignTransfer(input);
    const second = await (await requireProductionIrohaTransferCodec()).buildAndSignTransfer(input);
    const otherAmount = await browserIrohaTransferCodec.buildAndSignTransfer({ ...input, amount: '1.6' });

    expect(Array.from(first.signedTransaction)).toEqual(Array.from(second.signedTransaction));
    expect(first.signedTransactionHashHex).toBe(second.signedTransactionHashHex);
    expect(otherAmount.signedTransactionHashHex).not.toBe(first.signedTransactionHashHex);
    await expect(
      browserIrohaTransferCodec.buildAndSignTransfer({ ...input, signingPublicKeyHex: OTHER_PUBLIC_KEY })
    ).rejects.toThrow('iroha_signing_key_mismatch');
    await expect(
      browserIrohaTransferCodec.buildAndSignTransfer({ ...input, sourceAssetId: `${TAIRA_XOR_ASSET_ID}#${TAIRA_COUNTERPARTY}` })
    ).rejects.toThrow();
  });
});
