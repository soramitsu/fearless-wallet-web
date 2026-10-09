import { flushPromises, mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import type { IrohaConnectSnapshot } from '@extension-base/services/iroha-connect-service/types';

const mocks = vi.hoisted(() => ({
  approveRequest: vi.fn(),
  approveSession: vi.fn(),
  clearError: vi.fn(),
  connect: vi.fn(),
  disconnect: vi.fn(),
  push: vi.fn(),
  rejectRequest: vi.fn(),
  rejectSession: vi.fn(),
  subscriber: undefined as ((snapshot: IrohaConnectSnapshot) => void) | undefined,
  subscribe: vi.fn(),
}));

vi.mock('vue-router', () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock('@/consts/global', () => ({ CONTENT_FORM_HEIGHT: 500 }));
vi.mock('@/helpers', () => ({ getClipboard: () => '' }));
vi.mock('@/router/routes', () => ({ Components: { Settings: 'Settings' } }));
vi.mock('@/extension/messaging', () => ({
  approveIrohaConnectRequest: mocks.approveRequest,
  approveIrohaConnectSession: mocks.approveSession,
  clearIrohaConnectError: mocks.clearError,
  connectIrohaConnect: mocks.connect,
  disconnectIrohaConnect: mocks.disconnect,
  rejectIrohaConnectRequest: mocks.rejectRequest,
  rejectIrohaConnectSession: mocks.rejectSession,
  subscribeIrohaConnect: mocks.subscribe,
}));
vi.mock('@/locales/useI18n', () => ({
  useI18n: () => ({
    t: (key: string, values?: Record<string, string | number>) => {
      if (key === 'irohaConnectPage.byteCount') return `${values?.count} bytes`;

      return (
        {
          'irohaConnectPage.walletMode': 'Wallet mode · Uranai compatible',
          'irohaConnectPage.sakuraTitle': 'Connect with a falling sakura.',
          'irohaConnectPage.waitingForDapp': 'Waiting for the dApp',
          'irohaConnectPage.signatureRequest': 'Signature request',
        } as Record<string, string>
      )[key] ?? key;
    },
  }),
}));

import IrohaConnectPage from '@/screens/irohaConnect/IrohaConnectPage.vue';

const idleSnapshot: IrohaConnectSnapshot = { accounts: [], phase: 'idle' };
const sessionSnapshot: IrohaConnectSnapshot = {
  accounts: [
    {
      address: 'testuSelectedIrohaAccount000000000001',
      name: 'Sakura',
      network: 'taira',
      publicKeyHex: '11'.repeat(32),
    },
  ],
  phase: 'session-approval',
  session: {
    appName: 'Uranai',
    appUrl: 'https://uranai.example/market',
    chainId: 'fc56984b-2be7-431d-840e-21514d1883f0',
    network: 'taira',
    protocol: 'iroha-connect-v1-uranai',
    toriiBaseUrl: 'https://taira.sora.org',
  },
};

const mountPage = async () => {
  const wrapper = mount(IrohaConnectPage, {
    global: {
      stubs: {
        ContentForm: { template: '<div><slot /></div>' },
        Icon: { props: ['icon'], template: '<i :data-icon="icon" />' },
        Scroll: { template: '<div><slot /></div>' },
      },
    },
  });

  await flushPromises();

  return wrapper;
};

describe('IrohaConnect page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.subscriber = undefined;
    mocks.subscribe.mockImplementation(async (subscriber: (snapshot: IrohaConnectSnapshot) => void) => {
      mocks.subscriber = subscriber;

      return idleSnapshot;
    });
    mocks.connect.mockResolvedValue({
      accounts: [],
      phase: 'connecting',
      session: {
        appName: 'Iroha dApp',
        chainId: sessionSnapshot.session!.chainId,
        network: 'taira',
        protocol: 'iroha-connect-v1-uranai',
        toriiBaseUrl: 'https://taira.sora.org',
      },
    });
    mocks.approveSession.mockResolvedValue({
      ...sessionSnapshot,
      phase: 'connected',
      selectedAccountId: sessionSnapshot.accounts[0].address,
    });
    mocks.approveRequest.mockResolvedValue({ ...sessionSnapshot, phase: 'connected' });
    mocks.rejectRequest.mockResolvedValue({ ...sessionSnapshot, phase: 'connected' });
    mocks.rejectSession.mockResolvedValue(idleSnapshot);
    mocks.disconnect.mockResolvedValue(idleSnapshot);
    mocks.clearError.mockResolvedValue(idleSnapshot);
  });

  it('renders the branded paste-first entry state without exposing session secrets', async () => {
    const wrapper = await mountPage();

    expect(wrapper.text()).toContain('Connect with a falling sakura.');
    expect(wrapper.text()).toContain('Wallet mode · Uranai compatible');
    expect(wrapper.find('[data-icon="iroha-connect"]').exists()).toBe(true);
    expect(wrapper.get('[data-testid="iroha-connect-start"]').attributes('disabled')).toBeDefined();
    expect(wrapper.text()).not.toContain('token=');
  });

  it('starts a connection only from an IrohaConnect wallet link', async () => {
    const wrapper = await mountPage();
    const uri =
      'iroha://connect?sid=session&chain_id=sora&node=https%3A%2F%2Ftaira.sora.org&v=1&role=wallet&token=secret';

    await wrapper.get('[data-testid="iroha-connect-uri"]').setValue(uri);
    await wrapper.get('[data-testid="iroha-connect-start"]').trigger('click');
    await flushPromises();

    expect(mocks.connect).toHaveBeenCalledWith({ uri });
    expect(wrapper.text()).toContain('Waiting for the dApp');
    expect(wrapper.text()).not.toContain('token=secret');
  });

  it('reviews the canonical network and selected account before session approval', async () => {
    const wrapper = await mountPage();

    mocks.subscriber?.(sessionSnapshot);
    await nextTick();

    expect(wrapper.text()).toContain('Uranai');
    expect(wrapper.text()).toContain('SORA Taira testnet');
    expect(wrapper.text()).toContain('taira.sora.org');
    expect(wrapper.text()).toContain('Sakura');

    await wrapper.get('[data-testid="iroha-connect-approve-session"]').trigger('click');
    await flushPromises();

    expect(mocks.approveSession).toHaveBeenCalledWith({ accountId: sessionSnapshot.accounts[0].address });
  });

  it('shows a bounded contract summary and requires an explicit signature approval', async () => {
    const wrapper = await mountPage();
    const requestSnapshot: IrohaConnectSnapshot = {
      ...sessionSnapshot,
      phase: 'request-approval',
      selectedAccountId: sessionSnapshot.accounts[0].address,
      request: {
        accountId: sessionSnapshot.accounts[0].address,
        contractAlias: 'uranai::markets.universal',
        createdAt: 1,
        entrypoint: 'buy',
        expiresAt: 90_001,
        requestId: 'sign-1',
        signingMessageBytes: 384,
        signingMessageSha256: 'a1'.repeat(32),
      },
    };

    mocks.subscriber?.(requestSnapshot);
    await nextTick();

    expect(wrapper.text()).toContain('Signature request');
    expect(wrapper.text()).toContain('uranai::markets.universal');
    expect(wrapper.text()).toContain('384 bytes');
    expect(wrapper.text()).toContain('a1'.repeat(32));

    await wrapper.get('[data-testid="iroha-connect-approve-request"]').trigger('click');
    await flushPromises();

    expect(mocks.approveRequest).toHaveBeenCalledWith({ requestId: 'sign-1' });
  });
});
