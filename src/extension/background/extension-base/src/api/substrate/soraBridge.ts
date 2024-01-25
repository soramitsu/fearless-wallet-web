import { FPNumber, api as apiSora } from '@sora-substrate/util';
import { SubNetworkId } from '@sora-substrate/util/build/bridgeProxy/sub/consts';
import { getAssetBalance, getAssetInfo } from '../helpers';
import { type CrossChainProps, type MakeCrossChainProps } from './crossChain';
import type State from '@extension-base/background/handlers/State';
import type { Asset } from '@sora-substrate/util/src/assets/types';
import { type NetworkName } from '@/interfaces';

const KUSAMA_PARACHAIN_ID = '6d8d9f145c2177fa83512492cdd80a71e29f22473f4a8943a6292149ac319fb9';
const POLKADOT_PARACHAIN_ID = 'e92d165ad41e41e215d09713788173aecfdbe34d3bed29409d33a2ef03980738';
const ROCOCO_PARACHAIN_ID = '8685a8d3e57fa8024b91b8ead6cc97acf953889c6fb0a355602826a1e2db198f';

function getSoraParaId(network: NetworkName, state: State): string {
  if (network.toLowerCase() === 'kusama')
    return state.networksGithub.find(({ chainId }) => chainId === KUSAMA_PARACHAIN_ID)!.paraId!;

  if (network.toLowerCase() === 'polkadot')
    return state.networksGithub.find(({ chainId }) => chainId === POLKADOT_PARACHAIN_ID)!.paraId!;

  if (network.toLowerCase() === 'rococo')
    return state.networksGithub.find(({ chainId }) => chainId === ROCOCO_PARACHAIN_ID)!.paraId!;

  return '-1';
}

function getSoraParams(props: CrossChainProps, state: State): [Asset, SubNetworkId] {
  const { originNet, tokenBalance, destinationNet, assetId } = props;
  const { precision, symbol } = getAssetBalance(originNet, tokenBalance);
  const { currencyId } = getAssetInfo(assetId, state);

  const subNetworkId =
    destinationNet.toLowerCase() === 'kusama'
      ? SubNetworkId.Kusama
      : destinationNet.toLowerCase() === 'polkadot'
      ? SubNetworkId.Polkadot
      : SubNetworkId.Rococo;

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
