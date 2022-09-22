import { BN } from '@polkadot/util';
import type { TeleportInfo, RelayChainName } from '@/interfaces/teleport';
import BaseApi from '@/util/BaseApi';
import { RELAY_CHAINS } from '@/consts/networks';

const FOUR_INSTRUCTIONS_PARACHAIN_WEIGHT = 5000000000;

const XCM_LOC = ['xcm', 'xcmPallet', 'polkadotXcm'];

const SUPPORTED_CROSS_CHAIN: TeleportInfo = {
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
};

function getParaId(originalNetworkName: string, destinationNetworkName: string) {
  const paraId =
    SUPPORTED_CROSS_CHAIN[originalNetworkName as RelayChainName]?.parachains[destinationNetworkName]?.paraId;

  if (paraId) return paraId;

  const isTeleportToMainNetwork =
    SUPPORTED_CROSS_CHAIN[destinationNetworkName as RelayChainName]?.parachains[originalNetworkName];

  return isTeleportToMainNetwork ? -1 : undefined;
}

function getNativeTeleportParams(isToRelayChainTeleport: boolean, chainId: number, toAddress: string, amount: string) {
  const publicKey = BaseApi.decodeAddress(toAddress);
  const receiverLocation = { AccountId32: { network: 'Any', id: publicKey } };
  const value = new BN(amount);

  const destinationChain = {
    V1: isToRelayChainTeleport
      ? { interior: 'Here', parents: 1 }
      : { interior: { X1: { ParaChain: chainId } }, parents: 0 },
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

  return [destinationChain, receiver, asset, 0, { Unlimited: null }];
}

function getParachainTeleportParams(originNet: string, destNet: string, chainId: number, toAddress: string) {
  const ss58Address =
    destNet === 'astar' || destNet === 'shiden' ? BaseApi.evmToAddress(toAddress, destNet) : toAddress;
  const publicKey = BaseApi.decodeAddress(ss58Address);
  const receiverLocation = { AccountId32: { network: 'Any', id: publicKey } };

  //  parachain -> parachain
  if (RELAY_CHAINS.includes(originNet)) {
    const interior = {
      X2: [{ Parachain: chainId }, { AccountId32: { network: 'Any', id: publicKey } }],
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
  XCM_LOC,
  FOUR_INSTRUCTIONS_PARACHAIN_WEIGHT,
  getNativeTeleportParams,
  getParachainTeleportParams,
  getParaId,
};
