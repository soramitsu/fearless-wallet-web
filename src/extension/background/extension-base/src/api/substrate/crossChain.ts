import { BN, isFunction } from '@polkadot/util';
import { FPNumber } from '@sora-substrate/util';
import { decodeAddress } from '@polkadot/util-crypto';
import { SignerType } from '@extension-base/background/types/types';
import { getAssetBalance, getAssetInfo } from '@extension-base/api/helpers';
import { estimateSoraCrossChainFee, makeSoraCrossChain, getSoraParaId } from '@extension-base/api/substrate/sora';
import { signAndSendExtrinsic } from '@extension-base/api/substrate/shared/signAndSendExtrinsic';
import { getPrecisionValue } from '@extension-base/api/substrate';
import { createLiberlandCrossChain } from './liberland';
import type { CrossChainProps, Extrinsic, MakeCrossChainProps } from '@extension-base/api/substrate/types';
import type State from '@extension-base/background/handlers/State';
import type { TokenGroup, BasicTxResponse } from '@extension-base/background/types/types';
import type { AssetId, Interiors, NetworkName } from '@/interfaces';
import {
  isEthereumNetwork,
  getUtilityProps,
  getNativeAssetName,
} from '@/extension/background/extension-base/src/background/handlers/utils';
import {
  NATIVE_NETWORKS,
  RELAY_CHAINS,
  CHAIN_IDS,
  NETWORKS_ALIASES,
  VALID_ETHEREUM_ADDRESS,
  VALID_SUBSTRATE_ADDRESS,
} from '@/consts/networks';
import { firstCharToUp, isLiberland, isSora } from '@/helpers';
import { IS_PRODUCTION } from '@/consts/global';

enum XcmVersions {
  V1 = 'V1',
  V3 = 'V3',
}

const XCM_NATIVE_PALLETS = ['xcmPallet', 'polkadotXcm'];

function isNativeNetwork(networkName: NetworkName) {
  return NATIVE_NETWORKS.includes(networkName.toLowerCase());
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
  state: State,
  destNet?: NetworkName
) {
  const networkKey = state.networkService.getNetworkByKey(originNet)?.name;
  const { parentId } = state.networkMap[networkKey];

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

  // Hack for ASTR to SORA Network
  const isASTRtoSORA = xcmAssetId === '5ab1e8d-81ed-4130-9d29-55b549cc6bab' && isSora(destNet, true);

  return {
    interior: interior,
    parents: isASTRtoSORA ? 0 : isNative ? parents1 : parents2,
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
  const originNetworkKey = state.networkService.getNetworkByKey(originNet)?.name;
  const destNetworkKey = state.networkService.getNetworkByKey(destNet)?.name;
  const isFromRelayChain = isRelayChain(originNet);
  const isToRelayChain = isRelayChain(destNet);
  const { xcm, parentId, name } = state.networkMap[originNetworkKey];
  const relayChain = CHAIN_IDS[parentId!] ?? firstCharToUp(name);

  const paraId = isSora(destNet, true)
    ? getSoraParaId(relayChain, state)
    : state.networkMap[destNetworkKey]?.paraId ?? '0';

  const xcmVersion = xcm!.xcmVersion.toUpperCase();
  const publicKey = decodeAddress(toAddress);
  const value = new BN(amount);

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
  const originNetworkKey = state.networkService.getNetworkByKey(originNet)?.name;
  const destNetworkKey = state.networkService.getNetworkByKey(destNet)?.name;
  const isToRelayChain = isRelayChain(destNet);
  const { xcm, parentId, name } = state.networkMap[originNetworkKey];
  const relayChain = CHAIN_IDS[parentId!] ?? firstCharToUp(name);

  const paraId = isSora(destNet, true)
    ? getSoraParaId(relayChain, state)
    : state.networkMap[destNetworkKey]?.paraId ?? 0;

  const xcmVersion = xcm!.xcmVersion.toUpperCase();
  const publicKey = decodeAddress(toAddress);
  const value = new BN(amount);

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
      id: { Concrete: getConcreteAsset(originNet, isToRelayChain, xcmAssetId, false, state, destNet) },
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

async function createNativeCrossChainExtrinsic(
  xcmAssetId: AssetId,
  originNet: NetworkName,
  destNet: NetworkName,
  toAddress: string,
  amount: string,
  tokenBalance: TokenGroup,
  state: State
): Promise<Extrinsic> {
  const api = state.getSubstrateApiMap[originNet.toLowerCase()]?.api;

  if (!api) return;

  await api.isReadyOrError;

  const { precision } = getAssetBalance(originNet, tokenBalance);

  const precisionAmount = getPrecisionValue(amount, precision);
  const module = isNativeNetwork(destNet) ? 'limitedTeleportAssets' : 'limitedReserveTransferAssets';
  const pallet = XCM_NATIVE_PALLETS.find((pallet) => api!.tx[pallet] && isFunction(api!.tx[pallet][module]))!;
  const tx = api!.tx[pallet][module];
  const params = getNativeTeleportParams(originNet, destNet, toAddress, precisionAmount, xcmAssetId, state);

  return tx(...params);
}

async function createOrmlCrossChainExtrinsic(
  xcmAssetId: AssetId,
  originNet: NetworkName,
  destNet: NetworkName,
  toAddress: string,
  amount: string,
  tokenBalance: TokenGroup,
  state: State
): Promise<Extrinsic> {
  const api = state.getSubstrateApiMap[originNet.toLowerCase()].api;

  if (!api) return;

  await api.isReadyOrError;

  const { precision } = getAssetBalance(originNet, tokenBalance);
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

async function createCrossChainExtrinsic(props: CrossChainProps, amount: string, state: State): Promise<Extrinsic> {
  const { originNet, assetId, destinationNet, to, tokenBalance } = props;
  const originNetworkKey = state.networkService.getNetworkByKey(originNet)?.name;
  const destNetworkKey = state.networkService.getNetworkByKey(destinationNet)?.name;
  const { symbol } = getAssetInfo(assetId, state);
  const { xcm } = state.networkMap[originNetworkKey];

  // Структура assets в availableDestinations всегда одинаковая
  // id у конкретного токена(например DOT), для всех сетей внутри availableDestinations одинаковый
  // Поэтому просто берем первый попавшийся элемент из массива availableDestinations, берем его assets и ищем нужный токен внутри assets
  const { chainId: destChainId } = state.networkMap[destNetworkKey];
  const { assets } = xcm!.availableDestinations.find(({ chainId }) => chainId === destChainId)!;
  const { id: xcmAssetId } = assets.find(
    ({ symbol: _symbol }) => _symbol.toLowerCase() === getNativeAssetName(symbol)
  )!;

  if (isLiberland(originNet)) return createLiberlandCrossChain(props, state);

  if (isNativeNetwork(originNet)) {
    // Case RelayChain -> Nonnative ParaChain (polkadot -> acala, etc; kusama -> bifrost, etc) pallet = xcmPallet, module = limitedReserveTransferAssets
    // Case RelayChain -> Native ParaChain (polkadot -> statemint; kusama -> statemine, encointer) pallet = xcmPallet, module = limitedTeleportAssets
    // Case Native ParaChain -> RelayChain (statemint -> polkadot; statemine, encointer -> kusama) pallet = polkadotXcm, module = limitedTeleportAsset
    return createNativeCrossChainExtrinsic(xcmAssetId, originNet, destinationNet, to, amount, tokenBalance, state);
  }

  // Case Nonnative ParaChain -> Nonnative ParaChain (karura, etc -> bifrost, etc)
  // Case Nonnative ParaChain -> RelayChain (karura, etc -> kusama, etc; acala, etc -> polkadot)
  return createOrmlCrossChainExtrinsic(xcmAssetId, originNet, destinationNet, to, amount, tokenBalance, state);
}

async function estimateCrossChainFee(props: CrossChainProps, state: State): Promise<[FPNumber, FPNumber]> {
  const { originNet, destinationNet, amount, tokenBalance } = props;

  // Crosschain fee calculation
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

  const { precision } = getAssetBalance(originNet, tokenBalance);

  const crossChainFee = FPNumber.fromCodecValue(
    destEstimateFee?.feeInPlanks ?? '0',
    +(destEstimateFee?.precision ?? precision)
  );

  if (isSora(originNet, true)) {
    const originFee = await estimateSoraCrossChainFee(props);

    return [originFee, crossChainFee];
  }

  // Добавляем CrossChain комиссию к amount, потому что она списывается из суммы amount`а
  const amountWithCrossChainFee = new FPNumber(amount, precision).add(crossChainFee).toString();

  const extrinsic = await createCrossChainExtrinsic(props, amountWithCrossChainFee, state);

  if (!IS_PRODUCTION) console.info('CrossChain', extrinsic);

  // Далее рассчет origin fee
  try {
    const { precision: utilityPrecision } = getUtilityProps(originNet, state)!;
    const address = isEthereumNetwork(originNet) ? VALID_ETHEREUM_ADDRESS : VALID_SUBSTRATE_ADDRESS;

    const paymentInfo = await extrinsic?.paymentInfo(address);

    const partialFee = paymentInfo ? +paymentInfo.partialFee : 0;
    const originFee = FPNumber.fromCodecValue(partialFee, utilityPrecision);

    return [originFee, crossChainFee];
  } catch {
    return [FPNumber.ZERO, crossChainFee];
  }
}

async function makeCrossChain(props: MakeCrossChainProps, state: State): Promise<void> {
  const { originNet, from, isSavePass, password, amount, tokenBalance, callback, isMobile } = props;

  if (isSora(originNet, true)) return await makeSoraCrossChain(props, state);

  const txState: BasicTxResponse = {};
  const apiProps = state.getSubstrateApiMap[originNet.toLowerCase()];

  await apiProps.api?.isReady;

  const { precision } = getAssetBalance(originNet, tokenBalance);
  const [, crossChainFee] = await estimateCrossChainFee(props, state);

  const amountWithCrossChainFee = new FPNumber(amount, precision).add(crossChainFee).toString(); // добавляем CrossChain комиссию, потому что она списывается из суммы amount`а

  const extrinsic = await createCrossChainExtrinsic(props, amountWithCrossChainFee, state);

  await signAndSendExtrinsic(
    {
      type: isMobile ? SignerType.MOBILE : SignerType.PASSWORD,
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

export { estimateCrossChainFee, makeCrossChain };
