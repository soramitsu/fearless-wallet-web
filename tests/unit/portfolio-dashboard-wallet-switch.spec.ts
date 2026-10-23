import { effectScope, reactive, ref, nextTick } from 'vue';
import { flushPromises } from '@vue/test-utils';

const mocks = vi.hoisted(() => ({
  updateCurrentAccount: vi.fn(),
  accounts: undefined as unknown as { accounts: Array<{ address: string; name: string; walletEcosystem: string }>; selectedWallet: { address: string } },
  route: undefined as unknown as { value: { fullPath: string } },
}));

vi.mock('@/extension/messaging', () => ({ updateCurrentAccount: mocks.updateCurrentAccount }));
vi.mock('vue-router', async () => {
  const { ref: vueRef } = await import('vue');

  mocks.route = vueRef({ fullPath: '/where' });

  return { useRouter: () => ({ currentRoute: mocks.route }) };
});
vi.mock('@/stores/accounts', async () => {
  const { reactive: vueReactive } = await import('vue');

  mocks.accounts = vueReactive({
    accounts: [
      { address: 'main', name: 'Main', walletEcosystem: 'substrate' },
      { address: 'savings', name: 'Savings', walletEcosystem: 'substrate' },
    ],
    selectedWallet: { address: 'main' },
  });

  return { useAccountsStore: () => mocks.accounts };
});

import { REDIRECT_SETTLE_MS, WALLET_SWITCH_TIMEOUT_MS, useWalletSwitch } from '@/portfolio/dashboard/useWalletSwitch';

const scope = effectScope();
const setup = () => scope.run(() => useWalletSwitch())!;

beforeEach(() => {
  vi.useFakeTimers();
  mocks.updateCurrentAccount.mockReset();
  mocks.accounts.selectedWallet.address = 'main';
  mocks.route.value = { fullPath: '/where' };
});
afterEach(() => vi.useRealTimers());

describe('switching wallet before acting', () => {
  it('does nothing for the wallet that is already selected', async () => {
    const { switchTo } = setup();

    await expect(switchTo('main')).resolves.toBe(true);
    expect(mocks.updateCurrentAccount).not.toHaveBeenCalled();
  });

  it('cannot switch to a wallet the popup does not know', async () => {
    const { failed, switchTo } = setup();

    await expect(switchTo('stranger')).resolves.toBe(false);
    expect(mocks.updateCurrentAccount).not.toHaveBeenCalled();
    // ...and it says so, rather than leaving a button that does nothing.
    expect(failed.value).toBe(true);
  });

  it('asks the background, waits for the selected wallet to follow, then for the portfolio redirect to land', async () => {
    mocks.updateCurrentAccount.mockImplementation(async () => {
      // As App.vue does on an account update: the redirect starts, then the store follows.
      setTimeout(() => {
        mocks.accounts.selectedWallet.address = 'savings';
      }, 50);
      setTimeout(() => {
        mocks.route.value = { fullPath: '/portfolio' };
      }, 300);
    });
    const { switchTo, switching, failed } = setup();
    let result: boolean | undefined;

    void switchTo('savings').then((value) => (result = value));
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.updateCurrentAccount).toHaveBeenCalledWith('savings', 'substrate');
    expect(switching.value).toBe('Savings');

    // The wallet has changed but the redirect has not landed: the caller must not navigate yet.
    await vi.advanceTimersByTimeAsync(100);
    expect(result).toBeUndefined();

    await vi.advanceTimersByTimeAsync(300);
    expect(result).toBe(true);
    expect(failed.value).toBe(false);
    expect(switching.value).toBeNull();
  });

  it('goes on after the settle time when the app does not redirect', async () => {
    mocks.updateCurrentAccount.mockImplementation(async () => {
      setTimeout(() => {
        mocks.accounts.selectedWallet.address = 'savings';
      }, 10);
    });
    let result: boolean | undefined;

    void setup().switchTo('savings').then((value) => (result = value));
    await vi.advanceTimersByTimeAsync(100);
    expect(result).toBeUndefined();

    await vi.advanceTimersByTimeAsync(REDIRECT_SETTLE_MS);
    expect(result).toBe(true);
  });

  it('says it failed when the wallet never changes, and when the background refuses', async () => {
    mocks.updateCurrentAccount.mockResolvedValue(undefined);
    const quiet = setup();
    let result: boolean | undefined;

    void quiet.switchTo('savings').then((value) => (result = value));
    await vi.advanceTimersByTimeAsync(WALLET_SWITCH_TIMEOUT_MS + 10);
    expect(result).toBe(false);
    expect(quiet.failed.value).toBe(true);
    expect(quiet.switching.value).toBeNull();

    mocks.updateCurrentAccount.mockRejectedValue(new Error('port closed'));
    const refused = setup();

    await expect(refused.switchTo('savings')).resolves.toBe(false);
    expect(refused.failed.value).toBe(true);
  });

  it('clears an earlier failure when it tries again', async () => {
    mocks.updateCurrentAccount.mockRejectedValueOnce(new Error('port closed')).mockImplementation(async () => {
      mocks.accounts.selectedWallet.address = 'savings';
    });
    const { switchTo, failed } = setup();

    await switchTo('savings');
    expect(failed.value).toBe(true);

    const second = switchTo('savings');
    await vi.advanceTimersByTimeAsync(REDIRECT_SETTLE_MS + 10);
    await expect(second).resolves.toBe(true);
    expect(failed.value).toBe(false);
  });
});

// Keep the imports used where a type-only reading would drop them.
void [reactive, ref, nextTick, flushPromises];
