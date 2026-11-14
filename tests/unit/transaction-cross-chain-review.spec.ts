import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { reactive } from 'vue';
import type { SigningRequest } from '@extension-base/background/types/types';
import type { CrossChainCallSummary } from '@/cross-chain/dappCrossChainCalls';
import FButton from '@/components/FButton.vue';
import Checkbox from '@/components/Checkbox.vue';
import { signingReview } from '@/screens/extension-ui/signing/review';

const mocks = vi.hoisted(() => ({
  approveSign: vi.fn(),
  deny: vi.fn(),
  push: vi.fn(),
  notify: vi.fn(),
  store: {} as Record<string, unknown>,
}));
vi.mock('@/stores/extension', () => ({ useExtensionStore: () => mocks.store }));
vi.mock('@/stores/networks', () => ({ useNetworksStore: () => ({ allNetworks: [] }) }));
vi.mock('vue-router', () => ({ useRouter: () => ({ push: mocks.push, currentRoute: { value: { name: 'Transaction' } } }) }));
vi.mock('@/router/routes', () => ({ Components: { Wallet: 'Wallet', Transaction: 'Transaction' } }));
vi.mock('@/plugins/soramitsuUI', () => ({ useNotify: () => mocks.notify }));
vi.mock('@polkadot/phishing', () => ({ checkIfDenied: mocks.deny }));
vi.mock('@/locales/useI18n', () => ({
  useI18n: () => ({
    t: (key: string, params: Record<string, string> = {}) =>
      Object.keys(params).length ? `${key}(${Object.values(params).join(',')})` : key,
  }),
}));

import Transaction from '@/screens/extension-ui/signing/Transaction.vue';

const genesisHash = `0x${'91'.repeat(32)}`;
const teleport: CrossChainCallSummary = {
  path: '0',
  call: 'xcmPallet.limitedTeleportAssets',
  destination: { network: 'Polkadot AssetHub', relay: 'Polkadot', paraId: 1000 },
  beneficiary: '15oF4uVJwmo4TdGW7VfQxNLavjCXviqxT9S1MgbjMNHr6Sp5',
  assets: [{ asset: 'DOT', amount: '1.5' }],
  highRisk: false,
};
const request = (crossChain: CrossChainCallSummary[] | undefined): SigningRequest =>
  ({
    id: 'public',
    url: 'https://bridge.example',
    account: { address: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY', name: 'Wallet' },
    network: { genesisHash, name: 'Polkadot' },
    request: { payload: { genesisHash, method: '0x6309', address: '5Grw', version: 4 } },
    ...(crossChain ? { callReview: { status: 'decoded', crossChain } } : {}),
  }) as unknown as SigningRequest;

function open(value: SigningRequest) {
  mocks.store.signAllRequests = { substrate: [value], evm: {}, solana: {} };

  return mount(Transaction, {
    attachTo: document.body,
    global: { stubs: { AboveForm: { template: '<main><slot /></main>' }, FButton, Checkbox, Icon: true, WalletInfo: true } },
  });
}
const approve = (wrapper: ReturnType<typeof open>) => wrapper.find('[data-testid="approveSigning"] button');
async function acknowledgeBlindSigning(wrapper: ReturnType<typeof open>) {
  const details = wrapper.get('details');
  (details.element as HTMLDetailsElement).open = true;
  await details.trigger('toggle');
  await wrapper.findAll('input[type="checkbox"]')[0].setValue(true);
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.deny.mockResolvedValue(false);
  mocks.push.mockResolvedValue(undefined);
  mocks.approveSign.mockResolvedValue(true);
  mocks.store = reactive({ approveSign: mocks.approveSign, signAllRequests: { substrate: [], evm: {}, solana: {} } });
});

describe('cross-chain transfers in the signing review', () => {
  it('maps each decoded transfer to a cross-chain action before the raw call', () => {
    const review = signingReview(request([teleport]));

    expect(review).toMatchObject({ refused: false, highRisk: false, blocked: false, blind: true });
    expect(review.actions).toEqual([
      {
        kind: 'crossChain',
        call: 'xcmPallet.limitedTeleportAssets',
        destination: teleport.destination,
        to: teleport.beneficiary,
        assets: teleport.assets,
        highRisk: false,
        refusal: undefined,
      },
      expect.objectContaining({ kind: 'unknown' }),
    ]);
  });

  it('keeps an unreadable payload as before', () => {
    const review = signingReview(request(undefined));

    expect(review).toMatchObject({ refused: false, highRisk: false, blocked: false, blind: true });
    expect(review.actions).toEqual([expect.objectContaining({ kind: 'unknown' })]);
  });

  it('shows where the funds go and lets the user approve after the usual consent', async () => {
    const wrapper = open(request([teleport]));
    await flushPromises();

    expect(wrapper.text()).toContain('signingReview.crossChainTitle');
    expect(wrapper.text()).toContain('signingReview.crossChainNotice');
    expect(wrapper.text()).toContain('Polkadot AssetHub (Polkadot · signingReview.crossChainParachain(1000))');
    expect(wrapper.text()).toContain(teleport.beneficiary);
    expect(wrapper.text()).toContain('1.5');
    expect(wrapper.find('[data-testid="crossChainHighRiskAcknowledge"]').exists()).toBe(false);
    await acknowledgeBlindSigning(wrapper);
    expect(approve(wrapper).attributes('aria-disabled')).toBeUndefined();
    await approve(wrapper).trigger('click');
    expect(mocks.approveSign).toHaveBeenCalledWith({ id: 'public', kind: 'substrate' });
    wrapper.unmount();
  });

  it('says why it refuses a transfer to a destination that cannot deliver, and offers no approval', async () => {
    const refused = { ...teleport, blocked: { code: 'sora-parachain-halted' as const, reason: 'halted' } };
    const wrapper = open(request([refused]));
    await flushPromises();

    expect(wrapper.text()).toContain('signingReview.crossChainRefused');
    expect(wrapper.text()).toContain('signingReview.crossChainReason.soraParachainHalted');
    expect(wrapper.text()).not.toContain('signingReview.invalidRequest');
    expect(approve(wrapper).exists()).toBe(false);
    expect(wrapper.findAll('input[type="checkbox"]')).toHaveLength(0);
    wrapper.unmount();
  });

  it('needs a separate confirmation for raw cross-network instructions', async () => {
    const execute: CrossChainCallSummary = { path: '0', call: 'xcmPallet.execute', assets: [], highRisk: true };
    const wrapper = open(request([execute]));
    await flushPromises();

    expect(wrapper.text()).toContain('signingReview.crossChainHighRisk');
    await acknowledgeBlindSigning(wrapper);
    expect(approve(wrapper).attributes('aria-disabled')).toBe('true');
    await wrapper.get('[data-testid="crossChainHighRiskAcknowledge"] input[type="checkbox"]').setValue(true);
    expect(approve(wrapper).attributes('aria-disabled')).toBeUndefined();
    wrapper.unmount();
  });

  it('names the refusal when the wallet refuses at approval', async () => {
    mocks.approveSign.mockRejectedValue(new Error('cross_chain_destination_retired: halted'));
    const wrapper = open(request(undefined));
    await flushPromises();
    await acknowledgeBlindSigning(wrapper);
    await approve(wrapper).trigger('click');
    await flushPromises();

    expect(mocks.notify).toHaveBeenCalledWith({ title: 'signingReview.crossChainRefused', message: '', type: 'error' });
    wrapper.unmount();
  });
});
