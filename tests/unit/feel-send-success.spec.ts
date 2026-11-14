import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import type { BasicTxResponse } from '@extension-base/background/types/types';

// Brand kit v3 SPEC part 2: a transfer the network accepts plays the send sound and ignites the solar geometry; a
// failed or unconfirmed one does neither.
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
        SolarIgnite: { template: '<canvas data-testid="solarIgnite" />' },
        Tooltip: { template: '<span />' },
      },
    },
  });
  await flushPromises();
  return wrapper;
}

beforeEach(() => playSound.mockClear());

describe('a sent transfer', () => {
  it('ignites the solar geometry around the success mark and plays the send sound once', async () => {
    const wrapper = await sendWith({ status: true, errors: [] } as unknown as BasicTxResponse);

    expect(wrapper.find('[data-testid="solarIgnite"]').exists()).toBe(true);
    expect(playSound).toHaveBeenCalledExactlyOnceWith('send');
    wrapper.unmount();
  });

  it('stays quiet and plain when the transfer fails', async () => {
    const wrapper = await sendWith({ status: false, errors: [{ message: 'failed' }] } as unknown as BasicTxResponse);

    expect(wrapper.find('[data-testid="transactionErrorMessage"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="solarIgnite"]').exists()).toBe(false);
    expect(playSound).not.toHaveBeenCalled();
    wrapper.unmount();
  });
});
