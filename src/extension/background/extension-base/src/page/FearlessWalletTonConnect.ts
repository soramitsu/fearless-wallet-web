import { eip6963ProviderInfo } from '@extension-base/const';
import { sendMessage } from '.';
import type { TonConnectEvent, TonConnectWalletResponse } from '@extension-base/services/ton-connect-service';
import { APP_VERSION } from '@/consts/global';
import {
  TON_CONNECT_APP_NAME,
  TON_CONNECT_PROTOCOL_VERSION,
  tonConnectDeviceInfo,
  tonConnectPlatform,
  type TonConnectDeviceInfo,
} from '@/util/tonConnect/device';

type WalletEventListener = (event: TonConnectEvent) => void;

export type FearlessTonConnectBridge = {
  readonly deviceInfo: TonConnectDeviceInfo;
  readonly walletInfo: {
    name: string;
    app_name: string;
    image: string;
    about_url: string;
    platforms: string[];
    features: TonConnectDeviceInfo['features'];
  };
  readonly protocolVersion: number;
  readonly isWalletBrowser: boolean;
  connect(protocolVersion: number, message: unknown): Promise<TonConnectEvent>;
  restoreConnection(): Promise<TonConnectEvent>;
  send(message: unknown): Promise<TonConnectWalletResponse>;
  listen(callback: WalletEventListener): () => void;
  disconnect(): void;
};

/** Plain JSON: what the page passes is copied before it is posted, so a getter or proxy cannot change it later. */
const plain = (value: unknown): unknown => JSON.parse(JSON.stringify(value ?? null));

/**
 * The TON Connect JS bridge at `window.Fearless.tonconnect` (spec/bridge.md). It sends nothing until the page uses
 * it, so a page that never asks does not wake the wallet. `walletInfo` lets the TON Connect SDK list the extension
 * although it is not in the public wallets list.
 */
export function createTonConnectBridge(): FearlessTonConnectBridge {
  const listeners = new Set<WalletEventListener>();
  const userAgent = typeof navigator === 'undefined' ? '' : navigator.userAgent;
  const deviceInfo = tonConnectDeviceInfo(APP_VERSION, tonConnectPlatform(userAgent));
  let connected = false;
  let subscribed = false;

  const deliver = (event: TonConnectEvent) => {
    if (event.event === 'disconnect') connected = false;
    listeners.forEach((listener) => {
      try {
        listener(event);
      } catch (error) {
        console.error('[Fearless TON Connect] A listener failed', error);
      }
    });
  };

  const startEvents = () => {
    if (subscribed) return;
    subscribed = true;
    sendMessage('ton(events.subscribe)', { connected }, deliver).catch(() => {
      subscribed = false;
    });
  };

  const track = (event: TonConnectEvent): TonConnectEvent => {
    if (event.event === 'connect') connected = true;
    else if (event.event === 'connect_error') connected = false;

    return event;
  };

  return Object.freeze({
    deviceInfo: Object.freeze(deviceInfo),
    walletInfo: Object.freeze({
      name: eip6963ProviderInfo.name,
      app_name: TON_CONNECT_APP_NAME,
      image: eip6963ProviderInfo.icon,
      about_url: 'https://fearlesswallet.io',
      platforms: [/Firefox\//.test(userAgent) ? 'firefox' : 'chrome'],
      features: deviceInfo.features,
    }),
    protocolVersion: TON_CONNECT_PROTOCOL_VERSION,
    isWalletBrowser: false,
    connect: async (protocolVersion: number, message: unknown) =>
      track(await sendMessage('ton(connect)', { protocolVersion, request: plain(message) })),
    restoreConnection: async () => track(await sendMessage('ton(restoreConnection)')),
    send: (message: unknown) => sendMessage('ton(send)', plain(message)),
    listen: (callback: WalletEventListener) => {
      if (typeof callback !== 'function') throw new TypeError('listen needs a function');
      listeners.add(callback);
      startEvents();

      return () => {
        listeners.delete(callback);
      };
    },
    disconnect: () => {
      connected = false;
      sendMessage('ton(disconnect)').catch(() => undefined);
    },
  });
}
