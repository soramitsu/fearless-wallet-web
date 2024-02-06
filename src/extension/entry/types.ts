import { type Injected } from '@polkadot/extension-inject/types';
import { type EvmProvider } from '@extension-base/page/types';
type This = typeof globalThis;

export interface InjectedWindowProvider {
  enable: (origin: string) => Promise<Injected>;
  version: string;
}

export interface InjectedWindow extends This {
  injectedWeb3: Record<string, InjectedWindowProvider>;
  ethereum: EvmProvider;
  FW: EvmProvider;
}

export interface EIP6963ProviderInfo {
  uuid: string;
  name: string;
  icon: string;
  rdns: string;
}

export interface EIP6963ProviderDetail {
  info: EIP6963ProviderInfo;
  provider: EvmProvider;
}
