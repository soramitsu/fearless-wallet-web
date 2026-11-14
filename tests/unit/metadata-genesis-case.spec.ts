import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MetadataRequestHandler } from '@extension-base/services/request-service/handlers/MetadataRequestHandler';
import { captureSubstrateSigningContext } from '@extension-base/services/request-service/handlers/substrateSigningContext';
import type State from '@extension-base/background/handlers/State';
import type { RequestService } from '@extension-base/services/request-service';
import type { MetadataDef } from '@polkadot/extension-inject/types';
import type { SignerPayloadJSON } from '@polkadot/types/types';

// Stored metadata, as the extension's metadata store keeps it.
const stored = vi.hoisted(() => new Map<string, unknown>());
vi.mock('@extension-base/stores/Metadata', () => ({
  default: class {
    set(key: string, value: unknown, update?: () => void) {
      stored.set(key, structuredClone(value));
      update?.();
    }
    remove(key: string, update?: () => void) {
      stored.delete(key);
      update?.();
    }
    allMap(update: (value: Record<string, unknown>) => void) {
      update(Object.fromEntries(stored));
      return Promise.resolve();
    }
  },
}));
vi.mock('@extension-base/services', () => ({}));

const url = 'https://public.example';
// Public fixture chains; each test uses its own, as the chains registry lives for the whole file.
const chain = (byte: string) => `0x${byte.repeat(32)}`;
const metadata = (genesisHash: string, specVersion = 1): MetadataDef => ({
  genesisHash: genesisHash as MetadataDef['genesisHash'],
  chain: 'Public chain',
  icon: 'polkadot',
  ss58Format: 42,
  specVersion,
  tokenDecimals: 12,
  tokenSymbol: 'PUB',
  types: {},
});
const payload = (genesisHash: string): SignerPayloadJSON => ({
  address: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
  genesisHash: genesisHash as SignerPayloadJSON['genesisHash'],
  blockHash: genesisHash as SignerPayloadJSON['blockHash'],
  blockNumber: '0x00',
  era: '0x00',
  method: '0x1234',
  nonce: '0x02',
  specVersion: '0x01',
  transactionVersion: '0x01',
  tip: '0x00',
  signedExtensions: ['CheckNonce'],
  version: 4,
});
let requestService: RequestService;
let handler: MetadataRequestHandler;

const create = () => {
  requestService = { popupOpen: vi.fn(), updateIcon: vi.fn() } as unknown as RequestService;
  handler = new MetadataRequestHandler(requestService);
  Object.defineProperty(requestService, 'knownMetadata', { get: () => handler.knownMetadata });
};
const state = { networkService: { networkMap: {} } } as unknown as State;
const capture = (genesisHash: string) => captureSubstrateSigningContext(state, requestService, payload(genesisHash));
const approve = async (genesisHash: string, specVersion = 1) => {
  const approval = handler.injectMetadata(url, metadata(genesisHash, specVersion));
  const [queued] = Object.values(handler.metaRequests);
  handler.saveMetadata(queued.request);
  queued.resolve(true);
  await approval;
  return queued.request;
};
const definitionsFor = (genesisHash: string) =>
  handler.knownMetadata.filter((entry) => entry.genesisHash.toLowerCase() === genesisHash.toLowerCase());

beforeEach(() => {
  stored.clear();
  create();
});

describe('metadata genesis hashes', () => {
  it('keeps approved metadata under the lower-case genesis hash', async () => {
    const upper = chain('AB');
    const request = await approve(upper);

    expect(request.genesisHash).toBe(upper.toLowerCase());
    expect([...stored.keys()]).toEqual([upper.toLowerCase()]);
    expect(definitionsFor(upper).map(({ genesisHash }) => genesisHash)).toEqual([upper.toLowerCase()]);
  });

  it('refuses metadata whose genesis hash is not a 32-byte hex hash, before any prompt', async () => {
    for (const genesisHash of ['0x1234', `${'ab'.repeat(32)}`, `0x${'zz'.repeat(32)}`, undefined]) {
      const request = { ...metadata(chain('01')), genesisHash } as MetadataDef;

      await expect(handler.injectMetadata(url, request)).rejects.toThrow('Invalid metadata genesis hash');
    }
    expect(requestService.popupOpen).not.toHaveBeenCalled();
    expect(handler.numMetaRequests).toBe(0);
  });

  it('keeps signing working after a site has metadata approved under an upper-case hash', async () => {
    const lower = chain('cd');
    await approve(lower);
    await approve(lower.toUpperCase().replace('0X', '0x'), 2);

    expect(definitionsFor(lower)).toHaveLength(1);
    const context = capture(lower);
    expect(context.kind === 'extrinsic' && context.metadata?.specVersion).toBe(2);
  });

  it('reads one definition from copies stored in two letter cases that agree', () => {
    const lower = chain('ef');
    const upper = lower.toUpperCase().replace('0X', '0x');
    stored.set(lower, metadata(lower));
    stored.set(upper, metadata(upper));
    create();

    expect(definitionsFor(lower)).toHaveLength(2);
    expect(capture(upper)).toMatchObject({ kind: 'extrinsic', metadata: { genesisHash: lower, specVersion: 1 } });
  });

  it('refuses copies that differ, until the user approves metadata for the chain again', async () => {
    const lower = chain('9a');
    const upper = lower.toUpperCase().replace('0X', '0x');
    stored.set(lower, metadata(lower, 1));
    stored.set(upper, metadata(upper, 2));
    create();

    expect(() => capture(lower)).toThrow('Substrate signing metadata is ambiguous');

    await approve(upper, 3);
    // The next start reads only the lower-case entry; this one already signs with the approved definition.
    expect([...stored.keys()]).toEqual([lower]);
    expect(capture(lower)).toMatchObject({ kind: 'extrinsic', metadata: { genesisHash: lower, specVersion: 3 } });
  });
});
