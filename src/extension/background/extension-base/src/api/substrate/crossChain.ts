import { BN, isFunction } from '@polkadot/util';
import { FPNumber } from '@sora-substrate/util';
import { decodeAddress } from '@polkadot/util-crypto';
import { state } from '@extension-base/background/handlers';
import {
  isEthereumNetwork,
  getUtilityProps,
  getNativeAssetName,
  getSubstrateAddressByEthAddress,
} from '@extension-base/background/utils/utils';
import { getAssetInfo } from '@extension-base/api/substrate/registry';
import { signAndSendExtrinsic } from './shared/signAndSendExtrinsic';
import type { SubmittableExtrinsic } from '@polkadot/api/types';
import type { Interior } from '@/interfaces';
import {
  TokenBalance,
  BasicTxResponse,
  SignerType,
} from '@/extension/background/extension-base/src/background/types/types';
import { NATIVE_NETWORKS, RELAY_CHAINS, CHAIN_IDS, NETWORKS_ALIASES } from '@/consts/networks';
import { NetworkName, RelayChainName } from '@/interfaces';
import { firstCharToUp } from '@/helpers/common';
import { ETHEREUM_UTILITY_ASSETS } from '@/consts/currencies';

type Extrinsic = Nullable<SubmittableExtrinsic<'promise'>>;

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

function interiorHelper(interiors: Interior, nativeParachainIds: number[], originNetParaId?: string) {
  const originNetIsExistInNativeParachainIds = nativeParachainIds?.some(
    (id) => id.toString() === originNetParaId?.toString()
  );

  const array = interiors.reduce((result, interior) => {
    // Убираем параметр parachain если для ассета оригин сеть содержится в nativeParachainIds
    if (originNetIsExistInNativeParachainIds && interior.parachain !== undefined) return result;

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

function getConcreteAsset(originNet: NetworkName, isToRelayChain: boolean, assetId: string, isNative = false) {
  const tokenInfo = getAssetInfo(assetId);
  const { paraId: originNetParaId } = state.networkMap[originNet];

  const { xcm, parentId } = state.networkMap[originNet];

  // This Polkadot or Kusama
  if (parentId === undefined)
    return {
      interior: { Here: '' },
      parents: isToRelayChain ? 1 : 0, // Это isNative телепорт, соответственно parents формируется как для isNative
    };

  const { assets: xcmLocationsAssets } = state.xcmLocations.find(({ chainId }) => chainId === parentId)!;

  const asset = getNativeAssetName(tokenInfo.symbol);

  const { interiors, nativeParachainIds } = xcmLocationsAssets.find(
    ({ symbol }) => symbol.toLowerCase() === asset.toLowerCase()
  )!;

  const interiorsByXcmVersion = interiors[xcm!.xcmVersion]!;

  const interiorValue = interiorHelper(interiorsByXcmVersion, nativeParachainIds, originNetParaId);
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
  assetId: string
) {
  const isToRelayChain = isRelayChain(destNet);
  const { xcm, parentId, name } = state.networkMap[originNet];
  const { paraId } = state.networkMap[destNet];
  const xcmVersion = xcm!.xcmVersion.toUpperCase();
  const publicKey = decodeAddress(toAddress);
  const value = new BN(amount);

  const relayChain = CHAIN_IDS[parentId!] ?? firstCharToUp(name);

  const receiverLocation = isEthereumNetwork(destNet)
    ? {
        AccountKey20: {
          network: { [relayChain]: '' },
          key: publicKey, // TODO проверить декодирование eth адреса, корректно ли работает decodeAddress функция
        },
      }
    : {
        AccountId32: {
          network: { [relayChain]: '' },
          id: publicKey,
        },
      };

  const destinationChain = {
    [xcmVersion]: {
      interior: isToRelayChain ? { Here: '' } : { X1: { Parachain: paraId } },
      parents: 1,
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
        id: { Concrete: getConcreteAsset(originNet, isToRelayChain, assetId, true) },
      },
    ],
  };

  const limit = { Unlimited: null }; // TODO возможно в будущем нужно будет доделать

  return [destinationChain, receiver, asset, 0, limit];
}

function getOrmlTeleportParams(originNet: string, destNet: string, toAddress: string, amount: string, assetId: string) {
  const isToRelayChain = isRelayChain(destNet);
  const { xcm, parentId, name } = state.networkMap[originNet];
  const { paraId } = state.networkMap[destNet];
  const xcmVersion = xcm!.xcmVersion.toUpperCase();
  const publicKey = decodeAddress(toAddress);
  const value = new BN(amount);

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

  const asset = {
    [xcmVersion]: {
      fun: { Fungible: value },
      id: { Concrete: getConcreteAsset(originNet, isToRelayChain, assetId) },
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
  assetId: NetworkName,
  originNet: NetworkName,
  destNet: NetworkName,
  toAddress: string,
  amount: string,
  tokenBalance: TokenBalance
): Promise<Extrinsic> {
  const api = state.getSubstrateApiMap[originNet]?.api;

  if (!api) return;

  await api.isReadyOrError;

  const { precision } = tokenBalance.balances.find(({ name }) => name.toLowerCase() === originNet.toLowerCase())!;

  const precisionAmount = getPrecisionValue(amount, precision);
  const module = isNativeNetwork(destNet) ? 'limitedTeleportAssets' : 'limitedReserveTransferAssets';
  const pallet = XCM_NATIVE_PALLETS.find((pallet) => api!.tx[pallet] && isFunction(api!.tx[pallet][module]))!;
  const tx = api!.tx[pallet][module];
  const params = getNativeTeleportParams(originNet, destNet, toAddress, precisionAmount, assetId);

  return tx(...params);
}

async function createOrmlTeleportExtrinsic(
  assetId: string,
  originNet: NetworkName,
  destNet: NetworkName,
  toAddress: string,
  amount: string,
  tokenBalance: TokenBalance
): Promise<Extrinsic> {
  const api = state.getSubstrateApiMap[originNet].api;

  if (!api) return;

  await api.isReadyOrError;

  const { precision } = tokenBalance.balances.find(({ name }) => name.toLowerCase() === originNet.toLowerCase())!;

  const precisionAmount = getPrecisionValue(amount, precision);

  // В большинстве случаев используется xTokens, но он есть не всегда
  if (api.tx?.xTokens?.transferMultiasset) {
    const params = getOrmlTeleportParams(originNet, destNet, toAddress, precisionAmount, assetId);

    return api.tx?.xTokens?.transferMultiasset(...params);
  }

  const module = isRelayChain(destNet) ? 'limitedReserveWithdrawAssets' : 'limitedReserveTransferAssets';
  const params = getNativeTeleportParams(originNet, destNet, toAddress, precisionAmount, assetId);

  // Если нет xTokens используется polkadotXcm, с соответствующим модулем
  return api.tx?.polkadotXcm[module](...params);
}

async function estimateCrossChainFee(
  from: string,
  to: string,
  originNet: NetworkName,
  destinationNet: NetworkName,
  tokenBalance: TokenBalance,
  relayChain?: RelayChainName,
  extrinsic?: Extrinsic
): Promise<[FPNumber, FPNumber]> {
  // Рассчет cross chain fee
  const destFees = state.xcmFees.find(({ destChain }) => {
    const destChainLower = destChain.toLowerCase();
    const destinationNetLower = destinationNet.toLowerCase();

    // В файле XCM_FEES старые названия Statemint and Statemine, ищем их по элиасам
    return (
      (NETWORKS_ALIASES[destChainLower] ?? destChainLower) ===
      (NETWORKS_ALIASES[destinationNetLower] ?? destinationNetLower)
    );
  });

  const asset = getNativeAssetName(tokenBalance.symbol);

  const destEstimateFee = destFees?.destXcmFee?.find(({ symbol: _symbol }) => _symbol.toLowerCase() === asset);

  // Токены мунбим, мунривер сетей являются аналогами из других сабстрейт сетей, но хранятся отдельными сущностями
  // По сути они являются отдельной сущностью TokenBalance
  // Если телепорт в эфириум сеть из НЕ эфириум сити ИЛИ из эфириум сети в НЕ эфириум сеть, нужно искать precision в другой сущности TokenBalance, для токена `xcTOKEN`

  const toEthereum = !isEthereumNetwork(originNet) && isEthereumNetwork(destinationNet);
  const fromEthereum = isEthereumNetwork(originNet) && !isEthereumNetwork(destinationNet);
  const isSeparateRecord = (toEthereum || fromEthereum) && !Object.values(ETHEREUM_UTILITY_ASSETS).includes(asset);

  const address = getSubstrateAddressByEthAddress(from);

  const tokenBalanceByDestNet = isSeparateRecord
    ? state.balanceMap[address].find((balance) => {
        // Соответственно либо подставляем префикс xc либо убираем его
        const asset = toEthereum ? `xc${tokenBalance.symbol.toLowerCase()}` : getNativeAssetName(tokenBalance.symbol);

        return balance.symbol === asset && balance.relayChain.toLowerCase() === relayChain?.toLowerCase();
      })!
    : tokenBalance;

  const { precision: precisionDest } = tokenBalanceByDestNet.balances.find(({ name }) => {
    return name.toLowerCase() === destinationNet.toLowerCase();
  })!;

  const crossChainFee = FPNumber.fromCodecValue(destEstimateFee?.feeInPlanks ?? '0', precisionDest);

  // Далее рассчет origin fee
  if (!extrinsic) return [FPNumber.ZERO, crossChainFee];

  const { precision: utilityPrecision } = getUtilityProps(originNet)!;

  try {
    const paymentInfo = await extrinsic?.paymentInfo(to);
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
  tokenBalance: TokenBalance
): Promise<Extrinsic> {
  if (isNativeNetwork(originNet)) {
    // Case RelayChain -> Nonnative ParaChain (polkadot -> acala, etc; kusama -> bifrost, etc) pallet = xcmPallet, module = limitedReserveTransferAssets
    // Case RelayChain -> Native ParaChain (polkadot -> statemint; kusama -> statemine, encointer) pallet = xcmPallet, module = limitedTeleportAssets
    // Case Native ParaChain -> RelayChain (statemint -> polkadot; statemine, encointer -> kusama) pallet = polkadotXcm, module = limitedTeleportAssets
    // TODO: add case: Native ParaChain -> Nonnative ParaChain
    // TODO: add case: Native ParaChain -> Native ParaChain
    return createNativeTeleportExtrinsic(assetId, originNet, destNet, toAddress, amount, tokenBalance);
  } else {
    // Case Nonnative ParaChain -> Nonnative ParaChain (karura, etc -> bifrost, etc)
    // Case Nonnative ParaChain -> RelayChain (karura, etc -> kusama, etc; acala, etc -> polkadot)
    return createOrmlTeleportExtrinsic(assetId, originNet, destNet, toAddress, amount, tokenBalance);
  }
}

export interface MakeCrossChainProps {
  assetId: string;
  originNet: NetworkName;
  destinationNet: NetworkName;
  to: string;
  from: string;
  amount: string;
  password: string | undefined;
  isSavePass?: boolean;
  callback: (data: BasicTxResponse) => void;
  relayChain?: RelayChainName;
}

async function makeCrossChain({
  assetId,
  originNet,
  destinationNet,
  from,
  to,
  isSavePass,
  password,
  amount,
  callback,
  relayChain,
}: MakeCrossChainProps): Promise<void> {
  const txState: BasicTxResponse = {};
  const apiProps = state.getSubstrateApiMap[originNet];

  await apiProps.api?.isReady;

  const address = getSubstrateAddressByEthAddress(from);
  const tokenBalance = state.balanceMap[address].find(({ assetId: _assetId }) => _assetId === assetId)!;
  const [, crossChainFee] = await estimateCrossChainFee(from, to, originNet, destinationNet, tokenBalance, relayChain);

  const amountWithCrossChain = new FPNumber(amount).add(crossChainFee).toString();

  const extrinsic = await createCrossChainExtrinsic(
    assetId,
    originNet,
    destinationNet,
    to,
    amountWithCrossChain!,
    tokenBalance
  );

  await signAndSendExtrinsic({
    type: SignerType.PASSWORD,
    apiProps,
    callback,
    extrinsic,
    txState,
    password,
    isSavePass,
    address: from,
    errorMessage: 'CrossChain error',
  });
}

export { estimateCrossChainFee, makeCrossChain, createCrossChainExtrinsic };

export type { Extrinsic };
