import { chrome } from '@extension-base/utils/crossenv';
import type { IState } from '@extension-base/background/types/types';

export class StorageExtension {
  set(value: Partial<IState>) {
    return chrome.storage.local.set(value);
  }

  get(keys: (keyof IState)[]): Promise<Pick<IState, (typeof keys)[number]>> {
    return new Promise((resolve) => {
      chrome.storage.local.get(keys, (result: Record<string, unknown>) => {
        const sanitized = {} as Pick<IState, (typeof keys)[number]>;

        keys.forEach((key) => {
          const storageKey = key as string;
          const value = result[storageKey];

          if (value === undefined || value === null) {
            console.warn(`StorageExtension.get: invalid value for key "${storageKey}", removing`);
            chrome.storage.local.remove(storageKey, () => {
              const error = chrome.runtime.lastError;
              if (error) console.error('StorageExtension.get::remove', error);
            });
            sanitized[key] = {} as IState[(typeof keys)[number]];
          } else {
            sanitized[key] = value as IState[(typeof keys)[number]];
          }
        });

        resolve(sanitized);
      });
    });
  }
}
