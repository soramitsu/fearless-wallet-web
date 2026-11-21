import { BehaviorSubject } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import Extension from '@extension-base/background/handlers/Extension';
import { SubscriptionService } from '@extension-base/services/subscription-service';
import type State from '@extension-base/background/handlers/State';
import type { Port } from '@extension-base/background/types/types';

vi.mock('@/sora/cosigner', () => ({ decryptForCosigner: vi.fn(), encryptForCosigners: vi.fn() }));
vi.mock('@extension-base/services', () => ({}));
vi.mock('@extension-base/background/handlers', () => ({ state: {}, extension: {}, handlers: vi.fn() }));
vi.mock('@extension-base/utils/crossenv', () => ({ chrome: { runtime: { getURL: (path: string) => path } } }));

describe('real RxJS subscription cleanup through extension handlers', () => {
  it.each([
    'authorizeSubscribe', 'metadataSubscribe', 'signingSubscribe', 'signingEvmSubscribe',
    'signingSolanaSubscribe', 'subscribeBalance', 'subscribePrice', 'soraFeesSubscribe',
    'subscribeNetworkMap', 'subscribeSelectedNetworks', 'connectWCSubscribe',
    'subscribeWalletConnectSessions', 'wcSigningSubscribe', 'WCNotSupportSubscribe',
  ])('%s releases its actual observer when the client disconnects', async (method) => {
    const subject = new BehaviorSubject([]);
    const state = {
      authSubject: subject, soraFees: subject, currentAccount: { address: 'wallet-a' },
      requestService: {
        mutateAuthorizations: vi.fn().mockResolvedValue(undefined),
        metaSubject: subject, signSubject: subject, signEvmSubject: subject, signSolanaSubject: subject,
        connectWCSubject: subject, signWcSubject: subject, notSupportWCSubject: subject,
      },
      balanceService: { balanceSubject: subject, getBalance: () => Promise.resolve({}) },
      pricesService: { getSubject: () => subject, getPrice: (callback: (data: object) => void) => callback({}) },
      networkService: { networkMapStore: { getSubject: () => subject }, selectedNetworksStore: { getSubject: () => subject } },
      walletConnectService: { sessionSubject: subject },
      subscriptionService: undefined as unknown as SubscriptionService,
    };
    state.subscriptionService = new SubscriptionService(state as unknown as State);
    const extension = new Extension(state as unknown as State);
    let disconnect!: () => void;
    const port = { postMessage: vi.fn(), onDisconnect: { addListener: (callback: () => void) => { disconnect = callback; } } };
    const handler = (extension as unknown as Record<string, (id: string, port: Port) => unknown>)[method];
    await handler.call(extension, method, port as unknown as Port);
    expect(subject.observers).toHaveLength(1);
    disconnect();
    expect(subject.observers).toHaveLength(0);
    const deliveries = port.postMessage.mock.calls.length;
    subject.next([]);
    expect(port.postMessage).toHaveBeenCalledTimes(deliveries);
    subject.complete();
  });
});
