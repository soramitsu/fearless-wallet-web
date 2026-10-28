import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { Metadata, TypeRegistry, expandMetadata } from '@polkadot/types';
import { encodeAddress } from '@polkadot/util-crypto';
import {
  assertNoRetiredCrossChainDestination,
  reviewSubstrateCall,
  sameSubstrateCallReview,
  type SubstrateCallReview,
} from '@extension-base/services/request-service/handlers/substrateCallReview';
import type State from '@extension-base/background/handlers/State';
import type { NetworkJson } from '@extension-base/types';
import { summarizeCrossChainCalls, type DecodedCall } from '@/cross-chain/dappCrossChainCalls';
import {
  ASSET_HUB_MIGRATION_RETIRED,
  DEAD_PARACHAINS,
  RETIRED_CROSS_CHAIN_CHAINS,
  SORA_PARACHAIN_HALTED,
  SORA_TO_LIBERLAND_STALLED,
} from '@/cross-chain/reviewedRoutes';

const FIXTURES = resolve(__dirname, '../fixtures/metadata');
const POLKADOT = '91b171bb158e2d3848fa23a9f1c25182fb8e20313b2c1eb49219da7a70ce90c3';
const KUSAMA = 'b0a8d493285c2df73290dfb7e61f870f17b41801197a149ca93654499ea3dafe';
const LIBERLAND = '6bd89e052d67a45bb60a9a23e8581053d5e0d619f15cb9865946937e690c42d6';
const SORA = '7e4e32d0feafd4f9c9414b0be86373f9a1efa904809b683453a9af6856d38ad5';
const SORA_TEST = '3266816be9fa51b32cfea58d3e33ca77246bc9618595a4300e44c8856a8d8a17';
const MOONBEAM = 'fe58ea77779b7abda7da4ec526d14db9b1e9cd40a217c34892af80a9b332b76d';
const MOONRIVER = '401a1f9dca3da46f5c4091016c8a2f26dcea05865116b286f60f668207d1474b';
const ALICE = '0xd43593c715fdd31c61141abd04a99fd6822c8558854ccde39a5684e7a56da27d';
const EVM = '0x1111111111111111111111111111111111111111';
const XOR = '0x0200000000000000000000000000000000000000000000000000000000000000';

const catalog = (
  JSON.parse(
    readFileSync(resolve(__dirname, '../../remote-config/production/chains/v13/chains.json'), 'utf8')
  ) as NetworkJson[]
).map(({ name, chainId, parentId, paraId, addressPrefix }) => ({ name, chainId, parentId, paraId, addressPrefix }));

const snapshots: Record<string, string> = {
  [POLKADOT]: 'polkadot-2005000.scale.gz',
  [KUSAMA]: 'kusama-2003002.scale.gz',
  [LIBERLAND]: 'liberland-34.scale.gz',
};
const runtimes = new Map<string, { registry: TypeRegistry; tx: ReturnType<typeof expandMetadata>['tx'] }>();

/** The registry of a reviewed runtime, decorated from its saved metadata like the wallet's live API. */
function runtime(chainId: string) {
  const cached = runtimes.get(chainId);
  if (cached) return cached;
  const registry = new TypeRegistry();
  const metadata = new Metadata(registry, gunzipSync(readFileSync(resolve(FIXTURES, snapshots[chainId]))));
  registry.setMetadata(metadata);
  const built = { registry, tx: expandMetadata(registry, metadata).tx };
  runtimes.set(chainId, built);

  return built;
}

/** Decodes the bytes again, as the wallet does with a payload's method. */
const decode = (chainId: string, call: { toHex(): string }) =>
  runtime(chainId).registry.createType('Call', call.toHex()) as unknown as DecodedCall;
const summarize = (chainId: string, call: { toHex(): string }) =>
  summarizeCrossChainCalls(decode(chainId, call), {
    chainId,
    name: catalog.find((row) => row.chainId === chainId)?.name,
    networks: catalog,
  });

const parachain = (paraId: number, version: 'V3' | 'V4' = 'V3') => ({
  [version]: { parents: 0, interior: { X1: version === 'V3' ? { Parachain: paraId } : [{ Parachain: paraId }] } },
});
const alice = (network: string | null = null, version: 'V3' | 'V4' = 'V3') => {
  const junction = { AccountId32: { network: network ? { [network]: null } : null, id: ALICE } };

  return { [version]: { parents: 0, interior: { X1: version === 'V3' ? junction : [junction] } } };
};
const native = (amount: string, version: 'V3' | 'V4' = 'V3') => ({
  [version]: [
    {
      id: version === 'V3' ? { Concrete: { parents: 0, interior: 'Here' } } : { parents: 0, interior: 'Here' },
      fun: { Fungible: amount },
    },
  ],
});

describe('destinations known not to deliver', () => {
  it('sit at the para ids the registry gives those chains on their relay', () => {
    const relayChain = { Polkadot: POLKADOT, Kusama: KUSAMA };

    expect(DEAD_PARACHAINS.map(({ chainId, relay, paraId }) => [chainId, relay, paraId])).toEqual(
      DEAD_PARACHAINS.map(({ chainId }) => {
        const row = catalog.find((network) => network.chainId === chainId)!;
        const relay = Object.entries(relayChain).find(([, id]) => id === row.parentId)?.[0];

        return [chainId, relay, Number(row.paraId)];
      })
    );
    expect(DEAD_PARACHAINS.map(({ code }) => code)).toEqual([
      'retired-chain',
      'retired-chain',
      'retired-chain',
      'sora-parachain-halted',
      'sora-parachain-halted',
    ]);
  });
});

describe('cross-chain calls in a dApp payload, decoded with the reviewed Polkadot runtime', () => {
  const tx = () => runtime(POLKADOT).tx;
  const teleport = (paraId = 1000) =>
    tx().xcmPallet.limitedTeleportAssets(parachain(paraId), alice('Polkadot'), native('15000000000'), 0, 'Unlimited');

  it('summarises a teleport to Asset Hub: destination, recipient, asset and amount', () => {
    expect(summarize(POLKADOT, teleport())).toEqual([
      {
        path: '0',
        call: 'xcmPallet.limitedTeleportAssets',
        destination: { network: 'Polkadot AssetHub', relay: 'Polkadot', paraId: 1000 },
        beneficiary: encodeAddress(ALICE, 0),
        assets: [{ asset: 'DOT', amount: '1.5' }],
        highRisk: false,
      },
    ]);
  });

  it('refuses a relay reserve transfer of DOT, retired by the Asset Hub Migration', () => {
    const reserve = tx().xcmPallet.limitedReserveTransferAssets(parachain(2000), alice(), native('10000000000'), 0, 'Unlimited');

    expect(summarize(POLKADOT, reserve)).toEqual([
      expect.objectContaining({
        call: 'xcmPallet.limitedReserveTransferAssets',
        destination: { network: 'Acala', relay: 'Polkadot', paraId: 2000 },
        assets: [{ asset: 'DOT', amount: '1' }],
        blocked: { code: 'asset-hub-migration', reason: ASSET_HUB_MIGRATION_RETIRED },
      }),
    ]);
  });

  it.each([
    [1000, undefined],
    [2034, 'asset-hub-migration'],
  ])('lets transferAssets of DOT choose a teleport to para %i, but refuses a relay reserve transfer', (paraId, code) => {
    const call = tx().xcmPallet.transferAssets(parachain(paraId, 'V4'), alice(null, 'V4'), native('1', 'V4'), 0, 'Unlimited');

    expect(summarize(POLKADOT, call)[0].blocked?.code).toBe(code);
  });

  it.each([
    ['LocalReserve', 'asset-hub-migration'],
    ['Teleport', undefined],
  ])('reads a %s transfer of DOT with custom instructions as high risk, refusing a relay reserve', (type, code) => {
    const call = tx().xcmPallet.transferAssetsUsingTypeAndThen(
      parachain(1000, 'V4'),
      native('1', 'V4'),
      type,
      { V4: { parents: 0, interior: 'Here' } },
      type,
      { V4: [{ ClearOrigin: null }] },
      'Unlimited'
    );

    expect(summarize(POLKADOT, call)).toEqual([
      expect.objectContaining({ call: 'xcmPallet.transferAssetsUsingTypeAndThen', highRisk: true }),
    ]);
    expect(summarize(POLKADOT, call)[0].blocked?.code).toBe(code);
  });

  it('refuses any transfer to the retired Moonbeam parachain, with the bundle reason', () => {
    const recipient = { V4: { parents: 0, interior: { X1: [{ AccountKey20: { network: null, key: EVM } }] } } };
    const call = tx().xcmPallet.transferAssets(parachain(2004, 'V4'), recipient, native('12345678901234567890', 'V4'), 0, 'Unlimited');

    expect(summarize(POLKADOT, call)).toEqual([
      expect.objectContaining({
        destination: { network: 'Moonbeam', relay: 'Polkadot', paraId: 2004 },
        beneficiary: EVM,
        assets: [{ asset: 'DOT', amount: '1234567890.123456789' }],
        blocked: { code: 'retired-chain', reason: RETIRED_CROSS_CHAIN_CHAINS[MOONBEAM] },
      }),
    ]);
  });

  it('refuses a transfer to the halted SORA parachain', () => {
    expect(summarize(POLKADOT, teleport(2025))[0].blocked).toEqual({
      code: 'sora-parachain-halted',
      reason: SORA_PARACHAIN_HALTED,
    });
  });

  it('finds calls nested in batches, proxies and multisig calls, with their position', () => {
    const transfer = tx().balances.transferKeepAlive(encodeAddress(ALICE, 0), 1);
    const reserve = tx().xcmPallet.reserveTransferAssets(parachain(2000), alice(), native('1'), 0);
    const toMoonbeam = tx().xcmPallet.transferAssets(parachain(2004, 'V4'), alice(null, 'V4'), native('1', 'V4'), 0, 'Unlimited');

    expect(summarize(POLKADOT, tx().utility.batchAll([transfer, teleport()])).map(({ path }) => path)).toEqual(['0.0.1']);
    expect(summarize(POLKADOT, tx().proxy.proxy(encodeAddress(ALICE, 0), null, toMoonbeam))).toEqual([
      expect.objectContaining({ path: '0.2.0', blocked: expect.objectContaining({ code: 'retired-chain' }) }),
    ]);
    expect(summarize(POLKADOT, tx().multisig.asMultiThreshold1([encodeAddress(ALICE, 0)], teleport()))).toEqual([
      expect.objectContaining({ path: '0.1.0', call: 'xcmPallet.limitedTeleportAssets' }),
    ]);
    expect(summarize(POLKADOT, tx().utility.forceBatch([tx().utility.batch([transfer, reserve])]))).toEqual([
      expect.objectContaining({ path: '0.0.0.0.1', blocked: expect.objectContaining({ code: 'asset-hub-migration' }) }),
    ]);
  });

  it('marks raw XCM instructions as high risk', () => {
    const execute = tx().xcmPallet.execute({ V4: [{ ClearOrigin: null }] }, { refTime: 1, proofSize: 1 });
    const send = tx().xcmPallet.send(parachain(1000), { V3: [{ ClearOrigin: null }] });

    expect(summarize(POLKADOT, execute)).toEqual([
      { path: '0', call: 'xcmPallet.execute', assets: [], highRisk: true },
    ]);
    expect(summarize(POLKADOT, send)).toEqual([
      expect.objectContaining({ call: 'xcmPallet.send', destination: expect.objectContaining({ paraId: 1000 }), highRisk: true }),
    ]);
    expect(summarize(POLKADOT, teleport())[0].highRisk).toBe(false);
  });

  it('finds nothing in an ordinary call', () => {
    expect(summarize(POLKADOT, tx().balances.transferKeepAlive(encodeAddress(ALICE, 0), 1))).toEqual([]);
  });
});

describe('cross-chain calls decoded with the reviewed Kusama runtime', () => {
  const tx = () => runtime(KUSAMA).tx;

  it('refuses the retired Moonriver and the halted SORA parachain of Kusama', () => {
    const toMoonriver = tx().xcmPallet.limitedTeleportAssets(parachain(2023), alice(), native('1'), 0, 'Unlimited');
    const toSora = tx().xcmPallet.limitedTeleportAssets(parachain(2011), alice(), native('1'), 0, 'Unlimited');

    expect(summarize(KUSAMA, toMoonriver)[0].blocked).toEqual({
      code: 'retired-chain',
      reason: RETIRED_CROSS_CHAIN_CHAINS[MOONRIVER],
    });
    expect(summarize(KUSAMA, toSora)[0].blocked?.code).toBe('sora-parachain-halted');
  });

  it('reads the same para id on Kusama as a different chain from Polkadot', () => {
    // Para 2004 is Moonbeam on Polkadot only.
    const call = tx().xcmPallet.limitedTeleportAssets(parachain(2004), alice(), native('1000000000000'), 0, 'Unlimited');

    expect(summarize(KUSAMA, call)).toEqual([
      expect.objectContaining({ assets: [{ asset: 'KSM', amount: '1' }], destination: expect.objectContaining({ relay: 'Kusama', paraId: 2004 }) }),
    ]);
    expect(summarize(KUSAMA, call)[0].blocked).toBeUndefined();
  });
});

describe('Liberland to SORA burns decoded with the reviewed Liberland runtime', () => {
  it.each([
    ['LLD', '0x5103000001d43593c715fdd31c61141abd04a99fd6822c8558854ccde39a5684e7a56da27d00204aa9d10100000000000000000000', '2'],
    ['LLM', '0x510300010100000001d43593c715fdd31c61141abd04a99fd6822c8558854ccde39a5684e7a56da27d0030ef7dba0200000000000000000000', '3'],
    ['XOR', '0x51030001150b292e01d43593c715fdd31c61141abd04a99fd6822c8558854ccde39a5684e7a56da27d0000d9e9ac2d78030000000000000000', '0.25'],
  ])('shows the %s burn to SORA without refusing it', (symbol, call, amount) => {
    expect(summarize(LIBERLAND, { toHex: () => call })).toEqual([
      {
        path: '0',
        call: 'soraBridgeApp.burn',
        destination: { network: 'SORA Mainnet' },
        beneficiary: encodeAddress(ALICE, 69),
        assets: [{ asset: symbol, amount }],
        highRisk: false,
      },
    ]);
  });
});

/** A call as polkadot-js decodes it from SORA's runtime, whose metadata the tests do not carry. */
const soraCall = (section: string, method: string, args: Record<string, unknown>, nested: unknown[] = []): DecodedCall => ({
  section,
  method,
  args: nested,
  toJSON: () => ({ callIndex: '0x6700', args }),
  toRawType: () => 'Call',
});
const burn = (networkId: unknown, recipient: unknown, amount: unknown = '0x00000000000000000de0b6b3a7640000') =>
  soraCall('bridgeProxy', 'burn', { network_id: networkId, asset_id: { code: XOR }, recipient, amount });
const relayRecipient = { parachain: { v3: { parents: 1, interior: { x1: { accountId32: { network: null, id: ALICE } } } } } };
const acalaRecipient = {
  parachain: { v3: { parents: 1, interior: { x2: [{ parachain: 2000 }, { accountId32: { network: null, id: ALICE } }] } } },
};
const soraSummary = (call: DecodedCall, chainId = SORA) => summarizeCrossChainCalls(call, { chainId, networks: catalog });

describe('SORA bridge burns', () => {
  it.each([
    ['Polkadot', relayRecipient, { network: 'Polkadot' }],
    ['Kusama', relayRecipient, { network: 'Kusama' }],
    ['Rococo', relayRecipient, { network: 'Rococo' }],
    ['Polkadot', acalaRecipient, { network: 'Acala', relay: 'Polkadot', paraId: 2000 }],
  ])('refuses a burn toward %s, whose SORA parachain is halted', (network, recipient, destination) => {
    expect(soraSummary(burn({ sub: network }, recipient))).toEqual([
      expect.objectContaining({
        call: 'bridgeProxy.burn',
        destination,
        assets: [{ asset: 'XOR', amount: '1' }],
        blocked: { code: 'sora-parachain-halted', reason: SORA_PARACHAIN_HALTED },
      }),
    ]);
  });

  it('formats a parachain recipient in the format of its chain', () => {
    expect(soraSummary(burn({ sub: 'Polkadot' }, acalaRecipient))[0].beneficiary).toBe(encodeAddress(ALICE, 10));
  });

  it('refuses a burn toward Liberland, which SORA no longer delivers', () => {
    expect(soraSummary(burn({ sub: 'Liberland' }, { liberland: encodeAddress(ALICE, 69) }))).toEqual([
      expect.objectContaining({
        destination: { network: 'Liberland' },
        beneficiary: encodeAddress(ALICE, 42),
        blocked: { code: 'sora-to-liberland-stalled', reason: SORA_TO_LIBERLAND_STALLED },
      }),
    ]);
  });

  it('refuses a burn nested in a batch', () => {
    const batch = soraCall('utility', 'batchAll', {}, [[soraCall('balances', 'transfer', {}), burn({ sub: 'Kusama' }, relayRecipient)]]);

    expect(soraSummary(batch)).toEqual([
      expect.objectContaining({ path: '0.0.1', blocked: expect.objectContaining({ code: 'sora-parachain-halted' }) }),
    ]);
  });

  it('shows but does not refuse bridges the bundle knows nothing against', () => {
    const toEvm = burn({ evm: `0x${'00'.repeat(31)}01` }, { evm: EVM });
    const toEthereum = soraCall('ethBridge', 'transferToSidechain', { asset_id: { code: XOR }, to: EVM, amount: 5, network_id: 0 });

    expect(soraSummary(toEvm)[0]).toMatchObject({ call: 'bridgeProxy.burn', beneficiary: EVM });
    expect(soraSummary(toEvm)[0].blocked).toBeUndefined();
    expect(soraSummary(toEthereum)).toEqual([
      {
        path: '0',
        call: 'ethBridge.transferToSidechain',
        destination: { network: 'Ethereum' },
        beneficiary: EVM,
        assets: [{ asset: XOR, amount: '5' }],
        highRisk: false,
      },
    ]);
  });

  it('applies the SORA mainnet reasons only to SORA mainnet', () => {
    expect(soraSummary(burn({ sub: 'Rococo' }, relayRecipient), SORA_TEST)[0].blocked).toBeUndefined();
  });

  it('still lists a cross-chain call whose arguments cannot be read', () => {
    const unreadable = { ...soraCall('xTokens', 'transfer', {}), toJSON: () => { throw new Error('unreadable'); } };

    expect(soraSummary(unreadable)).toEqual([{ path: '0', call: 'xTokens.transfer', assets: [], highRisk: false }]);
  });

  it('refuses to walk a call nested deeper than a runtime decodes', () => {
    let call = burn({ sub: 'Kusama' }, relayRecipient);
    for (let depth = 0; depth < 300; depth += 1) call = soraCall('utility', 'batch', {}, [[call]]);

    expect(() => soraSummary(call)).toThrow('Call nested too deeply');
  });
});

describe('decoding a payload with the wallet runtime of its network', () => {
  const polkadotNetwork = { name: 'Polkadot', chainId: POLKADOT, genesisHash: `0x${POLKADOT}` } as NetworkJson;
  const liveApi = (overrides: Record<string, unknown> = {}) => ({
    genesisHash: { toHex: () => `0x${POLKADOT}` },
    runtimeVersion: { specVersion: { toString: () => '2005000' } },
    registry: runtime(POLKADOT).registry,
    ...overrides,
  });
  const state = (api?: unknown) =>
    ({
      getSubstrateApiMap: api ? { polkadot: { api } } : {},
      networkService: { networkMap: Object.fromEntries(catalog.map((row) => [row.name, row])) },
    }) as unknown as State;
  const payload = (method: string, specVersion = 2005000, genesis = POLKADOT) =>
    ({ genesisHash: `0x${genesis}`, specVersion: `0x${specVersion.toString(16).padStart(8, '0')}`, method }) as never;
  const reserve = () =>
    runtime(POLKADOT)
      .tx.xcmPallet.limitedReserveTransferAssets(parachain(2000), alice(), native('1'), 0, 'Unlimited')
      .toHex();

  it('decodes the call and lists its cross-chain transfers', () => {
    const review = reviewSubstrateCall(state(liveApi()), polkadotNetwork, payload(reserve()));

    expect(review).toMatchObject({ status: 'decoded', crossChain: [{ blocked: { code: 'asset-hub-migration' } }] });
    expect(() => assertNoRetiredCrossChainDestination(review)).toThrow(
      `cross_chain_destination_retired: ${ASSET_HUB_MIGRATION_RETIRED}`
    );
  });

  it.each([
    ['another spec version', liveApi(), payload('0x0000', 2005001)],
    ['another genesis', liveApi({ genesisHash: { toHex: () => `0x${KUSAMA}` } }), payload('0x0000')],
  ])('leaves a payload built for %s unreadable', (_label, api, request) => {
    expect(reviewSubstrateCall(state(api), polkadotNetwork, request)).toEqual({
      status: 'undecodable',
      reason: 'runtime_mismatch',
    });
  });

  it('leaves the payload unreadable without a ready runtime of the network', () => {
    const notReady = {
      genesisHash: { toHex: () => `0x${POLKADOT}` },
      get runtimeVersion(): never {
        throw new Error('Api interface not available');
      },
      registry: runtime(POLKADOT).registry,
    };
    const unavailable = { status: 'undecodable', reason: 'runtime_unavailable' };

    const noConnections = {
      get getSubstrateApiMap(): never {
        throw new Error('Network service is not ready');
      },
    } as unknown as State;

    expect(reviewSubstrateCall(state(), polkadotNetwork, payload(reserve()))).toEqual(unavailable);
    expect(reviewSubstrateCall(state(liveApi()), undefined, payload(reserve()))).toEqual(unavailable);
    expect(reviewSubstrateCall(state(notReady), polkadotNetwork, payload(reserve()))).toEqual(unavailable);
    expect(reviewSubstrateCall(noConnections, polkadotNetwork, payload(reserve()))).toEqual(unavailable);
  });

  it.each([
    ['bytes of no call', '0xffff'],
    ['a call followed by extra bytes', `${'0x630903000100a10f030001010102d43593c715fdd31c61141abd04a99fd6822c8558854ccde39a5684e7a56da27d0304000000000700d6117e030000000000'}00`],
  ])('leaves %s unreadable', (_label, method) => {
    expect(reviewSubstrateCall(state(liveApi()), polkadotNetwork, payload(method))).toEqual({
      status: 'undecodable',
      reason: 'call_undecodable',
    });
  });
});

describe('call review at approval', () => {
  const decoded = (crossChain: unknown[] = []) => ({ status: 'decoded', crossChain }) as SubstrateCallReview;
  const unreadable = { status: 'undecodable', reason: 'runtime_unavailable' } as SubstrateCallReview;
  const item = { path: '0', call: 'xcmPallet.limitedTeleportAssets', assets: [], highRisk: false };

  it('accepts the review the user saw', () => {
    expect(sameSubstrateCallReview(decoded([item]), decoded([item]))).toBe(true);
    expect(sameSubstrateCallReview(unreadable, unreadable)).toBe(true);
  });

  it('accepts an unreadable admission that turns out to hold no cross-chain transfer', () => {
    expect(sameSubstrateCallReview(unreadable, decoded())).toBe(true);
  });

  it('refuses a review that changed in any other way', () => {
    expect(sameSubstrateCallReview(unreadable, decoded([item]))).toBe(false);
    expect(sameSubstrateCallReview(decoded([item]), unreadable)).toBe(false);
    expect(sameSubstrateCallReview(decoded(), decoded([item]))).toBe(false);
    expect(sameSubstrateCallReview(undefined, decoded())).toBe(false);
  });
});
