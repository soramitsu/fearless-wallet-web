import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { nextTick } from 'vue';
import type { BasicTxResponse } from '@extension-base/background/types/types';

// Brand kit v3 SPEC part 2 and kit v4 "Shikiban" part 3: a send shows its seal while it is on its way; when the network
// accepts it the seal closes and ignites and the send sound plays; a failure breaks the seal, silently.
const { makeTransfer, playSound } = vi.hoisted(() => ({ makeTransfer: vi.fn(), playSound: vi.fn(async () => ({ played: true })) }));

vi.mock('@/extension/messaging', () => ({
  makeCrossChain: vi.fn(),
  makePool: vi.fn(),
  makeStaking: vi.fn(),
  makeSwap: vi.fn(),
  makeTransfer,
}));
vi.mock('@/extension/messaging/nfts', () => ({ sendNft: vi.fn() }));
vi.mock('@/feel/sound', () => ({ playSound, prepareSounds: vi.fn() }));

import { makeSwap } from '@/extension/messaging';
import ConfirmationPasswordPopup from '@/screens/wallet&asset/ConfirmationPasswordPopup.vue';

async function sendWith(response: BasicTxResponse, extrinsicType = 'transfer') {
  setActivePinia(createPinia());
  makeTransfer.mockImplementation(async (_request: unknown, callback: (data: BasicTxResponse) => void) => {
    callback(response);
    return response;
  });
  const wrapper = mount(ConfirmationPasswordPopup, {
    props: { amount: '1', currency: { symbol: 'dot' }, extrinsicType, fee: '0.1', tx: {} },
    global: {
      mocks: { $n: (value: number) => String(value), $router: { push: vi.fn() }, $t: (key: string) => key },
      stubs: {
        ExternalLogo: { template: '<span />' },
        FButton: { template: '<button />' },
        Icon: { template: '<span />' },
        Loader: { template: '<span />' },
        Popup: { template: '<section><slot /></section>' },
        SignMobile: { template: '<span />' },
        SealFigure: { props: ['stage', 'failed'], template: '<canvas data-testid="sealFigure" :data-stage="stage" :data-failed="String(failed)" />' },
        Tooltip: { template: '<span />' },
      },
    },
  });
  await flushPromises();
  return wrapper;
}

beforeEach(() => playSound.mockClear());

describe('a sent transfer', () => {
  it('closes and ignites the seal around the success mark and plays the send sound once', async () => {
    const wrapper = await sendWith({ status: true, errors: [] } as unknown as BasicTxResponse);

    const seal = wrapper.get('[data-testid="sealFigure"]');
    expect(seal.attributes('data-stage')).toBe('accepted');
    expect(seal.attributes('data-failed')).toBe('false');
    expect(playSound).toHaveBeenCalledExactlyOnceWith('send');
    wrapper.unmount();
  });

  it('breaks the seal, silently, when the transfer fails', async () => {
    const wrapper = await sendWith({ status: false, errors: [{ message: 'failed' }] } as unknown as BasicTxResponse);

    expect(wrapper.find('[data-testid="transactionErrorMessage"]').exists()).toBe(true);
    const seal = wrapper.get('[data-testid="sealFigure"]');
    expect(seal.attributes('data-stage')).toBe('ready');
    expect(seal.attributes('data-failed')).toBe('true');
    expect(playSound).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('shows the seal ready, and no amount or outcome, while the transfer is on its way', async () => {
    setActivePinia(createPinia());
    makeTransfer.mockImplementation(() => new Promise(() => undefined));
    const wrapper = mount(ConfirmationPasswordPopup, {
      props: { amount: '1', currency: { symbol: 'dot' }, extrinsicType: 'transfer', fee: '0.1', tx: {} },
      global: {
        mocks: { $n: (value: number) => String(value), $router: { push: vi.fn() }, $t: (key: string) => key },
        stubs: {
          ExternalLogo: { template: '<span />' },
          FButton: { template: '<button />' },
          Icon: { template: '<span />' },
          Loader: { template: '<span data-testid="loader" />' },
          Popup: { template: '<section><slot /></section>' },
          SealFigure: { props: ['stage', 'failed'], template: '<canvas data-testid="sealFigure" :data-stage="stage" />' },
          SignMobile: { template: '<span />' },
          Tooltip: { template: '<span />' },
        },
      },
    });
    await flushPromises();

    expect(wrapper.get('[data-testid="sealFigure"]').attributes('data-stage')).toBe('ready');
    expect(wrapper.find('[data-testid="loader"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="confirmedTransferAmount"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="transactionErrorMessage"]').exists()).toBe(false);
    expect(playSound).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('keeps the loader, and no seal, for an operation that is not a send', async () => {
    setActivePinia(createPinia());
    vi.mocked(makeSwap).mockImplementation(() => new Promise(() => undefined));
    const wrapper = mount(ConfirmationPasswordPopup, {
      props: { amount: '1', currency: { symbol: 'dot' }, extrinsicType: 'swap', fee: '0.1', tx: {} },
      global: {
        mocks: { $n: (value: number) => String(value), $router: { push: vi.fn() }, $t: (key: string) => key },
        stubs: {
          ExternalLogo: { template: '<span />' },
          FButton: { template: '<button />' },
          Icon: { template: '<span />' },
          Loader: { template: '<span data-testid="loader" />' },
          Popup: { template: '<section><slot /></section>' },
          SealFigure: { template: '<canvas data-testid="sealFigure" />' },
          SignMobile: { template: '<span />' },
          Tooltip: { template: '<span />' },
        },
      },
    });
    await nextTick();

    expect(wrapper.find('[data-testid="loader"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="sealFigure"]').exists()).toBe(false);
    wrapper.unmount();
  });
});
