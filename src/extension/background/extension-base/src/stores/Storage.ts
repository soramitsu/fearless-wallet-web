import browser from 'webextension-polyfill';
import { IState } from '../background/types';
class Storage {
  set(value: Partial<IState>) {
    return browser.storage.local.set(value);
  }

  get(key: (keyof IState)[]): Promise<Pick<IState, typeof key[number]>> {
    return browser.storage.local.get(key) as Promise<Pick<IState, typeof key[number]>>;
  }
}

export const storage = new Storage();
