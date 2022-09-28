import { BN } from '@polkadot/util';
import type { SupportedCrossChain, RelayChainName } from '@/interfaces/teleport';
import BaseApi from '@/util/BaseApi';
import { RELAY_CHAINS, NATIVE_NETWORKS } from '@/consts/networks';
import NetworksController from '@/controllers/networksController';

const FOUR_INSTRUCTIONS_PARACHAIN_WEIGHT = 5000000000;

const XCM_NATIVE_PALLETS = ['xcm', 'xcmPallet', 'polkadotXcm'];

const SUPPORTED_CROSS_CHAIN: SupportedCrossChain = {
  polkadot: {
    polkadot: {
      paraId: -1,
      teleport: [1000, 2006, 2000],
      supportedToken: ['DOT'],
    },
    statemint: {
      paraId: 1000,
      teleport: [-1, 2006, 2000],
      supportedToken: ['DOT'],
    },
    astar: {
      paraId: 2006,
      teleport: [-1],
      supportedToken: ['DOT'],
    },
    acala: {
      paraId: 2000,
      teleport: [-1],
      supportedToken: ['DOT'],
    },
  },
  kusama: {
    kusama: {
      paraId: -1,
      teleport: [1000, 1001, 2000, 2001, 2007],
      supportedToken: ['KSM'],
    },
    statemine: {
      paraId: 1000,
      teleport: [-1, 1001, 2000, 2001, 2007],
      supportedToken: ['KSM'],
    },
    'encointer on kusama': {
      paraId: 1001,
      teleport: [-1, 1000, 2000, 2001, 2007],
      supportedToken: ['KSM'],
    },
    karura: {
      paraId: 2000,
      teleport: [-1, 1000, 1001, 2001, 2007],
      supportedToken: ['KSM'],
    },
    bifrost: {
      paraId: 2001,
      teleport: [-1, 1000, 1001, 2000, 2007],
      supportedToken: ['KSM'],
    },
    shiden: {
      paraId: 2007,
      teleport: [-1, 1000, 1001, 2000, 2001],
      supportedToken: ['KSM'],
    },
  },
};

function getParaId(relayChain: RelayChainName, originNet: string, destNet: string) {
  const originNetProps = SUPPORTED_CROSS_CHAIN[relayChain][originNet];
  const destNetProps = SUPPORTED_CROSS_CHAIN[relayChain]?.[destNet];

  if (originNetProps === undefined || destNetProps === undefined) return;

  const { teleport } = originNetProps;
  const { paraId } = destNetProps;

  if (teleport.includes(paraId)) return paraId;

  return;
}

function isNativeNetwork(originNet: string, destNet?: string) {
  const IsNativeOriginNet = NATIVE_NETWORKS.includes(originNet);

  return destNet ? IsNativeOriginNet && NATIVE_NETWORKS.includes(destNet) : IsNativeOriginNet;
}

function isRelayChain(network: string) {
  return RELAY_CHAINS.includes(network);
}

function getNativeTeleportParams(destNet: string, toAddress: string, amount: string) {
  const isToRelayChainTeleport = isRelayChain(destNet);
  const { paraId: _paraId } = NetworksController.getNetwork(destNet);
  const paraId = +(_paraId ?? isToRelayChainTeleport ? '-1' : '-2'); // '-2' fiction
  const publicKey = BaseApi.decodeAddress(toAddress);
  const receiverLocation = { AccountId32: { network: 'Any', id: publicKey } };
  const value = new BN(amount);

  const destinationChain = {
    V1: isToRelayChainTeleport
      ? { interior: 'Here', parents: 1 }
      : { interior: { X1: { ParaChain: paraId } }, parents: 0 },
  };

  const receiver = { V1: { parents: 0, interior: { X1: receiverLocation } } };

  const asset = {
    V1: [
      {
        fun: { Fungible: value },
        id: {
          Concrete: {
            interior: 'Here',
            parents: isToRelayChainTeleport ? 1 : 0,
          },
        },
      },
    ],
  };

  const params: any[] = [destinationChain, receiver, asset, 0];

  if (isNativeNetwork(destNet)) params.push({ Unlimited: null });

  return params;
}

function getOrmlTeleportParams(originNet: string, destNet: string, toAddress: string) {
  const { paraId: _paraId } = NetworksController.getNetwork(destNet);
  const paraId = +(_paraId as string);
  const publicKey = BaseApi.decodeAddress(toAddress);
  const receiverLocation = { AccountId32: { network: 'Any', id: publicKey } };

  //  parachain -> parachain & relaychain -> parachain
  if (!RELAY_CHAINS.includes(destNet)) {
    const interior = {
      X2: [{ Parachain: paraId }, receiverLocation],
    };

    return { V1: { parents: 1, interior } };
  }

  // parachain -> relaychain
  return {
    V1: {
      parents: 1,
      interior: {
        X1: receiverLocation,
      },
    },
  };
}

export {
  SUPPORTED_CROSS_CHAIN,
  XCM_NATIVE_PALLETS,
  FOUR_INSTRUCTIONS_PARACHAIN_WEIGHT,
  getNativeTeleportParams,
  getOrmlTeleportParams,
  getParaId,
  isNativeNetwork,
};
