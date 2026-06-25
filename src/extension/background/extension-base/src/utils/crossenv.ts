import { extractGlobal, xglobal } from '@polkadot/x-global';

type PromiseStorageLocal = {
  get(keys?: string | string[] | Record<string, unknown> | null): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
};

// eslint-disable-next-line
// @ts-ignore
export const chrome = extractGlobal('browser', xglobal.chrome) as unknown as typeof globalThis.chrome & {
  storage: {
    local: PromiseStorageLocal;
  };
};
