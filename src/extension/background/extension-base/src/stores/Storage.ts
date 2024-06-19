import { chrome } from '@extension-base/utils/crossenv';
import type { IState } from '@extension-base/background/types/types';

class Storage {
  set(value: Partial<IState>) {
    return chrome.storage.local.set(value);
  }

  get(key: (keyof IState)[]): Promise<Pick<IState, (typeof key)[number]>> {
    return chrome.storage.local.get(key) as Promise<Pick<IState, (typeof key)[number]>>;
  }
}

export const storage = new Storage();

export async function initStorage() {
  const { authUrls, addressBook, selectedNetworks } = await storage.get([
    'authUrls',
    'addressBook',
    'selectedNetworks',
  ]);

  const obj: Record<string, unknown> = {
    defaultAuthAccountSelection: [],
    accountSubs: {},
    addresses: {},
    providers: {},
  };

  if (authUrls === undefined) obj.authUrls = {};
  if (selectedNetworks === undefined) obj.selectedNetworks = {};
  if (addressBook === undefined) obj.addressBook = {};

  await storage.set(obj);
}
