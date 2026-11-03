import WalletConnect from '@walletconnect/sign-client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { walletConnectClient } from '@extension-base/services/wallet-connect-service/client';

// Use the installed SDK's event routing, including its per-ID deduplication. Only network verification/storage are
// stubbed: the behavior under test is whether a restored request blocks an independent session's approval event.
const memoryStorage = () => ({
  getItem: async () => undefined,
  getKeys: async () => [],
  getEntries: async () => [],
  setItem: async () => undefined,
  removeItem: async () => undefined,
});

afterEach(() => vi.restoreAllMocks());

type Request = { id: number; topic: string; params: { chainId: string; request: { method: string; params: string[] } } };
type TestEngine = {
  sessionRequestQueue: { state: string; queue: Request[] };
  emittedSessionRequests: Set<number>;
  isValidRequest: ReturnType<typeof vi.fn>;
  getVerifyContext: ReturnType<typeof vi.fn>;
  setPendingSessionRequest: ReturnType<typeof vi.fn>;
  onSessionRequest: (event: { topic: string; payload: { id: number; jsonrpc: string; method: string; params: Request['params'] } }) => Promise<void>;
};

const request = (id: number, topic: string): Request => ({
  id,
  topic,
  params: { chainId: 'eip155:1', request: { method: 'personal_sign', params: ['0x1234', `0x${'11'.repeat(20)}`] } },
});

async function clientWithRestoredRequest() {
  vi.spyOn(WalletConnect, 'init').mockImplementation(async options => new WalletConnect({
    ...options,
    customStoragePrefix: `public-queue-fixture-${crypto.randomUUID()}`,
    storage: memoryStorage(),
    logger: 'silent',
  }));
  const client = await walletConnectClient({});
  const engine = client.engine as unknown as TestEngine;
  const old = request(101, 'previous-session');
  engine.sessionRequestQueue = { state: 'ACTIVE', queue: [old] };
  engine.emittedSessionRequests.add(old.id);
  engine.isValidRequest = vi.fn(async () => undefined);
  engine.getVerifyContext = vi.fn(async () => ({ verified: { validation: 'UNKNOWN' } }));
  engine.setPendingSessionRequest = vi.fn(async () => undefined);
  vi.spyOn(client.session, 'get').mockReturnValue({ peer: { metadata: { url: 'https://public.example' } } } as never);
  const emit = async (item: Request) => engine.onSessionRequest({
    topic: item.topic,
    payload: { id: item.id, jsonrpc: '2.0', method: 'wc_sessionRequest', params: item.params },
  });
  return { client, engine, old, emit };
}

describe('WalletConnect requests beside a restored pending approval', () => {
  it('offers an independent session request for explicit approval without discarding or approving the restored one', async () => {
    const { client, engine, old, emit } = await clientWithRestoredRequest();
    const offered = vi.fn();
    const respond = vi.spyOn(client, 'respond');
    client.on('session_request', offered);
    const next = request(202, 'independent-session');

    await emit(next);

    expect(offered).toHaveBeenCalledOnce();
    expect(offered).toHaveBeenCalledWith(expect.objectContaining(next));
    expect(engine.sessionRequestQueue.queue).toEqual([old]);
    expect(respond).not.toHaveBeenCalled();
  });

  it('does not offer the same relay request twice while allowing another session to proceed', async () => {
    const { client, emit } = await clientWithRestoredRequest();
    const offered = vi.fn();
    client.on('session_request', offered);
    const next = request(202, 'independent-session');

    await emit(next);
    await emit(next);
    await emit(request(303, 'another-session'));

    expect(offered.mock.calls.map(([event]) => event.id)).toEqual([202, 303]);
  });
});
