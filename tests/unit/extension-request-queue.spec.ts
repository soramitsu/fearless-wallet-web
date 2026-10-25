import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthorizeRequest, MetadataRequest, SigningRequest } from '@extension-base/background/types/types';
import type { EvmRequestPayload, SolanaRequestPayload } from '@extension-base/services/request-service/types';
import { useExtensionStore } from '@/stores/extension';

const mocks = vi.hoisted(() => ({
  approveAuthRequest: vi.fn(),
  deleteAuthRequest: vi.fn(),
  approveMetaRequest: vi.fn(),
  rejectMetaRequest: vi.fn(),
  approveSign: vi.fn(),
  approveSignSignature: vi.fn(),
  cancelSignRequest: vi.fn(),
  subscribeSigningRequests: vi.fn(),
  subscribeEvmSigningRequests: vi.fn(),
  subscribeSolanaSigningRequests: vi.fn(),
  push: vi.fn(),
  currentRoute: { value: { name: 'Transaction' } },
}));
vi.mock('@/extension/messaging', () => mocks);
vi.mock('@/router', () => ({ default: { push: mocks.push, currentRoute: mocks.currentRoute } }));
vi.mock('@/router/routes', () => ({
  Components: { Transaction: 'Transaction', Wallet: 'Wallet', MetaRequest: 'MetaRequest', Authorize: 'Authorize' },
}));

const auth = (id: string) => ({ id, url: `https://${id}.example`, request: { origin: id } }) as AuthorizeRequest;
const meta = (id: string) => ({ id, url: `https://${id}.example`, request: { chain: id } }) as MetadataRequest;
const substrate = (id: string) => ({ id, url: 'https://public.example', request: {}, account: {} }) as SigningRequest;
const evm = (id: string) => ({ id, url: 'https://public.example', data: [] }) as EvmRequestPayload;
const solana = (id: string) => ({ id, url: 'https://public.example', ecosystem: 'solana' }) as SolanaRequestPayload;
const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((finish) => {
    resolve = finish;
  });
  return { promise, resolve };
};
const setup = () => {
  const store = useExtensionStore();
  vi.spyOn(store, 'fetchTabStatus').mockResolvedValue(undefined);
  return store;
};

beforeEach(() => {
  vi.resetAllMocks();
  setActivePinia(createPinia());
  mocks.currentRoute.value.name = 'Transaction';
});

describe('approval completion owns an exact queued request', () => {
  it.each(['approve', 'reject'] as const)(
    'keeps a newer authorization after %s completes behind a subscription update',
    async (action) => {
      const store = setup();
      const wait = deferred();
      store.authRequests = [auth('first'), auth('second')];
      (action === 'approve' ? mocks.approveAuthRequest : mocks.deleteAuthRequest).mockReturnValueOnce(wait.promise);
      const pending =
        action === 'approve'
          ? store.approveAuthRequests({ id: 'first', accounts: ['public-account'] })
          : store.rejectAuthRequests('first');
      store.setRequest({ type: 'authRequests', requests: [auth('second')] });
      wait.resolve();
      await pending;
      expect(store.authRequests.map(({ id }) => id)).toEqual(['second']);
    }
  );

  it.each(['approve', 'reject'] as const)(
    'keeps a newer metadata request after %s completes behind a subscription update',
    async (action) => {
      const store = setup();
      const wait = deferred();
      store.metaRequests = [meta('first'), meta('second')];
      (action === 'approve' ? mocks.approveMetaRequest : mocks.rejectMetaRequest).mockReturnValueOnce(wait.promise);
      const pending =
        action === 'approve' ? store.approveMetaRequests(meta('first')) : store.rejectMetaRequests(meta('first'));
      store.setRequest({ type: 'metaRequests', requests: [meta('second')] });
      wait.resolve();
      await pending;
      expect(store.metaRequests.map(({ id }) => id)).toEqual(['second']);
    }
  );

  it('removes the matching array request even when it is not first', async () => {
    const store = setup();
    store.authRequests = [auth('first'), auth('second')];
    await store.rejectAuthRequests('second');
    expect(store.authRequests.map(({ id }) => id)).toEqual(['first']);
  });

  it.each(['approve', 'signature', 'reject'] as const)(
    'does not remove a newer Substrate request or leave its screen on late %s',
    async (action) => {
      const store = setup();
      const wait = deferred();
      store.signRequests = [substrate('first'), substrate('second')];
      const rpc =
        action === 'approve'
          ? mocks.approveSign
          : action === 'signature'
            ? mocks.approveSignSignature
            : mocks.cancelSignRequest;
      rpc.mockReturnValueOnce(wait.promise);
      const pending =
        action === 'approve'
          ? store.approveSign({ id: 'first', kind: 'substrate' })
          : action === 'signature'
            ? store.signSignature({ id: 'first', kind: 'substrate', payload: { signature: '0x1234' } })
            : store.signCancel({ id: 'first', kind: 'substrate' });
      store.setRequest({ type: 'signRequests', requests: [substrate('second')] });
      wait.resolve();
      await pending;
      expect(store.signRequests.map(({ id }) => id)).toEqual(['second']);
      expect(mocks.push).not.toHaveBeenCalled();
    }
  );

  it.each(['evm', 'solana'] as const)(
    'removes only the approved %s request while another ecosystem is queued',
    async (ecosystem) => {
      const store = setup();
      store.signRequests = [substrate('substrate')];
      store.signEvmRequests = { evm: evm('evm') };
      store.signSolanaRequests = { solana: solana('solana') };
      await store.approveSign({ id: ecosystem, kind: ecosystem });
      expect(store.signRequests.map(({ id }) => id)).toEqual(['substrate']);
      expect(Object.keys(store.signEvmRequests)).toEqual(ecosystem === 'evm' ? [] : ['evm']);
      expect(Object.keys(store.signSolanaRequests)).toEqual(ecosystem === 'solana' ? [] : ['solana']);
      expect(mocks.push).not.toHaveBeenCalled();
    }
  );

  it('leaves every queued request unchanged when approval fails', async () => {
    const store = setup();
    store.signRequests = [substrate('first')];
    mocks.approveSign.mockRejectedValueOnce(new Error('worker unavailable'));
    await expect(store.approveSign({ id: 'first', kind: 'substrate' })).rejects.toThrow('worker unavailable');
    expect(store.signRequests.map(({ id }) => id)).toEqual(['first']);
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it('does not navigate away from a different screen when the final signing request completes', async () => {
    const store = setup();
    const wait = deferred();
    store.signRequests = [substrate('first')];
    mocks.approveSign.mockReturnValueOnce(wait.promise);
    const pending = store.approveSign({ id: 'first', kind: 'substrate' });
    mocks.currentRoute.value.name = 'Authorize';
    wait.resolve();
    await pending;
    expect(store.signRequests).toEqual([]);
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it('returns to the wallet only when the signing screen has no remaining requests', async () => {
    const store = setup();
    store.signSolanaRequests = { first: solana('first') };
    await store.signCancel({ id: 'first', kind: 'solana' });
    expect(store.signSolanaRequests).toEqual({});
    expect(mocks.push).toHaveBeenCalledExactlyOnceWith({ name: 'Wallet' });
  });
});

describe('signing subscriptions share one combined queue', () => {
  it.each(['substrate', 'evm', 'solana'] as const)(
    'does not dismiss another ecosystem when %s publishes an empty queue',
    async (ecosystem) => {
      const store = setup();
      store.signRequests = [substrate('substrate')];
      store.signEvmRequests = { evm: evm('evm') };
      store.signSolanaRequests = { solana: solana('solana') };
      if (ecosystem === 'substrate') {
        await store.subscribeSignRequests();
        mocks.subscribeSigningRequests.mock.calls[0][0]([]);
      } else if (ecosystem === 'evm') {
        await store.subscribeEvmSignRequests();
        mocks.subscribeEvmSigningRequests.mock.calls[0][0]({});
      } else {
        await store.subscribeSolanaSignRequests();
        mocks.subscribeSolanaSigningRequests.mock.calls[0][0]({});
      }
      expect(mocks.push).not.toHaveBeenCalled();
    }
  );
});

describe('signing result feedback', () => {
  it.each([true, false])('preserves backend result %s for the approval screen', async (result) => {
    const store = setup();
    store.signEvmRequests = { first: evm('first') };
    mocks.approveSign.mockResolvedValueOnce(result);
    await expect(store.approveSign({ id: 'first', kind: 'evm' })).resolves.toBe(result);
    expect(store.signEvmRequests).toEqual({});
  });
});
