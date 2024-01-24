import { FPNumber, api as apiSora } from '@sora-substrate/util';
import { SubNetworkId } from '@sora-substrate/util/build/bridgeProxy/sub/consts';
import { getAssetBalance, getAssetInfo } from '../helpers';
import { type CrossChainProps, type MakeCrossChainProps } from './crossChain';
import type State from '@extension-base/background/handlers/State';
import type { Asset } from '@sora-substrate/util/src/assets/types';
import { type NetworkName } from '@/interfaces';

const KUSAMA_PARACHAIN = 'SORA Kusama parachain';
const ROCOCO_PARACHAIN = 'SORA Rococo parachain';

function getSoraParaId(network: NetworkName, state: State): string {
  if (network.toLowerCase() === 'kusama') return state.networkMap[KUSAMA_PARACHAIN].paraId!;

  if (network.toLowerCase() === 'rococo') return state.networkMap[ROCOCO_PARACHAIN].paraId!;

  return '0';
}

function getSoraParams(props: CrossChainProps, state: State): [Asset, SubNetworkId] {
  const { originNet, tokenBalance, destinationNet, assetId } = props;
  const { precision, symbol } = getAssetBalance(originNet, tokenBalance);
  const { currencyId } = getAssetInfo(assetId, state);

  const subNetworkId = destinationNet.toLowerCase() === 'kusama' ? SubNetworkId.Kusama : SubNetworkId.Rococo;

  return [
    {
      address: currencyId!,
      symbol: symbol,
      name: symbol,
      decimals: precision,
    },
    subNetworkId,
  ];
}

async function estimateSoraCrossChainFee(props: CrossChainProps, state: State): Promise<FPNumber> {
  const soraParams = getSoraParams(props, state);

  const fee = await apiSora.bridgeProxy.sub.getNetworkFee(...soraParams);

  return FPNumber.fromCodecValue(fee);
}

async function makeSoraCrossChain(props: MakeCrossChainProps, state: State): Promise<void> {
  const { originNet, amount, to } = props;

  const api = state.getSubstrateApiMap[originNet.toLowerCase()].api;

  if (!api) return;

  await api.isReadyOrError;

  const [asset, subNetwork] = getSoraParams(props, state);

  await apiSora.bridgeProxy.sub.transfer(asset, to, amount, subNetwork);
}

export { makeSoraCrossChain, estimateSoraCrossChainFee, getSoraParaId };
