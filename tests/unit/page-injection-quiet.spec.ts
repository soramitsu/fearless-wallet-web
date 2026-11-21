import { MESSAGE_ORIGIN_PAGE } from '@extension-base/defaults';
import type { FWSolanaProvider } from '@extension-base/page/types';

type Posted = { message: string; origin: string };

describe('page script injection', () => {
  let posted: Posted[];

  beforeEach(() => {
    posted = [];
    vi.resetModules();
    vi.spyOn(window, 'postMessage').mockImplementation((message: unknown) => {
      posted.push(message as Posted);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends nothing to the wallet on a page that does not use it, and asks once a dApp reads its accounts', async () => {
    const registered: FWSolanaProvider[] = [];

    const onRegister = ((event: CustomEvent<(api: unknown) => void>) => {
      event.detail({ register: (wallet: FWSolanaProvider) => registered.push(wallet) });
    }) as EventListener;

    window.addEventListener('wallet-standard:register-wallet', onRegister);

    await import('@/extension/entry/page');
    window.dispatchEvent(new Event('load'));
    await new Promise((resolve) => setTimeout(resolve, 0));

    const toWallet = () => posted.filter(({ origin }) => origin === MESSAGE_ORIGIN_PAGE).map(({ message }) => message);

    expect(registered).toHaveLength(1);
    expect(toWallet()).toEqual([]);

    expect(registered[0].accounts).toEqual([]);

    expect(toWallet()).toEqual(['solana(accounts)', 'solana(events.subscribe)']);
    window.removeEventListener('wallet-standard:register-wallet', onRegister);
  });
});
