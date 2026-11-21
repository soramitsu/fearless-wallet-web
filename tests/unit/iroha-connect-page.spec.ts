import { flushPromises, mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import type {
  IrohaConnectSnapshot,
  IrohaConnectTransactionReview,
} from '@extension-base/services/iroha-connect-service/types';

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
// The English catalog the extension ships, with the supplemental IrohaConnect bundle merged in.
vi.mock('@/locales/useI18n', async () => {
  const en = (await import('@/locales/en/translation.json')).default as Record<string, unknown>;
  const { irohaConnectMessages } = await import('@/locales/irohaConnectMessages');
  const catalog: Record<string, unknown> = { ...en, ...irohaConnectMessages['en-EN'] };
  const t = (key: string, values: Record<string, string | number> = {}) => {
    const value = key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], catalog);
    return typeof value === 'string'
      ? value.replace(/\{(\w+)\}/gu, (_, name: string) => String(values[name] ?? `{${name}}`))
      : key;
  };
  return { useI18n: () => ({ t }) };
});

import IrohaConnectPage from '@/screens/irohaConnect/IrohaConnectPage.vue';

const ACCOUNT = 'testuSelectedIrohaAccount000000000001';
const DESTINATION = 'testuDestinationIrohaAccount0000000002';
const XOR = { definitionId: '6TEAJqbb8oEPmLncoNiMRbLEK6tw', symbol: 'XOR' };
const idleSnapshot: IrohaConnectSnapshot = { accounts: [], phase: 'idle' };
const sessionSnapshot: IrohaConnectSnapshot = {
  accounts: [{ address: ACCOUNT, name: 'Sakura', network: 'taira', publicKeyHex: '11'.repeat(32) }],
  phase: 'session-approval',
  session: {
    appName: 'Hanami Market',
    appUrl: 'https://hanami.example/market',
    chainId: 'fc56984b-2be7-431d-840e-21514d1883f0',
    network: 'taira',
    networkId: 'hash:4978D0BD15FC32B834672B27BBD8A03653B1DF060A1EEE7E9374D29AF3886D91#6774',
    permissions: { methods: ['sign_transaction', 'sign_raw'], events: [], resources: null },
    protocol: 'iroha-connect-v1',
    toriiBaseUrl: 'https://taira.sora.org',
  },
};

const baseReview: IrohaConnectTransactionReview = {
  kind: 'transfer',
  authority: ACCOUNT,
  networkId: sessionSnapshot.session!.networkId,
  payloadBytes: 538,
  payloadHashHex: 'a1'.repeat(32),
  creationTimeMs: '1795000000000',
  ttlMs: '100000',
  nonce: null,
  fee: { payer: 'authority', chargeLimits: [{ kind: 'nexus', asset: XOR, maxAmount: '0.25' }], gasLimit: null },
  metadata: '{"memo":"hanami"}',
  transfer: { asset: XOR, scope: null, quantity: '1.5', destination: DESTINATION },
};

const requestSnapshot = (review: IrohaConnectTransactionReview): IrohaConnectSnapshot => ({
  ...sessionSnapshot,
  phase: 'request-approval',
  selectedAccountId: ACCOUNT,
  request: { accountId: ACCOUNT, createdAt: 1, expiresAt: 120_001, kind: 'transaction', requestId: 'sign-1', review },
});

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
      session: { ...sessionSnapshot.session!, appName: 'Iroha dApp', permissions: null },
    });
    mocks.approveSession.mockResolvedValue({ ...sessionSnapshot, phase: 'connected', selectedAccountId: ACCOUNT });
    mocks.approveRequest.mockResolvedValue({ ...sessionSnapshot, phase: 'connected' });
    mocks.rejectRequest.mockResolvedValue({ ...sessionSnapshot, phase: 'connected' });
    mocks.rejectSession.mockResolvedValue(idleSnapshot);
    mocks.disconnect.mockResolvedValue(idleSnapshot);
    mocks.clearError.mockResolvedValue(idleSnapshot);
  });

  it('renders the paste-first entry state without exposing session secrets', async () => {
    const wrapper = await mountPage();

    expect(wrapper.text()).toContain('Connect with a falling sakura.');
    expect(wrapper.text()).toContain('Wallet mode · IrohaConnect v1');
    expect(wrapper.find('[data-icon="iroha-connect"]').exists()).toBe(true);
    expect(wrapper.get('[data-testid="iroha-connect-start"]').attributes('disabled')).toBeDefined();
    expect(wrapper.text()).not.toContain('token=');
  });

  it('starts a connection only from an IrohaConnect wallet link', async () => {
    const wrapper = await mountPage();
    const uri = 'irohaconnect://connect?sid=session&network_id=hash&app_pk=pk&nonce=n&node=x&v=1&role=wallet&token=secret&relay=r';

    await wrapper.get('[data-testid="iroha-connect-uri"]').setValue(uri);
    await wrapper.get('[data-testid="iroha-connect-start"]').trigger('click');
    await flushPromises();

    expect(mocks.connect).toHaveBeenCalledWith({ uri });
    expect(wrapper.text()).toContain('Waiting for the dApp');
    expect(wrapper.text()).not.toContain('token=secret');
  });

  it('explains a retired link instead of a generic failure', async () => {
    mocks.connect.mockRejectedValueOnce(new Error('iroha_connect_retired_link'));
    const wrapper = await mountPage();

    await wrapper.get('[data-testid="iroha-connect-uri"]').setValue('iroha://connect?sid=s&chain_id=c');
    await wrapper.get('[data-testid="iroha-connect-start"]').trigger('click');
    await flushPromises();

    expect(wrapper.text()).toContain('This link uses a retired IrohaConnect format. Ask the dApp for a new link.');
  });

  it('reviews the network, relay, requested permissions and account before session approval', async () => {
    const wrapper = await mountPage();

    mocks.subscriber?.(sessionSnapshot);
    await nextTick();

    expect(wrapper.text()).toContain('Hanami Market');
    expect(wrapper.text()).toContain('SORA Taira testnet');
    expect(wrapper.text()).toContain('taira.sora.org');
    expect(wrapper.text()).toContain('Sakura');
    const permissions = wrapper.get('[data-testid="iroha-connect-permissions"]').text();
    expect(permissions).toContain('Ask you to approve transactions');
    expect(permissions).toContain('Ask to sign messages (Fearless declines)');

    await wrapper.get('[data-testid="iroha-connect-approve-session"]').trigger('click');
    await flushPromises();

    expect(mocks.approveSession).toHaveBeenCalledWith({ accountId: ACCOUNT });
  });

  it('shows a decoded transfer and requires an explicit approval', async () => {
    const wrapper = await mountPage();

    mocks.subscriber?.(requestSnapshot(baseReview));
    await nextTick();

    expect(wrapper.get('[data-testid="iroha-connect-request-title"]').text()).toBe('Send 1.5 XOR');
    const review = wrapper.get('[data-testid="iroha-connect-review"]').text();
    expect(review).toContain('1.5 XOR');
    expect(review).toContain('0.25 XOR');
    expect(review).toContain('You');
    expect(review).toContain('100 s');
    expect(review).toContain('{"memo":"hanami"}');
    expect(wrapper.text()).toContain('a1'.repeat(32));
    expect(wrapper.text()).toContain('538 bytes');
    expect(wrapper.text()).toContain('Fearless decoded this transaction from the exact bytes it will sign.');

    await wrapper.get('[data-testid="iroha-connect-approve-request"]').trigger('click');
    await flushPromises();

    expect(mocks.approveRequest).toHaveBeenCalledWith({ requestId: 'sign-1' });
  });

  it('names a contract call by its entrypoint and shows its sponsor and gas bound', async () => {
    const wrapper = await mountPage();

    mocks.subscriber?.(
      requestSnapshot({
        ...baseReview,
        kind: 'contract-calls',
        transfer: undefined,
        fee: { ...baseReview.fee, payer: 'sponsor', program: `${ACCOUNT}/gasless`, programRevision: '2', gasLimit: '50000' },
        calls: [
          {
            contractAddress: 'irohac1qyqqqqqqqqqqqq95fes93ygegsv5enq9mqsz6x4lv4vp9gg4yxgjw',
            entrypoint: 'place_order',
            codeHashHex: 'ab'.repeat(32),
            argumentBytes: 4,
            argumentsSha256: 'cd'.repeat(32),
          },
        ],
      })
    );
    await nextTick();

    expect(wrapper.get('[data-testid="iroha-connect-request-title"]').text()).toBe('Call place_order');
    const review = wrapper.get('[data-testid="iroha-connect-review"]').text();
    expect(review).toContain('place_order');
    expect(review).toContain('4 bytes');
    expect(review).toContain('50000');
    expect(review).not.toContain('You');
    expect(wrapper.text()).toContain('cd'.repeat(32));
  });

  it('tells the person when the wallet declined a request on its own', async () => {
    const wrapper = await mountPage();

    mocks.subscriber?.({
      ...sessionSnapshot,
      phase: 'connected',
      selectedAccountId: ACCOUNT,
      notice: { at: 1, code: 'raw_signing_unavailable' },
    });
    await nextTick();

    expect(wrapper.get('[data-testid="iroha-connect-notice"]').text()).toBe(
      'Hanami Market asked to sign a message. Fearless declined: messages need a separate signing key.'
    );
  });
});
