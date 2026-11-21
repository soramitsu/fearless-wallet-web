import { type Injected } from '@polkadot/extension-inject/types';
import { type FWEvmProvider, type FWIrohaProvider, type FWSolanaProvider } from '@extension-base/page/types';
import { type FearlessTonConnectBridge } from '@extension-base/page/FearlessWalletTonConnect';
type This = typeof globalThis;

export interface InjectedWindowProvider {
  enable: (origin: string) => Promise<Injected>;
  isPlaceholder?: boolean;
  version: string;
}

export interface InjectedWindow extends This {
  injectedWeb3: Record<string, InjectedWindowProvider>;
  ethereum: FWEvmProvider;
  fearlessIroha: FWIrohaProvider;
  fearlessWallet: FWEvmProvider;
  fearlessSolana: FWSolanaProvider;
  solana?: FWSolanaProvider;
  /** TON Connect JS bridge key; `tonconnect` is the bridge. */
  Fearless?: { tonconnect?: FearlessTonConnectBridge; [key: string]: unknown };
}

export interface EIP6963ProviderInfo {
  uuid: string;
  name: string;
  icon: string;
  rdns: string;
}

export interface EIP6963ProviderDetail {
  info: EIP6963ProviderInfo;
  provider: FWEvmProvider;
}
