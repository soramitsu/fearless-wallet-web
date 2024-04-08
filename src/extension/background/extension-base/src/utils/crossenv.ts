import { extractGlobal, xglobal } from '@polkadot/x-global';

// eslint-disable-next-line
// @ts-ignore
export const chrome = extractGlobal('browser', xglobal.chrome) as unknown as typeof globalThis.chrome;
