import { BN, isFunction } from '@polkadot/util';
import { FPNumber } from '@sora-substrate/util';
import { decodeAddress } from '@polkadot/util-crypto';
import { state } from '../../background/handlers';
import { TokenBalance, BasicTxResponse, SignerType } from '../../background/types/types';
import { getTokenInfo } from '../substrate/registry';
import { isEthereumNetwork } from '../../background/utils/utils';
import { signAndSendExtrinsic } from './shared/signAndSendExtrinsic';
import type { SubmittableExtrinsic } from '@polkadot/api/types';
import type { AssetJson, Interior } from '@/interfaces';
import { NATIVE_NETWORKS, RELAY_CHAINS, CHAIN_IDS } from '@/consts/networks';
import { AssetName, NetworkName } from '@/interfaces';
import { firstCharToUp } from '@/helpers/common';

type Extrinsic = Nullable<SubmittableExtrinsic<'promise'>>;

const XCM_NATIVE_PALLETS = ['xcmPallet', 'polkadotXcm'];
const FOUR_INSTRUCTIONS_PARACHAIN_WEIGHT = 5000000000;

function interiorHelper(interiors: Interior) {
  return Object.entries(interiors).map(([key, value]) => {
    const newKey = key.startsWith('generalKey') ? 'generalKey' : key;

    return {
      [firstCharToUp(newKey)]: value,
    };
  });
}

function isNativeNetwork(networkName: NetworkName) {
  return NATIVE_NETWORKS.includes(networkName.toLowerCase());
}

function getPrecisionValue(_amount: string, precision: number): string {
  const amount = _amount === '' ? '0' : _amount;
  const amountFP = new FPNumber(amount, precision);

  return amountFP.toCodecString();
}

function isRelayChain(network: string) {
  return RELAY_CHAINS.includes(network.toLowerCase());
}

function getNativeTeleportParams(originNet: NetworkName, destNet: NetworkName, toAddress: string, amount: string) {
  const isToRelayChain = isRelayChain(destNet);
  const { xcm, parentId, name } = state.networkMap[originNet];
  const { paraId: _paraId } = state.networkMap[destNet];
  const paraId = +(_paraId ?? -1); // -1 for isToRelayChain
  const xcmVersion = xcm!.xcmVersion.toUpperCase();
  const publicKey = decodeAddress(toAddress);
  const value = new BN(amount);

  const relayChain = CHAIN_IDS[parentId!] ?? firstCharToUp(name);

  const receiverLocation = {
    AccountId32: {
      network: {
        [relayChain]: '',
      },
      id: publicKey,
    },
  };

  const destinationChain = {
    [xcmVersion]: isToRelayChain
      ? {
          interior: {
            Here: '',
          },
          parents: 1,
        }
      : {
          interior: {
            X1: {
              Parachain: paraId,
            },
          },
          parents: 0,
        },
  };

  const receiver = {
    [xcmVersion]: {
      parents: 0,
      interior: {
        X1: receiverLocation,
      },
    },
  };

  const asset = {
    [xcmVersion]: [
      {
        fun: {
          Fungible: value,
        },
        id: {
          Concrete: {
            interior: {
              Here: '',
            },
            parents: isToRelayChain ? 1 : 0,
          },
        },
      },
    ],
  };

  const limit = { Unlimited: null }; // TODO возможно в будущем нужно будет доделать

  return [destinationChain, receiver, asset, 0, limit];
}

function getOrmlTeleportParams(originNet: string, destNet: string, toAddress: string, amount: string, tokenId: string) {
  const isToRelayChain = isRelayChain(destNet);
  const { xcm, parentId, name } = state.networkMap[originNet];
  const { paraId: _paraId } = state.networkMap[destNet];
  const paraId = +_paraId!;
  const xcmVersion = xcm!.xcmVersion.toUpperCase();
  const publicKey = decodeAddress(toAddress);
  const value = new BN(amount);

  const { assets: xcmLocationsAssets } = state.xcmLocations.find(({ chainId }) => chainId === parentId)!;
  const tokenInfo = getTokenInfo(tokenId);
  const { interiors } = xcmLocationsAssets.find(
    ({ symbol }) => symbol.toLowerCase() === tokenInfo.symbol.toLowerCase()
  )!;
  const interiorsByXcmVersion = interiors[xcm!.xcmVersion]!;
  const interiorXcmLength = interiorsByXcmVersion.length;

  const relayChain = CHAIN_IDS[parentId!] ?? firstCharToUp(name);

  const receiverLocation = isEthereumNetwork(destNet)
    ? {
        AccountKey20: {
          [relayChain]: '',
          key: publicKey, // TODO проверить декодирование eth адреса, корректно ли работает decodeAddress функция
        },
      }
    : {
        AccountId32: {
          [relayChain]: '',
          id: publicKey,
        },
      };

  const interiorAsset =
    interiorXcmLength === 0
      ? { Here: '' }
      : interiorXcmLength === 1
      ? interiorHelper(interiorsByXcmVersion)[0]
      : {
          [`X${interiorXcmLength}`]: interiorHelper(interiorsByXcmVersion),
        };

  const asset = {
    [xcmVersion]: {
      fun: {
        Fungible: value,
      },
      id: {
        Concrete: {
          interior: interiorAsset,
          parents: isToRelayChain ? 1 : 0,
        },
      },
    },
  };

  const interiorDestinationChain = isRelayChain(destNet)
    ? {
        X1: receiverLocation,
      }
    : {
        X2: [
          {
            Parachain: paraId,
          },
          receiverLocation,
        ],
      };

  const destinationChain = {
    [xcmVersion]: {
      parents: 1,
      interior: interiorDestinationChain,
    },
  };

  console.log('interiorDestinationChain', interiorDestinationChain);

  const limit = { Unlimited: null };

  return [asset, destinationChain, limit];
}

async function createNativeTeleportExtrinsic(
  originNet: NetworkName,
  destNet: NetworkName,
  toAddress: string,
  amount: string,
  tokenBalance: TokenBalance
): Promise<Extrinsic> {
  const api = state.getSubstrateApiMap[originNet]?.api;

  if (!api) return;

  await api.isReadyOrError;

  const precisionAmount = getPrecisionValue(amount, tokenBalance?.precision);
  const module = isNativeNetwork(destNet) ? 'limitedTeleportAssets' : 'limitedReserveTransferAssets';
  const pallet = XCM_NATIVE_PALLETS.find((pallet) => api!.tx[pallet] && isFunction(api!.tx[pallet][module]))!;
  const tx = api!.tx[pallet][module];
  const params = getNativeTeleportParams(originNet, destNet, toAddress, precisionAmount);

  return tx(...params);
}

async function createOrmlTeleportExtrinsic(
  tokenId: string,
  originNet: NetworkName,
  destNet: NetworkName,
  toAddress: string,
  amount: string,
  tokenBalance: TokenBalance
): Promise<Extrinsic> {
  const api = state.getSubstrateApiMap[originNet].api;

  if (!api) return;

  await api.isReadyOrError;

  const precisionAmount = getPrecisionValue(amount, tokenBalance?.precision);

  // В большинстве случаев используется xTokens, но он есть не всегда
  if (api!.tx?.xTokens?.transferMultiasset) {
    const params = getOrmlTeleportParams(originNet, destNet, toAddress, precisionAmount, tokenId);

    return api!.tx?.xTokens?.transferMultiasset(...params);
  }

  const module = isRelayChain(destNet) ? 'limitedReserveWithdrawAssets' : 'limitedReserveTransferAssets';
  const params = getNativeTeleportParams(originNet, destNet, toAddress, precisionAmount);

  // Если нет xTokens используется polkadotXcm, с соответствующим модулем
  return api!.tx?.polkadotXcm[module](...params);
}

async function estimateFee(extrinsic: Extrinsic, to: string, tokenBalance: TokenBalance): Promise<string> {
  if (!extrinsic) return '0';

  try {
    const paymentInfo = await extrinsic?.paymentInfo(to);
    const partialFee = paymentInfo ? +paymentInfo.partialFee : 0;
    const result = new FPNumber(partialFee, tokenBalance?.precision);

    return result.toString();
  } catch {
    return '0';
  }
}

async function createCrossChainExtrinsic(
  tokenId: string,
  originNet: NetworkName,
  destNet: NetworkName,
  toAddress: string,
  amount: string,
  tokenBalance: TokenBalance
): Promise<Extrinsic> {
  if (isNativeNetwork(originNet)) {
    // Case RelayChain -> Nonnative ParaChain (polkadot -> acala, etc; kusama -> bifrost, etc) paraId = 2000-2999, pallet = xcmPallet, module = limitedReserveTransferAssets
    // Case RelayChain -> Native ParaChain (polkadot -> statemint; kusama -> statemine, encointer) paraId = 1000-1999, pallet = xcmPallet, module = limitedTeleportAssets
    // Case Native ParaChain -> RelayChain (statemint -> polkadot; statemine, encointer -> kusama) paraId = -1, pallet = polkadotXcm, module = limitedTeleportAssets
    // TODO: add case: Native ParaChain -> Nonnative ParaChain
    // TODO: add case: Native ParaChain -> Native ParaChain
    return await createNativeTeleportExtrinsic(originNet, destNet, toAddress, amount!, tokenBalance);
  } else {
    // Case Nonnative ParaChain -> Nonnative ParaChain (karura, etc -> bifrost, etc) paraId = 2000-2999
    //Case Nonnative ParaChain -> RelayChain (karura, etc -> kusama, etc; acala, etc  -> polkadot)
    return await createOrmlTeleportExtrinsic(tokenId, originNet, destNet, toAddress, amount!, tokenBalance);
  }
}

export interface MakeCrossChainProps {
  asset: AssetName;
  originNet: NetworkName;
  destinationNet: NetworkName;
  to: string;
  from: string;
  amount: string;
  password: string | undefined;
  tokenInfo: AssetJson;
  isSavePass?: boolean;
  callback: (data: BasicTxResponse) => void;
}

async function makeCrossChain({
  asset,
  originNet,
  destinationNet,
  from,
  to,
  tokenInfo,
  isSavePass,
  password,
  amount,
  callback,
}: MakeCrossChainProps): Promise<void> {
  const txState: BasicTxResponse = {};
  const apiProps = state.getSubstrateApiMap[originNet];

  await apiProps.api?.isReady;

  const tokenBalance = state.balanceMap[from].find(({ assetId, relayChain }) => {
    if (tokenInfo.relayChain) return assetId === tokenInfo.id && relayChain === tokenInfo.relayChain;
    else return assetId === tokenInfo.id;
  })!;

  const extrinsic = await createCrossChainExtrinsic(asset, originNet, destinationNet, to, amount!, tokenBalance);

  await signAndSendExtrinsic({
    type: SignerType.PASSWORD,
    apiProps,
    callback,
    extrinsic,
    txState,
    password,
    isSavePass,
    address: from,
    errorMessage: 'error Cross Chain',
  });
}

export { estimateFee, makeCrossChain, createCrossChainExtrinsic };

export type { Extrinsic };
