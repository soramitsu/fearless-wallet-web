import { BN } from '@polkadot/util';
import { RELAY_CHAINS, NATIVE_NETWORKS } from '@/consts/networks';
import NetworksController from '@/controllers/networksController';
import BaseApi from '@/util/BaseApi';

const XCM_NATIVE_PALLETS = ['xcm', 'xcmPallet', 'polkadotXcm'];
const FOUR_INSTRUCTIONS_PARACHAIN_WEIGHT = 5000000000;

function isNativeNetwork(originNet: string, destNet?: string) {
  const IsNativeOriginNet = NATIVE_NETWORKS.includes(originNet);

  return destNet ? IsNativeOriginNet && NATIVE_NETWORKS.includes(destNet) : IsNativeOriginNet;
}

function isRelayChain(network: string) {
  return RELAY_CHAINS.includes(network);
}

function getOrmlOptions(symbol: string, originNet: string) {
  if (originNet === 'bit.country pioneer' && symbol === 'neer') return { NativeToken: 0 };

  return { Token: symbol.toUpperCase() };
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
  XCM_NATIVE_PALLETS,
  FOUR_INSTRUCTIONS_PARACHAIN_WEIGHT,
  getNativeTeleportParams,
  getOrmlTeleportParams,
  isNativeNetwork,
  getOrmlOptions,
};
