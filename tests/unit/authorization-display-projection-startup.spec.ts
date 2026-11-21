import { describe, expect, it, vi } from 'vitest';
import { SubscriptionService } from '@extension-base/services/subscription-service';
import { EventService } from '@extension-base/services/event-service';
import type State from '@extension-base/background/handlers/State';
import type { AuthUrls } from '@extension-base/background/types/types';

vi.mock('@/helpers', () => ({ isSameString: (a: string, b: string) => a === b }));
vi.mock('@/consts/global', () => ({ IS_EXTENSION_SMOKE: false }));

// A 4.2.2 grant as approval stores it: the display map starts empty and the start-up projection fills it.
function fixture() {
  const eventService = new EventService();
  let accounts: string[] = [];
  const authUrls = { 'http://localhost:60008': { isAllowed: true, allowedAccountsMap: {} } } as unknown as AuthUrls;
  const mutateAuthorizations = vi.fn(async (update: (entries: AuthUrls) => void) => {
    update(authUrls);
    return authUrls;
  });
  const state = {
    eventService,
    requestService: { mutateAuthorizations },
    getAddressList: (value = false) => Object.fromEntries(accounts.map((address) => [address, value])),
  };
  new SubscriptionService(state as unknown as State);

  return {
    authUrls,
    eventService,
    mutateAuthorizations,
    loadAccounts: (addresses: string[]) => { accounts = addresses; },
  };
}

describe('authorization display projection at start-up', () => {
  it('waits until the wallet records are read, so it lists every account', async () => {
    const { authUrls, eventService, mutateAuthorizations, loadAccounts } = fixture();

    // The authorization store may answer before the keyring has loaded its accounts.
    await Promise.resolve();
    await Promise.resolve();
    expect(mutateAuthorizations).not.toHaveBeenCalled();

    loadAccounts(['5Wallet', '0xWalletEvm', '5Other', '0xOtherEvm']);
    eventService.emit('crypto.ready', true);
    await vi.waitFor(() => expect(mutateAuthorizations).toHaveBeenCalledOnce());

    expect(authUrls['http://localhost:60008'].allowedAccountsMap).toEqual({
      '5Wallet': true, '0xWalletEvm': true, '5Other': true, '0xOtherEvm': true,
    });
  });
});
