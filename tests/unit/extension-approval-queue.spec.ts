import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { nextTick } from 'vue';
import type { AuthorizeRequest, MetadataRequest, SigningRequest } from '@extension-base/background/types/types';

const mocks = vi.hoisted(() => ({
  approveAuthRequest: vi.fn(),
  deleteAuthRequest: vi.fn(),
  approveMetaRequest: vi.fn(),
  rejectMetaRequest: vi.fn(),
  approveSign: vi.fn(),
  approveSignSignature: vi.fn(),
  cancelSignRequest: vi.fn(),
  subscribeAuthorizeRequests: vi.fn(),
  subscribeMetadataRequests: vi.fn(),
  subscribeSigningRequests: vi.fn(),
  isTabAuthorize: vi.fn(),
  push: vi.fn(),
  currentRoute: { value: { name: 'Authorize' } },
}));

vi.mock('@/extension/messaging', () => mocks);
vi.mock('@/router', () => ({ default: { push: mocks.push, currentRoute: mocks.currentRoute } }));
vi.mock('vue-router', () => ({ useRouter: () => ({ push: mocks.push, currentRoute: mocks.currentRoute }) }));
vi.mock('@/router/routes', () => ({
  Components: { Authorize: 'Authorize', MetaRequest: 'MetaRequest', Transaction: 'Transaction', Wallet: 'Wallet' },
}));
vi.mock('@/stores/sendKillSwitch', () => ({ useSendKillSwitchStore: vi.fn() }));
vi.mock('@/consts/globalClient', () => ({ IS_POPUP: true }));
vi.mock('@/stores/accounts', () => ({
  useAccountsStore: () => ({
    accounts: [
      { address: 'substrate-account', ethereumAddress: '0x1234', name: 'EVM wallet', walletSecurityGeneration: 1 },
      { address: 'solana-account', solanaAddress: 'solana-public-key', name: 'Solana wallet', walletSecurityGeneration: 1 },
    ],
  }),
}));
vi.mock('@/screens/extension-ui/authorize/SelectAuthAccountForm.vue', () => ({
  default: {
    name: 'SelectAuthAccountForm',
    props: ['selectAll', 'showSelectAll', 'accounts', 'authType'],
    template: '<div />',
  },
}));
vi.mock('@/locales/useI18n', () => ({ useI18n: () => ({ t: () => '{name} at {link}', locale: { value: 'en-EN' } }) }));
vi.mock('@/util/iroha', () => ({ encodeIrohaI105Address: vi.fn() }));

import { useExtensionStore } from '@/stores/extension';
import Authorize from '@/screens/extension-ui/authorize/Authorize.vue';

const first = 'request-1';
const second = 'request-2';
const signature = '0x1234';
const authRequest = (id: string, accountAuthType: 'evm' | 'solana' = 'evm'): AuthorizeRequest => ({
  id,
  accountAuthType,
  request: { origin: id, accountAuthType },
  url: `https://${id}.example`,
});

const queueActions = [
  {
    action: 'approveAuthRequests',
    queue: 'authRequests',
    subscription: 'subscribeAuthorizeRequests',
    subscribe: 'subscribeAuthRequests',
    message: 'approveAuthRequest',
    payload: { id: first, accounts: ['account'] },
  },
  {
    action: 'rejectAuthRequests',
    queue: 'authRequests',
    subscription: 'subscribeAuthorizeRequests',
    subscribe: 'subscribeAuthRequests',
    message: 'deleteAuthRequest',
    payload: first,
  },
  {
    action: 'approveMetaRequests',
    queue: 'metaRequests',
    subscription: 'subscribeMetadataRequests',
    subscribe: 'subscribeMetaRequests',
    message: 'approveMetaRequest',
    payload: { id: first },
  },
  {
    action: 'rejectMetaRequests',
    queue: 'metaRequests',
    subscription: 'subscribeMetadataRequests',
    subscribe: 'subscribeMetaRequests',
    message: 'rejectMetaRequest',
    payload: { id: first },
  },
  {
    action: 'approveSign',
    queue: 'signRequests',
    subscription: 'subscribeSigningRequests',
    subscribe: 'subscribeSignRequests',
    message: 'approveSign',
    payload: { id: first, kind: 'substrate' },
  },
  {
    action: 'signSignature',
    queue: 'signRequests',
    subscription: 'subscribeSigningRequests',
    subscribe: 'subscribeSignRequests',
    message: 'approveSignSignature',
    payload: { id: first, kind: 'substrate', payload: { signature } },
  },
  {
    action: 'signCancel',
    queue: 'signRequests',
    subscription: 'subscribeSigningRequests',
    subscribe: 'subscribeSignRequests',
    message: 'cancelSignRequest',
    payload: { id: first, kind: 'substrate' },
  },
] as const;

type QueuedRequest = AuthorizeRequest | MetadataRequest | SigningRequest;

beforeEach(() => {
  vi.resetAllMocks();
  setActivePinia(createPinia());
  mocks.currentRoute.value.name = 'Authorize';
  mocks.push.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
});

describe.each(queueActions)('$action queue completion', (testCase) => {
  it.each(['before', 'after'])(
    'keeps the next request when the subscription arrives %s the response',
    async (order) => {
      const store = useExtensionStore();
      let publish: (requests: QueuedRequest[]) => void = () => undefined;
      mocks[testCase.subscription].mockImplementation(async (callback) => {
        publish = callback;
        return [];
      });
      await store[testCase.subscribe]();
      const pending = [authRequest(first), authRequest(second)];
      const next = pending[1];
      publish(pending);
      mocks.push.mockClear();

      mocks[testCase.message].mockImplementation(async () => {
        if (order === 'before') publish([next]);
      });
      const perform = store[testCase.action] as (payload: unknown) => Promise<void>;
      await perform(testCase.payload);

      expect(store[testCase.queue].map(({ id }) => id)).toEqual([second]);
      expect(mocks.push).not.toHaveBeenCalledWith({ name: 'Wallet' });
      if (order === 'after') publish([next]);
      expect(store[testCase.queue].map(({ id }) => id)).toEqual([second]);
    }
  );

  it('leaves the request available for retry when the background action fails', async () => {
    const store = useExtensionStore();
    Object.assign(store, { [testCase.queue]: [authRequest(first), authRequest(second)] });
    mocks[testCase.message].mockRejectedValue(new Error('Background unavailable'));
    const perform = store[testCase.action] as (payload: unknown) => Promise<void>;

    await expect(perform(testCase.payload)).rejects.toThrow('Background unavailable');
    expect(store[testCase.queue].map(({ id }) => id)).toEqual([first, second]);
    expect(mocks.push).not.toHaveBeenCalled();
  });
});

describe('authorization popup queue', () => {
  it('keeps the next dApp visible after approval and resets accounts for its ecosystem', async () => {
    vi.useFakeTimers();
    const store = useExtensionStore();
    let publish: (requests: AuthorizeRequest[]) => void = () => undefined;
    mocks.subscribeAuthorizeRequests.mockImplementation(async (callback) => {
      publish = callback;
      return [];
    });
    await store.subscribeAuthRequests();
    publish([authRequest(first), authRequest(second, 'solana')]);

    const wrapper = mount(Authorize, {
      global: {
        stubs: {
          AboveForm: { template: '<div><slot /></div>' },
          Alert: { template: '<div><slot /></div>' },
          FButton: {
            props: ['disabled'],
            emits: ['click'],
            template: '<button :disabled="disabled" @click="$emit(\'click\')"><slot /></button>',
          },
        },
      },
    });
    const selector = wrapper.getComponent({ name: 'SelectAuthAccountForm' });
    selector.vm.$emit('onSelect', true, 'substrate-account');
    await nextTick();
    expect(wrapper.get('[data-testid="approveAuthorization"]').attributes('disabled')).toBeUndefined();
    mocks.approveAuthRequest.mockImplementation(async () => publish([authRequest(second, 'solana')]));
    mocks.push.mockClear();

    await wrapper.get('[data-testid="approveAuthorization"]').trigger('click');
    await flushPromises();
    await vi.advanceTimersByTimeAsync(200);

    expect(mocks.approveAuthRequest).toHaveBeenCalledWith(first, ['substrate-account']);
    expect(store.authRequests.map(({ id }) => id)).toEqual([second]);
    expect(wrapper.text()).toContain(second);
    expect(selector.props('accounts')).toEqual({
      'solana-public-key': expect.objectContaining({ active: false, name: 'Solana wallet' }),
    });
    expect(wrapper.get('[data-testid="approveAuthorization"]').attributes('disabled')).toBeDefined();
    expect(mocks.push).not.toHaveBeenCalledWith({ name: 'Wallet' });

    // Also cover completion before the final subscription: removal mutates the queue in place.
    await store.rejectAuthRequests(second);
    await nextTick();
    expect(mocks.push).toHaveBeenLastCalledWith({ name: 'Wallet' });
    wrapper.unmount();
  });
});
