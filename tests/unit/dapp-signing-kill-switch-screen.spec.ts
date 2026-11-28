import { flushPromises, mount } from '@vue/test-utils';
import { reactive } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SigningRequest } from '@extension-base/background/types/types';
import type { EvmRequestPayload, SolanaRequestPayload } from '@extension-base/services/request-service/types';
import type { WalletConnectTransactionRequest } from '@extension-base/services/wallet-connect-service/types';
import type { DappSigningVetoes } from '@/util/dappSigningKillSwitch';
import FButton from '@/components/FButton.vue';
import Checkbox from '@/components/Checkbox.vue';

const mocks = vi.hoisted(() => ({
  approveSign: vi.fn(),
  signCancel: vi.fn(),
  approveWalletConnect: vi.fn(),
  rejectWalletConnect: vi.fn(),
  deny: vi.fn(),
  push: vi.fn(),
  notify: vi.fn(),
  store: {} as Record<string, unknown>,
  killSwitch: {} as { vetoes: DappSigningVetoes },
}));
vi.mock('@/stores/extension', () => ({ useExtensionStore: () => mocks.store }));
vi.mock('@/stores/networks', () => ({ useNetworksStore: () => ({ allNetworks: [] }) }));
vi.mock('@/stores/dappSigningKillSwitch', () => ({ useDappSigningKillSwitchStore: () => mocks.killSwitch }));
vi.mock('vue-router', () => ({ useRouter: () => ({ push: mocks.push, currentRoute: { value: { name: 'Transaction' } } }) }));
vi.mock('@/router/routes', () => ({ Components: { Wallet: 'Wallet', Transaction: 'Transaction' } }));
vi.mock('@/plugins/soramitsuUI', () => ({ useNotify: () => mocks.notify }));
vi.mock('@polkadot/phishing', () => ({ checkIfDenied: mocks.deny }));
vi.mock('@/locales/useI18n', () => ({
  useI18n: () => ({ t: (key: string, params?: unknown) => (params ? `${key} ${JSON.stringify(params)}` : key) }),
}));

import Transaction from '@/screens/extension-ui/signing/Transaction.vue';

const evmAddress = `0x${'11'.repeat(20)}`;
const substrateAddress = '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY';
const solanaAddress = '11111111111111111111111111111111';
const PAUSED = (family: string) => `signingReview.dappSigningPaused {"family":"${family}"}`;

const evmRequest = (): EvmRequestPayload => ({
  id: 'evm.request',
  url: 'https://evm.example',
  method: 'personal_sign',
  data: ['0xff', evmAddress],
  account: { address: evmAddress, name: 'Wallet', isMobile: false },
  network: { name: 'Ethereum', chainId: '1', genesisHash: '0x1234', symbol: 'ETH', decimals: 18 },
});
const substrateRequest = (): SigningRequest =>
  ({
    id: 'substrate.request',
    url: 'https://polkadot.example',
    account: { address: substrateAddress, name: 'Wallet' },
    request: { payload: { address: substrateAddress, data: '0x1234', type: 'bytes' } },
  }) as unknown as SigningRequest;
const solanaRequest = (): SolanaRequestPayload => ({
  id: 'solana.request',
  url: 'https://solana.example',
  origin: 'https://solana.example',
  ecosystem: 'solana',
  method: 'signMessage',
  messageBase64: 'aGVsbG8=',
  account: { address: solanaAddress, publicKey: solanaAddress, name: 'Wallet' },
});
const walletConnectRequest = (): WalletConnectTransactionRequest => ({
  id: 7,
  topic: 'wc-topic',
  approvalId: 'wc-approval',
  params: { chainId: 'eip155:1', request: { method: 'personal_sign', params: ['0xff', evmAddress] } },
  verifyContext: { verified: { origin: 'https://wc.example', validation: 'UNKNOWN', verifyUrl: '' } },
  context: {
    session: { topic: 'wc-topic', origin: 'https://wc.example', peerPublicKey: 'peer', revision: 0 },
    account: { address: evmAddress, name: 'Wallet', isMobile: false },
    network: { name: 'Ethereum', chainId: '1', genesisHash: '0x1234', symbol: 'ETH', decimals: 18 },
  },
});

function setQueues({
  substrate = [],
  evm = [],
  solana = [],
  wc = [],
}: {
  substrate?: SigningRequest[];
  evm?: EvmRequestPayload[];
  solana?: SolanaRequestPayload[];
  wc?: WalletConnectTransactionRequest[];
}) {
  mocks.store.signAllRequests = {
    substrate,
    evm: Object.fromEntries(evm.map((entry) => [entry.id, entry])),
    solana: Object.fromEntries(solana.map((entry) => [entry.id, entry])),
  };
  mocks.store.wcRequests = wc;
}

const open = (walletConnect = false) =>
  mount(Transaction, {
    attachTo: document.body,
    props: walletConnect
      ? { walletConnect: true, approveWalletConnect: mocks.approveWalletConnect, rejectWalletConnect: mocks.rejectWalletConnect }
      : {},
    global: { stubs: { AboveForm: { template: '<main><slot /></main>' }, FButton, Checkbox, Icon: true } },
  });
const alerts = (wrapper: ReturnType<typeof open>) => wrapper.findAll('[role="alert"]').map((node) => node.text());

beforeEach(() => {
  vi.resetAllMocks();
  mocks.deny.mockResolvedValue(false);
  mocks.push.mockResolvedValue(undefined);
  mocks.approveSign.mockResolvedValue(true);
  mocks.signCancel.mockResolvedValue(undefined);
  mocks.rejectWalletConnect.mockResolvedValue(true);
  mocks.store = reactive({ approveSign: mocks.approveSign, signCancel: mocks.signCancel, wcRequests: [] });
  mocks.killSwitch = reactive({ vetoes: {} });
  setQueues({});
});

describe('signing screen while dApp signing is paused', () => {
  it.each([
    ['polkadot-js', 'polkadot', 'Polkadot', () => setQueues({ substrate: [substrateRequest()] }), 'substrate.request', 'substrate'],
    ['injected EVM', 'evm', 'EVM', () => setQueues({ evm: [evmRequest()] }), 'evm.request', 'evm'],
    ['Solana', 'solana', 'Solana', () => setQueues({ solana: [solanaRequest()] }), 'solana.request', 'solana'],
  ] as const)('says a paused %s request is paused, offers only Reject, and Reject declines it', async (
    _label, family, name, queue, id, kind
  ) => {
    queue();
    mocks.killSwitch.vetoes = { [family]: true };
    const wrapper = open();
    await flushPromises();

    expect(alerts(wrapper)).toEqual([PAUSED(name)]);
    expect(wrapper.find('[data-testid="approveSigning"]').exists()).toBe(false);
    expect(wrapper.find('input[type="checkbox"]').exists()).toBe(false);

    await wrapper.get('[data-testid="rejectSigning"] button').trigger('click');
    await flushPromises();
    expect(mocks.signCancel).toHaveBeenCalledExactlyOnceWith({ id, kind });
    expect(mocks.approveSign).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('says a paused WalletConnect eip155 request is paused and declines it on Reject', async () => {
    setQueues({ wc: [walletConnectRequest()] });
    mocks.killSwitch.vetoes = { evm: true };
    const wrapper = open(true);
    await flushPromises();

    expect(alerts(wrapper)).toEqual([PAUSED('EVM')]);
    expect(wrapper.find('[data-testid="approveWalletConnectSigning"]').exists()).toBe(false);

    await wrapper.get('[data-testid="rejectWalletConnectSigning"] button').trigger('click');
    await flushPromises();
    expect(mocks.rejectWalletConnect).toHaveBeenCalledExactlyOnceWith('wc-approval');
    expect(mocks.approveWalletConnect).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('keeps an EVM request signable while only the other families are paused', async () => {
    setQueues({ evm: [evmRequest()] });
    mocks.killSwitch.vetoes = { polkadot: true, solana: true, ton: true };
    const wrapper = open();
    await flushPromises();

    expect(alerts(wrapper).some((text) => text.startsWith('signingReview.dappSigningPaused'))).toBe(false);
    expect(wrapper.find('[data-testid="approveSigning"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('shows the pause the background reports when the popup had not heard of it yet', async () => {
    setQueues({ evm: [evmRequest()] });
    mocks.approveSign.mockRejectedValueOnce(new Error('dapp_signing_paused:evm'));
    const wrapper = open();
    await flushPromises();
    (wrapper.get('details').element as HTMLDetailsElement).open = true;
    await wrapper.get('details').trigger('toggle');
    await wrapper.get('input[type="checkbox"]').setValue(true);

    await wrapper.get('[data-testid="approveSigning"] button').trigger('click');
    await flushPromises();

    expect(mocks.approveSign).toHaveBeenCalledExactlyOnceWith({ id: 'evm.request', kind: 'evm' });
    expect(mocks.notify).toHaveBeenCalledExactlyOnceWith({ title: PAUSED('EVM'), message: '', type: 'error' });
    // One message: no generic failure next to it.
    expect(alerts(wrapper)).not.toContain('addWallet.google.somethingWrong');
    wrapper.unmount();
  });
});
