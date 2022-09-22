export type RelayChainName = 'polkadot' | 'kusama';

interface BaseInfo {
  teleport: number[];
}

interface ParachainsInfo extends BaseInfo {
  paraId: number;
}

interface Info extends BaseInfo {
  parachains: Record<string, ParachainsInfo>;
}

interface ParachainsInfo {
  paraId: number;
}

interface Info {
  parachains: Record<string, ParachainsInfo>;
}

type TeleportInfo = Record<RelayChainName, Info>;

export { TeleportInfo };
