import { StorageExtension } from '@extension-base/stores/StorageExtension';
import { StorageWeb } from '@extension-base/stores/StorageWeb';
import { IS_EXTENSION } from '@/consts/global';

export const storage = IS_EXTENSION ? new StorageExtension() : new StorageWeb();

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
