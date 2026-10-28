import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Keyring } from '@polkadot/keyring';
import { Metadata, TypeRegistry, expandMetadata } from '@polkadot/types';
import { cryptoWaitReady, encodeAddress } from '@polkadot/util-crypto';
import Extension from '@extension-base/background/handlers/Extension';
import { SubstrateRequestHandler } from '@extension-base/services/request-service/handlers/SubstrateRequestHandler';
import { CrossChainDestinationRetiredError } from '@extension-base/services/request-service/handlers/substrateCallReview';
import RequestExtrinsicSign from '@extension-base/signers/RequestExtrinsicSign';
import type State from '@extension-base/background/handlers/State';
import type { RequestService } from '@extension-base/services/request-service';
import type { AccountJson } from '@extension-base/background/types/types';
import type { SignerPayloadJSON } from '@polkadot/types/types';
import { signingReview } from '@/screens/extension-ui/signing/review';
import { CURRENT_WALLET_SECURITY_GENERATION } from '@/util/walletSecurity';

const mocks = vi.hoisted(() => ({ denied: vi.fn() }));
vi.mock('@polkadot/phishing', () => ({ checkIfDenied: mocks.denied }));
vi.mock('@/sora/cosigner', () => ({ decryptForCosigner: vi.fn(), encryptForCosigners: vi.fn() }));
vi.mock('@extension-base/services', () => ({}));
vi.mock('@extension-base/background/handlers', () => ({ state: {}, extension: {}, handlers: vi.fn() }));
vi.mock('@extension-base/utils/crossenv', () => ({
  chrome: { runtime: { getURL: (path: string) => `chrome-extension://fixture/${path}` } },
}));

const POLKADOT = '91b171bb158e2d3848fa23a9f1c25182fb8e20313b2c1eb49219da7a70ce90c3';
const genesisHash = `0x${POLKADOT}` as const;
const ALICE = '0xd43593c715fdd31c61141abd04a99fd6822c8558854ccde39a5684e7a56da27d';
const url = 'https://bridge.example';

const registry = new TypeRegistry();
const metadata = new Metadata(
  registry,
  gunzipSync(readFileSync(resolve(__dirname, '../fixtures/metadata/polkadot-2005000.scale.gz')))
);
registry.setMetadata(metadata);
const tx = expandMetadata(registry, metadata).tx;
/** The wallet's own connection to Polkadot, at the reviewed runtime. */
const polkadotApi = {
  genesisHash: { toHex: () => genesisHash },
  runtimeVersion: { specVersion: { toString: () => '2005000' } },
  registry,
};

const destination = (paraId: number) => ({ V3: { parents: 0, interior: { X1: { Parachain: paraId } } } });
const beneficiary = { V3: { parents: 0, interior: { X1: { AccountId32: { network: null, id: ALICE } } } } };
const dot = { V3: [{ id: { Concrete: { parents: 0, interior: 'Here' } }, fun: { Fungible: '10000000000' } }] };
const calls = {
  teleport: () => tx.xcmPallet.limitedTeleportAssets(destination(1000), beneficiary, dot, 0, 'Unlimited').toHex(),
  reserve: () => tx.xcmPallet.limitedReserveTransferAssets(destination(2000), beneficiary, dot, 0, 'Unlimited').toHex(),
  transfer: () => tx.balances.transferKeepAlive(encodeAddress(ALICE, 0), 1).toHex(),
};

let pair: ReturnType<Keyring['addFromUri']>, state: State, service: RequestService;
let handler: SubstrateRequestHandler, extension: Extension;
const payload = (method: string): SignerPayloadJSON => ({
  address: pair.address,
  genesisHash,
  blockHash: genesisHash,
  blockNumber: '0x00',
  era: '0x00',
  method,
  nonce: '0x02',
  specVersion: `0x${(2005000).toString(16).padStart(8, '0')}`,
  transactionVersion: '0x1a',
  tip: '0x00',
  signedExtensions: ['CheckNonce'],
  version: 4,
});
const connect = (connected: boolean) =>
  Object.assign(state, { getSubstrateApiMap: connected ? { polkadot: { api: polkadotApi } } : {} });

beforeAll(async () => {
  await cryptoWaitReady();
});
beforeEach(() => {
  pair = new Keyring({ type: 'sr25519' }).addFromUri('//Alice');
  mocks.denied.mockReset().mockResolvedValue(false);
  service = {
    popupOpen: vi.fn(),
    updateIcon: vi.fn(),
    ensureAccountAuthorized: vi.fn(async () => true),
    authRequestHandler: { getSigningAuthorizationRevision: () => 0, assertSigningAuthorization: vi.fn() },
    knownMetadata: [],
  } as unknown as RequestService;
  state = {
    requestService: service,
    networkService: {
      networkMap: {
        Polkadot: { name: 'Polkadot', chainId: POLKADOT, genesisHash, ecosystem: 'substrate', disabled: false, addressPrefix: 0 },
        'Polkadot AssetHub': {
          name: 'Polkadot AssetHub',
          chainId: 'asset-hub',
          genesisHash: `0x${'bb'.repeat(32)}`,
          parentId: POLKADOT,
          paraId: '1000',
          ecosystem: 'substrate',
          addressPrefix: 0,
        },
        Acala: {
          name: 'Acala',
          chainId: 'acala',
          genesisHash: `0x${'aa'.repeat(32)}`,
          parentId: POLKADOT,
          paraId: '2000',
          ecosystem: 'substrate',
          addressPrefix: 10,
        },
      },
    },
    keyringService: {
      tonKeyring: { getAccounts: () => [] },
      getAllAccounts: () => [
        { address: pair.address, publicKey: pair.addressRaw, meta: { walletSecurityGeneration: CURRENT_WALLET_SECURITY_GENERATION } },
      ],
      getPair: vi.fn(() => pair),
    },
  } as unknown as State;
  connect(true);
  handler = new SubstrateRequestHandler(service, state);
  Object.assign(service, { getSignRequest: (id: string) => handler.getSignRequest(id) });
  extension = new Extension(state);
});

async function admit(method: string, id = 'public') {
  const result = handler.sign(url, new RequestExtrinsicSign(payload(method)), {
    address: pair.address,
    name: 'Public fixture',
  } as AccountJson, id);
  void result.catch(() => undefined);
  await vi.waitFor(() => expect(handler.getSignRequest(id)).toBeDefined());
  vi.mocked(state.keyringService.getPair).mockClear();

  return { result, queued: handler.getSignRequest(id)! };
}

describe('dApp cross-chain transfers in the signing popup', () => {
  it('publishes the decoded transfer with the request, and the review shows it', async () => {
    await admit(calls.teleport());
    const published = handler.signSubject.value[0];
    const review = signingReview(published);

    expect(published.callReview).toMatchObject({
      status: 'decoded',
      crossChain: [
        {
          call: 'xcmPallet.limitedTeleportAssets',
          destination: { network: 'Polkadot AssetHub', relay: 'Polkadot', paraId: 1000 },
        },
      ],
    });
    expect(review).toMatchObject({ refused: false, blocked: false, blind: true, highRisk: false });
    expect(review.actions.map(({ kind }) => kind)).toEqual(['crossChain', 'unknown']);
    expect(review.actions[0]).toMatchObject({ to: encodeAddress(ALICE, 0), assets: [{ asset: 'DOT', amount: '1' }] });
  });

  it('signs a transfer to a destination that still delivers', async () => {
    const { result } = await admit(calls.teleport());

    expect(await extension.signingApprove({ id: 'public' })).toBe(true);
    expect((await result).payload).toMatch(/^0x/);
  });

  it('shows the refusal and never signs a transfer the wallet knows cannot arrive', async () => {
    const { result, queued } = await admit(calls.reserve());
    const resolveSpy = vi.spyOn(queued, 'resolve');

    expect(signingReview(handler.signSubject.value[0])).toMatchObject({ refused: true, blocked: true });
    await expect(extension.signingApprove({ id: 'public' })).rejects.toBeInstanceOf(CrossChainDestinationRetiredError);
    await expect(result).rejects.toThrow(/^cross_chain_destination_retired: DOT and KSM moved to Asset Hub/);
    expect(resolveSpy).not.toHaveBeenCalled();
    expect(state.keyringService.getPair).not.toHaveBeenCalled();
    expect(handler.getSignRequest('public')).toBeUndefined();
  });

  it('refuses an external signature for such a transfer as well', async () => {
    const { result } = await admit(calls.reserve());

    await expect(extension.signingApproveSignature({ id: 'public', signature: `0x${'00'.repeat(65)}` })).rejects.toThrow(
      'cross_chain_destination_retired'
    );
    await expect(result).rejects.toThrow('cross_chain_destination_retired');
  });

  it('refuses such a transfer admitted before the network runtime was ready', async () => {
    connect(false);
    const { result } = await admit(calls.reserve());
    expect(handler.signSubject.value[0].callReview).toEqual({ status: 'undecodable', reason: 'runtime_unavailable' });

    connect(true);
    await expect(extension.signingApprove({ id: 'public' })).rejects.toBeInstanceOf(CrossChainDestinationRetiredError);
    await expect(result).rejects.toThrow('cross_chain_destination_retired');
  });

  it('signs an ordinary call admitted before the network runtime was ready', async () => {
    connect(false);
    const { result } = await admit(calls.transfer());

    connect(true);
    expect(await extension.signingApprove({ id: 'public' })).toBe(true);
    await expect(result).resolves.toMatchObject({ id: 'public' });
  });

  it('asks for a new request when a transfer to another network appears only at approval', async () => {
    connect(false);
    const { result } = await admit(calls.teleport());

    connect(true);
    expect(await extension.signingApprove({ id: 'public' })).toBe(false);
    await expect(result).rejects.toThrow('Substrate signing context changed; request approval again');
  });

  it('decodes with the wallet runtime, never with metadata the site provided', async () => {
    service.knownMetadata.push({
      genesisHash,
      chain: 'Polkadot',
      icon: 'polkadot',
      ss58Format: 0,
      specVersion: 2005000,
      tokenDecimals: 10,
      tokenSymbol: 'DOT',
      types: {},
    });
    await admit(calls.reserve());

    expect(signingReview(handler.signSubject.value[0]).refused).toBe(true);
  });
});
