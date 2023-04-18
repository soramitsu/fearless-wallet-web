import { IState } from '../background/types';
class Storage {
  set(value: Partial<IState>) {
    return chrome.storage.local.set(value);
  }

  get(key: (keyof IState)[]): Promise<Pick<IState, typeof key[number]>> {
    return chrome.storage.local.get(key) as Promise<Pick<IState, typeof key[number]>>;
  }
}

export const storage = new Storage();
