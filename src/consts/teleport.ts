export type MainNetworkName = 'kusama' | 'polkadot' | 'westend' | 'rococo';

interface BaseInfo {
  teleport: number[];
}

interface ParachainsInfo extends BaseInfo {
  paraId: number;
}

interface Info extends BaseInfo {
  parachains: Record<string, ParachainsInfo>;
}

type TeleportInfo = Record<MainNetworkName, Info>;

const teleportInfo: TeleportInfo = {
  kusama: {
    teleport: [1000, 1001],
    parachains: {
      statemine: {
        paraId: 1000,
        teleport: [-1],
      },
      encointer: {
        paraId: 1001,
        teleport: [-1],
      },
    },
  },
  polkadot: {
    teleport: [1000],
    parachains: {
      statemint: {
        paraId: 1000,
        teleport: [-1],
      },
    },
  },
  westend: {
    teleport: [1000],
    parachains: {
      westmint: {
        paraId: 1000,
        teleport: [-1],
      },
    },
  },
  rococo: {
    teleport: [1000, 1002],
    parachains: {
      rococoStatemint: {
        paraId: 1000,
        teleport: [-1],
      },
      rococoContracts: {
        paraId: 1002,
        teleport: [-1],
      },
    },
  },
};

const XCM_LOC = ['xcm', 'xcmPallet', 'polkadotXcm'];

export { teleportInfo, XCM_LOC };
