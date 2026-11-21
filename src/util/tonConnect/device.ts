/**
 * TON Connect constants and the wallet's DeviceInfo. Kept apart from the protocol code because the page bridge, which
 * every website loads, needs only these and none of the TON libraries.
 */

export const TON_CONNECT_PROTOCOL_VERSION = 2;
/** A v4R2 wallet carries at most four messages in one transfer. */
export const TON_CONNECT_MAX_MESSAGES = 4;
export const TON_CONNECT_MAINNET = '-239';
export const TON_CONNECT_TESTNET = '-3';
/** The name both mobile apps already report as `DeviceInfo.appName`. */
export const TON_CONNECT_APP_NAME = 'Fearless';
/** The page binding `window.Fearless.tonconnect`, the key the iOS in-app browser already injects. */
export const TON_CONNECT_BRIDGE_KEY = 'Fearless';
export const TON_CONNECT_SIGN_DATA_TYPES = Object.freeze(['text', 'binary', 'cell'] as const);

export type TonConnectSignDataType = (typeof TON_CONNECT_SIGN_DATA_TYPES)[number];

export type TonConnectFeature =
  | 'SendTransaction'
  | { name: 'SendTransaction'; maxMessages: number }
  | { name: 'SignData'; types: TonConnectSignDataType[] };

export type TonConnectPlatform = 'windows' | 'mac' | 'linux' | 'browser';

export type TonConnectDeviceInfo = {
  platform: TonConnectPlatform;
  appName: string;
  appVersion: string;
  maxProtocolVersion: number;
  features: TonConnectFeature[];
};

/** What the extension advertises: raw-message transfers and every signData type, nothing it does not implement. */
export function tonConnectFeatures(): TonConnectFeature[] {
  return [
    'SendTransaction',
    { name: 'SendTransaction', maxMessages: TON_CONNECT_MAX_MESSAGES },
    { name: 'SignData', types: [...TON_CONNECT_SIGN_DATA_TYPES] },
  ];
}

/** The operating system a browser reports, in the `DeviceInfo.platform` words a desktop browser can claim. */
export function tonConnectPlatform(userAgent: string): TonConnectPlatform {
  if (/Mac OS X|Macintosh/i.test(userAgent)) return 'mac';
  if (/Windows/i.test(userAgent)) return 'windows';
  if (/Linux|CrOS|X11/i.test(userAgent) && !/Android/i.test(userAgent)) return 'linux';

  return 'browser';
}

export function tonConnectDeviceInfo(appVersion: string, platform: TonConnectPlatform): TonConnectDeviceInfo {
  return {
    platform,
    appName: TON_CONNECT_APP_NAME,
    appVersion,
    maxProtocolVersion: TON_CONNECT_PROTOCOL_VERSION,
    features: tonConnectFeatures(),
  };
}

