import { extractGlobal, xglobal } from '@polkadot/x-global';

export const browser = extractGlobal('browser', xglobal.browser ?? xglobal.chrome) as typeof globalThis.browser;
export const chrome = extractGlobal('chrome', browser ?? xglobal.chrome) as typeof globalThis.chrome;
