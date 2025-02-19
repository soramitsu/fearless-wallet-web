import { type IState } from '@extension-base/background/types/types';
import { chrome } from '@extension-base/utils/crossenv';

export class StorageExtension {
  set(value: Partial<IState>) {
    return chrome.storage.local.set(value);
  }

  get(key: (keyof IState)[]): Promise<Pick<IState, (typeof key)[number]>> {
    return chrome.storage.local.get(key) as Promise<Pick<IState, (typeof key)[number]>>;
  }
}
