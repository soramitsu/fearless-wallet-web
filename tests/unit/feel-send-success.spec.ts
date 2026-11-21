import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import type { BasicTxResponse } from '@extension-base/background/types/types';

// Brand kit v3 SPEC part 2 and kit v4 "Shikiban" part 3: every operation shows its seal while it is on its way; when the
// network accepts it the seal closes and ignites, with the send sound for a send only; a failure breaks it, silently.
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

  // Swaps, staking and pools answer only with their outcome, like a send; they get the seal and no sound.
  it.each([
    ['swap', 'makeSwap'],
    ['bond', 'makeStaking'],
    ['nominate', 'makeStaking'],
    ['payoutRewards', 'makeStaking'],
    ['addLiquidity', 'makePool'],
  ] as const)('seals a %s on its way, ignites it on acceptance and breaks it on failure, silently', async (extrinsicType, sender) => {
    const messaging = await import('@/extension/messaging');
    const mounted = async (response: BasicTxResponse | null) => {
      setActivePinia(createPinia());
      vi.mocked(messaging[sender]).mockImplementation((() => (response ? Promise.resolve(response) : new Promise(() => undefined))) as never);
      const wrapper = mount(ConfirmationPasswordPopup, {
        props: { amount: '1', currency: { symbol: 'xor' }, extrinsicType, fee: '0.1', tx: {}, firstIcon: 'xor', secondIcon: extrinsicType === 'swap' ? 'val' : undefined },
        global: {
          mocks: { $n: (value: number) => String(value), $router: { push: vi.fn() }, $t: (key: string) => key },
          stubs: {
            ExternalLogo: { template: '<span />' },
            FButton: { template: '<button />' },
            Icon: { template: '<span />' },
            Loader: { template: '<span data-testid="loader" />' },
            Popup: { template: '<section><slot /></section>' },
            SealFigure: { props: ['stage', 'failed', 'size'], template: '<canvas data-testid="sealFigure" :data-stage="stage" :data-failed="String(failed)" :data-size="size" />' },
            SignMobile: { template: '<span />' },
            Tooltip: { template: '<span />' },
          },
        },
      });
      await flushPromises();
      return wrapper;
    };

    const waiting = await mounted(null);
    expect(waiting.find('[data-testid="loader"]').exists()).toBe(false);
    expect(waiting.get('[data-testid="sealFigure"]').attributes('data-stage')).toBe('ready');
    // Two tokens get the larger figure, so the pair sits inside its inner ring.
    expect(waiting.get('[data-testid="sealFigure"]').attributes('data-size')).toBe(extrinsicType === 'swap' ? '156' : '112');
    waiting.unmount();

    const accepted = await mounted({ status: true, errors: [] } as unknown as BasicTxResponse);
    expect(accepted.get('[data-testid="sealFigure"]').attributes('data-stage')).toBe('accepted');
    accepted.unmount();

    const failed = await mounted({ status: false, errors: [{ message: 'failed' }] } as unknown as BasicTxResponse);
    expect(failed.get('[data-testid="sealFigure"]').attributes('data-failed')).toBe('true');
    expect(failed.find('[data-testid="transactionErrorMessage"]').exists()).toBe(true);
    failed.unmount();

    expect(playSound).not.toHaveBeenCalled();
  });
});
