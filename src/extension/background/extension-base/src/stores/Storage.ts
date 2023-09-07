import type { IState } from '@/extension/background/extension-base/src/background/types';

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
  const { authUrls, addressBook, selectedNetwork } = await storage.get(['authUrls', 'addressBook', 'selectedNetwork']);

  const obj: Record<string, unknown> = {
    defaultAuthAccountSelection: [],
    accountSubs: {},
    addresses: {},
    providers: {},
  };

  if (authUrls === undefined) obj.authUrls = {};
  if (selectedNetwork === undefined) obj.selectedNetwork = {};
  if (addressBook === undefined) obj.addressBook = {};

  await storage.set(obj);
}
