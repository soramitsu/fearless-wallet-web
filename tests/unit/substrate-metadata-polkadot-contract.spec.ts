import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiPromise } from '@polkadot/api';
import polkadotMetadata, { rpc, version } from '@polkadot/types-support/metadata/static-polkadot';
import type { ProviderInterface, ProviderInterfaceCallback, ProviderInterfaceEmitted } from '@polkadot/rpc-provider/types';
import type { HexString } from '@polkadot/util/types';

// The metadata cache (SubstrateApiHandler.supplyCachedMetadata) relies on how @polkadot/api uses its `metadata` option:
// it keeps the object it was given and looks the runtime up only after the node answered its first calls, so a saved
// runtime read while the socket opens is still used. These checks run the real ApiPromise against a scripted node.

const GENESIS = '0x91b171bb158e2d3848fa23a9f1c25182fb8e20313b2c1eb49219da7a70ce90c3';
const KEY = `${GENESIS}-${version.specVersion}`;
// blake2_64("Metadata"): left out, so a download goes through state_getMetadata.
const METADATA_API = '0x37e397fc7c91f5e4';

class ScriptedNode implements ProviderInterface {
  readonly hasSubscriptions = true;
  readonly isClonable = false;
  isConnected = true;
  readonly calls: string[] = [];
  private release!: () => void;
  private readonly answered = new Promise<void>((resolve) => { this.release = resolve; });

  /** Lets the node answer the calls it has been holding. */
  answer() { this.release(); }
  clone(): ProviderInterface { throw new Error('not clonable'); }
  async connect() { this.isConnected = true; }
  async disconnect() { this.isConnected = false; }
  on(_type: ProviderInterfaceEmitted, _listener: unknown) { return () => undefined; }
  async send<T>(method: string): Promise<T> {
    this.calls.push(method);
    await this.answered;
    const answers: Record<string, unknown> = {
      chain_getBlockHash: GENESIS,
      state_getRuntimeVersion: { ...version, apis: version.apis.filter(([id]) => id !== METADATA_API) },
      system_chain: 'Polkadot',
      system_properties: { ss58Format: 0, tokenDecimals: [10], tokenSymbol: ['DOT'] },
      rpc_methods: rpc,
      state_getMetadata: polkadotMetadata,
      system_health: { isSyncing: false, peers: 1, shouldHavePeers: true },
    };
    if (!(method in answers)) throw new Error(`unexpected ${method}`);
    return answers[method] as T;
  }
  async subscribe(_type: string, method: string, _params: unknown[], _callback: ProviderInterfaceCallback) {
    this.calls.push(method);
    return 1;
  }
  async unsubscribe() { return true; }
}

const apis: ApiPromise[] = [];
function open(node: ScriptedNode, metadata: Record<string, HexString>) {
  const api = new ApiPromise({ provider: node, metadata, noInitWarn: true });
  apis.push(api);
  return api;
}

afterEach(async () => {
  await Promise.all(apis.splice(0).map((api) => api.disconnect().catch(() => undefined)));
});

describe('@polkadot/api and a saved runtime supplied as the socket opens', () => {
  it('uses a runtime added to its metadata option after construction instead of downloading it', async () => {
    const node = new ScriptedNode();
    const metadata: Record<string, HexString> = {};
    const api = open(node, metadata);

    metadata[KEY] = polkadotMetadata;
    node.answer();
    await api.isReadyOrError;

    expect(node.calls).not.toContain('state_getMetadata');
    expect(api.genesisHash.toHex()).toBe(GENESIS);
    expect(api.runtimeVersion.specVersion.toNumber()).toBe(version.specVersion);
    expect(api.runtimeMetadata.toHex()).toBe(polkadotMetadata);
  }, 30_000);

  it('downloads the runtime when the saved one is for another spec or arrives too late', async () => {
    const upgraded = new ScriptedNode();
    const api = open(upgraded, { [`${GENESIS}-${version.specVersion - 1}`]: polkadotMetadata });
    upgraded.answer();
    await api.isReadyOrError;
    expect(upgraded.calls).toContain('state_getMetadata');

    const slow = new ScriptedNode();
    const metadata: Record<string, HexString> = {};
    const late = open(slow, metadata);
    slow.answer();
    await vi.waitFor(() => expect(slow.calls).toContain('state_getMetadata'));
    metadata[KEY] = polkadotMetadata;
    await late.isReadyOrError;
    expect(late.runtimeMetadata.toHex()).toBe(polkadotMetadata);
  }, 30_000);

  it('reports a saved runtime it cannot decode as "Unable to initialize the API"', async () => {
    const node = new ScriptedNode();
    const errors: unknown[] = [];
    // Well-formed hex of a supported version whose content is not a runtime.
    const api = open(node, { [KEY]: `0x6d6574610e${'ff'.repeat(2048)}` });
    api.on('error', (error: unknown) => errors.push(error));
    node.answer();

    await expect(api.isReadyOrError).rejects.toThrow('Unable to initialize the API');
    expect(errors).toEqual([expect.objectContaining({ message: expect.stringContaining('FATAL: Unable to initialize the API') })]);
    expect(node.calls).not.toContain('state_getMetadata');
  }, 30_000);
});
