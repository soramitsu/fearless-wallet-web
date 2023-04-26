import { IState } from '../background/types/types';
class Storage {
  set(value: Partial<IState>) {
    return chrome.storage.local.set(value);
  }

  // eslint-disable-next-line prettier/prettier
  get(key: (keyof IState)[]): Promise<Pick<IState, typeof key[number]>> {
    // eslint-disable-next-line prettier/prettier
    return chrome.storage.local.get(key) as Promise<Pick<IState, typeof key[number]>>;
  }
}

export const storage = new Storage();
