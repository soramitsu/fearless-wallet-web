import type { IState } from '@extension-base/background/types/types';

class Storage {
  set(value: Partial<IState>) {
    return chrome.storage.local.set(value);
  }

  // eslint-disable-next-line prettier/prettier
  get(key: (keyof IState)[]): Promise<Pick<IState, (typeof key)[number]>> {
    // eslint-disable-next-line prettier/prettier
    return chrome.storage.local.get(key) as Promise<Pick<IState, (typeof key)[number]>>;
  }
}

export const storage = new Storage();

export async function initStorage() {
  const { authUrls, addressBook } = await storage.get(['authUrls', 'addressBook']);

  const obj: Record<string, any> = {
    defaultAuthAccountSelection: [],
    accountSubs: {},
    addresses: {},
    providers: {},
  };

  if (authUrls === undefined) obj.authUrls = {};

  if (addressBook === undefined) obj.addressBook = {};

  await storage.set(obj);
}
