import { BN, isFunction } from '@polkadot/util';
import { FPNumber } from '@sora-substrate/util';
import { decodeAddress } from '@polkadot/util-crypto';
import {
  isEthereumNetwork,
  getUtilityProps,
  getNativeAssetName,
  getSubstrateAddress,
} from '@extension-base/background/utils/utils';
import { SignerType } from '@extension-base/background/types/types';
import { getAssetInfo } from '@extension-base/api/helpers';
import State from '@extension-base/background/handlers/State';
import { signAndSendExtrinsic } from './shared/signAndSendExtrinsic';
import type { TokenBalance, BasicTxResponse } from '@extension-base/background/types/types';
import type { SubmittableExtrinsic } from '@polkadot/api/types';
import type { AssetId, Interiors } from '@/interfaces';
import {
  NATIVE_NETWORKS,
  RELAY_CHAINS,
  CHAIN_IDS,
  NETWORKS_ALIASES,
  VALID_ETHEREUM_ADDRESS,
  VALID_SUBSTRATE_ADDRESS,
} from '@/consts/networks';
import { NetworkName, RelayChainName } from '@/interfaces';
import { firstCharToUp } from '@/helpers';

type Extrinsic = Nullable<SubmittableExtrinsic<'promise'>>;

enum XcmVersions {
  V1 = 'V1',
  V3 = 'V3',
}

const XCM_NATIVE_PALLETS = ['xcmPallet', 'polkadotXcm'];

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

function interiorHelper(interiors: Interiors) {
  const array = interiors.reduce((result, interior) => {
    const formattedInterior = Object.fromEntries(
      Object.entries(interior).map(([key, value]) => {
        const newKey = key.startsWith('generalKey') ? 'generalKey' : key;

        return [firstCharToUp(newKey, false), value];
      })
    );

    return [...result, formattedInterior];
  }, []);

  return array.length === 1 ? (array[0] as Record<string, string>) : (array as Record<string, string>[]);
}

function getConcreteAsset(
  originNet: NetworkName,
  isToRelayChain: boolean,
  xcmAssetId: AssetId,
  isNative: boolean,
  state: State
) {
  const { parentId } = state.networkMap[originNet];

  // This Polkadot or Kusama
  if (parentId === undefined)
    return {
      interior: { Here: '' },
      parents: isToRelayChain ? 1 : 0, // Это isNative телепорт, потому что он из RelayChain -> соответственно parents формируется как для isNative
    };

  const { assets: xcmLocationsAssets } = state.xcmLocations.find(({ chainId }) => chainId === parentId)!;
  const { interiors } = xcmLocationsAssets.find(({ id }) => id === xcmAssetId)!;
  const interiorValue = interiorHelper(interiors);
  const interiorXcmLength = Array.isArray(interiorValue) ? interiorValue.length : 1;

  const interior =
    interiorXcmLength === 0
      ? { Here: '' }
      : {
          [`X${interiorXcmLength}`]: interiorValue,
        };

  const haveParachainParameter = Array.isArray(interiorValue)
    ? interiorValue?.some((interior) => Object.keys(interior).some((key) => key === 'Parachain'))
    : interiorValue.Parachain !== undefined;

  const parents1 = isToRelayChain ? 1 : 0;
  const parents2 = interiorXcmLength === 0 || haveParachainParameter ? 1 : 0;

  return {
    interior: interior,
    parents: isNative ? parents1 : parents2,
  };
}

function getNativeTeleportParams(
  originNet: NetworkName,
  destNet: NetworkName,
  toAddress: string,
  amount: string,
  xcmAssetId: AssetId,
  state: State
) {
  const isFromRelayChain = isRelayChain(originNet);
  const isToRelayChain = isRelayChain(destNet);
  const { xcm, parentId, name } = state.networkMap[originNet];
  const paraId = state.networkMap[destNet]?.paraId ?? 0;
  const xcmVersion = xcm!.xcmVersion.toUpperCase();
  const publicKey = decodeAddress(toAddress);
  const value = new BN(amount);

  const relayChain = CHAIN_IDS[parentId!] ?? firstCharToUp(name);
  const network = xcmVersion === XcmVersions.V1 ? { network: { Any: '' } } : { network: { [relayChain]: '' } };

  const receiverLocation = isEthereumNetwork(destNet)
    ? {
        AccountKey20: {
          ...network,
          key: publicKey, // TODO проверить декодирование eth адреса, корректно ли работает decodeAddress функция
        },
      }
    : {
        AccountId32: {
          ...network,
          id: publicKey,
        },
      };

  const destinationChain = {
    [xcmVersion]: {
      interior: isToRelayChain ? { Here: '' } : { X1: { Parachain: paraId } },
      parents: isFromRelayChain ? 0 : 1,
    },
  };

  const receiver = {
    [xcmVersion]: {
      parents: 0,
      interior: { X1: receiverLocation },
    },
  };

  const asset = {
    [xcmVersion]: [
      {
        fun: { Fungible: value },
        id: { Concrete: getConcreteAsset(originNet, isToRelayChain, xcmAssetId, true, state) },
      },
    ],
  };

  const limit = { Unlimited: null }; // TODO возможно в будущем нужно будет доделать

  return [destinationChain, receiver, asset, 0, limit];
}

function getOrmlTeleportParams(
  originNet: string,
  destNet: string,
  toAddress: string,
  amount: string,
  xcmAssetId: AssetId,
  state: State
) {
  const isToRelayChain = isRelayChain(destNet);
  const { xcm, parentId, name } = state.networkMap[originNet];
  const paraId = state.networkMap[destNet]?.paraId ?? 0;
  const xcmVersion = xcm!.xcmVersion.toUpperCase();
  const publicKey = decodeAddress(toAddress);
  const value = new BN(amount);

  const relayChain = CHAIN_IDS[parentId!] ?? firstCharToUp(name);

  const network = xcmVersion === XcmVersions.V1 ? { network: { Any: '' } } : { network: { [relayChain]: '' } };

  const receiverLocation = isEthereumNetwork(destNet)
    ? {
        AccountKey20: {
          ...network,
          key: publicKey, // TODO проверить декодирование eth адреса, корректно ли работает decodeAddress функция
        },
      }
    : {
        AccountId32: {
          ...network,
          id: publicKey,
        },
      };

  const asset = {
    [xcmVersion]: {
      fun: { Fungible: value },
      id: { Concrete: getConcreteAsset(originNet, isToRelayChain, xcmAssetId, false, state) },
    },
  };

  const interiorDestinationChain = isToRelayChain
    ? { X1: receiverLocation }
    : { X2: [{ Parachain: +paraId! }, receiverLocation] };

  const destinationChain = {
    [xcmVersion]: {
      parents: 1,
      interior: interiorDestinationChain,
    },
  };

  const limit = { Unlimited: null };

  return [asset, destinationChain, limit];
}

async function createNativeTeleportExtrinsic(
  xcmAssetId: AssetId,
  originNet: NetworkName,
  destNet: NetworkName,
  toAddress: string,
  amount: string,
  tokenBalance: TokenBalance,
  state: State
): Promise<Extrinsic> {
  const api = state.getSubstrateApiMap[originNet]?.api;

  if (!api) return;

  await api.isReadyOrError;

  const { precision } = tokenBalance.balances.find(({ name }) => name.toLowerCase() === originNet.toLowerCase())!;

  const precisionAmount = getPrecisionValue(amount, precision);
  const module = isNativeNetwork(destNet) ? 'limitedTeleportAssets' : 'limitedReserveTransferAssets';
  const pallet = XCM_NATIVE_PALLETS.find((pallet) => api!.tx[pallet] && isFunction(api!.tx[pallet][module]))!;
  const tx = api!.tx[pallet][module];
  const params = getNativeTeleportParams(originNet, destNet, toAddress, precisionAmount, xcmAssetId, state);

  return tx(...params);
}

async function createOrmlTeleportExtrinsic(
  xcmAssetId: AssetId,
  originNet: NetworkName,
  destNet: NetworkName,
  toAddress: string,
  amount: string,
  tokenBalance: TokenBalance,
  state: State
): Promise<Extrinsic> {
  const api = state.getSubstrateApiMap[originNet].api;

  if (!api) return;

  await api.isReadyOrError;

  const { precision } = tokenBalance.balances.find(({ name }) => name.toLowerCase() === originNet.toLowerCase())!;

  const precisionAmount = getPrecisionValue(amount, precision);

  // В большинстве случаев используется xTokens, но он есть не всегда
  if (api.tx?.xTokens?.transferMultiasset) {
    const params = getOrmlTeleportParams(originNet, destNet, toAddress, precisionAmount, xcmAssetId, state);

    return api.tx?.xTokens?.transferMultiasset(...params);
  }

  const module = isRelayChain(destNet) ? 'limitedReserveWithdrawAssets' : 'limitedReserveTransferAssets';
  const params = getNativeTeleportParams(originNet, destNet, toAddress, precisionAmount, xcmAssetId, state);

  // Если нет xTokens используется polkadotXcm, с соответствующим модулем
  return api.tx?.polkadotXcm[module](...params);
}

async function estimateCrossChainFee(
  originNet: NetworkName,
  destinationNet: NetworkName,
  tokenBalance: TokenBalance,
  state: State,
  extrinsic?: Extrinsic
): Promise<[FPNumber, FPNumber]> {
  // Рассчет cross chain fee
  const destFees = state.xcmFees.find(({ destChain }) => {
    const destChainLower = destChain.toLowerCase();
    const destinationNetLower = destinationNet.toLowerCase();

    return (
      (NETWORKS_ALIASES[destChainLower] ?? destChainLower) ===
      (NETWORKS_ALIASES[destinationNetLower] ?? destinationNetLower)
    );
  });

  const asset = getNativeAssetName(tokenBalance.symbol);

  const destEstimateFee = destFees?.destXcmFee?.find(({ symbol: _symbol }) => _symbol.toLowerCase() === asset);

  const { precision: originPrecision } = tokenBalance.balances.find(
    ({ name }) => name.toLowerCase() === originNet.toLowerCase()
  )!;

  const crossChainFee = FPNumber.fromCodecValue(
    destEstimateFee?.feeInPlanks ?? '0',
    +(destEstimateFee?.precision ?? originPrecision)
  );

  // Далее рассчет origin fee
  if (!extrinsic) return [FPNumber.ZERO, crossChainFee];

  const { precision: utilityPrecision } = getUtilityProps(originNet, state)!;

  try {
    const address = isEthereumNetwork(originNet) ? VALID_ETHEREUM_ADDRESS : VALID_SUBSTRATE_ADDRESS;
    const paymentInfo = await extrinsic?.paymentInfo(address);
    const partialFee = paymentInfo ? +paymentInfo.partialFee : 0;

    const originFee = FPNumber.fromCodecValue(partialFee, utilityPrecision);

    return [originFee, crossChainFee];
  } catch {
    return [FPNumber.ZERO, crossChainFee];
  }
}

async function createCrossChainExtrinsic(
  assetId: string,
  originNet: NetworkName,
  destNet: NetworkName,
  toAddress: string,
  amount: string,
  tokenBalance: TokenBalance,
  state: State
): Promise<Extrinsic> {
  const { symbol } = getAssetInfo(assetId, state);
  const { xcm } = state.networkMap[originNet];

  // Структура assets в availableDestinations всегда одинаковая
  // id у конкретного токена(например DOT), для всех сетей внутри availableDestinations одинаковый
  // Поэтому просто берем первый попавшийся элемент из массива availableDestinations, берем его assets и ищем нужный токен внутри assets
  const { chainId: destChainId } = state.networkMap[destNet];
  const { assets } = xcm!.availableDestinations.find(({ chainId }) => chainId === destChainId)!;
  const { id: xcmAssetId } = assets.find(({ symbol: _symbol }) => _symbol.toLowerCase() === symbol.toLowerCase())!;

  if (isNativeNetwork(originNet)) {
    // Case RelayChain -> Nonnative ParaChain (polkadot -> acala, etc; kusama -> bifrost, etc) pallet = xcmPallet, module = limitedReserveTransferAssets
    // Case RelayChain -> Native ParaChain (polkadot -> statemint; kusama -> statemine, encointer) pallet = xcmPallet, module = limitedTeleportAssets
    // Case Native ParaChain -> RelayChain (statemint -> polkadot; statemine, encointer -> kusama) pallet = polkadotXcm, module = limitedTeleportAssets
    // TODO: add case: Native ParaChain -> Nonnative ParaChain
    // TODO: add case: Native ParaChain -> Native ParaChain
    return createNativeTeleportExtrinsic(xcmAssetId, originNet, destNet, toAddress, amount, tokenBalance, state);
  } else {
    // Case Nonnative ParaChain -> Nonnative ParaChain (karura, etc -> bifrost, etc)
    // Case Nonnative ParaChain -> RelayChain (karura, etc -> kusama, etc; acala, etc -> polkadot)
    return createOrmlTeleportExtrinsic(xcmAssetId, originNet, destNet, toAddress, amount, tokenBalance, state);
  }
}

export interface MakeCrossChainProps {
  assetId: string;
  originNet: NetworkName;
  destinationNet: NetworkName;
  to: string;
  from: string;
  amount: string;
  password: string;
  isSavePass?: boolean;
  callback: (data: BasicTxResponse) => void;
  relayChain?: RelayChainName;
}

async function makeCrossChain(
  { assetId, originNet, destinationNet, from, to, isSavePass, password, amount, callback }: MakeCrossChainProps,
  state: State
): Promise<void> {
  const txState: BasicTxResponse = {};
  const apiProps = state.getSubstrateApiMap[originNet];

  await apiProps.api?.isReady;

  const address = getSubstrateAddress(from, state);
  const tokenBalance = state.balanceMap[address].find(
    ({ assetId: _assetId, balances }) => _assetId === assetId || balances.some((el) => el.id === assetId)
  )!;
  const [, crossChainFee] = await estimateCrossChainFee(originNet, destinationNet, tokenBalance, state);

  const amountWithCrossChain = new FPNumber(amount).add(crossChainFee).toString();

  const extrinsic = await createCrossChainExtrinsic(
    assetId,
    originNet,
    destinationNet,
    to,
    amountWithCrossChain!,
    tokenBalance,
    state
  );

  await signAndSendExtrinsic(
    {
      type: SignerType.PASSWORD,
      apiProps,
      callback,
      extrinsic,
      txState,
      password,
      isSavePass,
      address: from,
      errorMessage: 'CrossChain error',
    },
    state
  );
}

export { estimateCrossChainFee, makeCrossChain, createCrossChainExtrinsic };

export type { Extrinsic };
