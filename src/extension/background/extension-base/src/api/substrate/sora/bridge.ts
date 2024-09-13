import { FPNumber, api as apiSora } from '@sora-substrate/util';
import { SubNetworkId } from '@sora-substrate/util/build/bridgeProxy/sub/consts';
import { KUSAMA_PARACHAIN_ID, POLKADOT_PARACHAIN_ID, getSoraAsset } from '.';
import type { SubNetwork } from '@sora-substrate/util/build/bridgeProxy/sub/types';
import type State from '@extension-base/background/handlers/State';
import type { Asset } from '@sora-substrate/util/src/assets/types';
import type { CrossChainProps, MakeCrossChainProps } from '@extension-base/api/substrate/types';
import { type NetworkName } from '@/interfaces';

function getSoraParaId(network: NetworkName, state: State): string {
  const networks = state.networkService.networksGithub;
  const paraChainTypes: Record<string, string> = {
    kusama: KUSAMA_PARACHAIN_ID,
    polkadot: POLKADOT_PARACHAIN_ID,
  };

  const parachainId = paraChainTypes[network.toLowerCase()];

  if (!parachainId) return '-1';

  return networks.find(({ chainId }) => chainId === parachainId)!.paraId!;
}

function getNetworkId(networkName: NetworkName): SubNetwork {
  switch (networkName.toLowerCase()) {
    case 'kusama':
      return SubNetworkId.Kusama;

    case 'polkadot':
      return SubNetworkId.Polkadot;

    case 'rococo':
      return SubNetworkId.Rococo;

    case 'astar':
      return SubNetworkId.PolkadotAstar;

    case 'acala':
      return SubNetworkId.PolkadotAcala;

    case 'liberland':
      return SubNetworkId.Liberland;

    default:
      return SubNetworkId.Polkadot;
  }
}

function getSoraParams(props: CrossChainProps): [Asset, SubNetwork] {
  const { destinationNet } = props;
  const asset = getSoraAsset({ ...props, network: props.originNet });
  const subNetworkId = getNetworkId(destinationNet);

  return [asset, subNetworkId];
}

async function estimateSoraCrossChainFee(props: CrossChainProps): Promise<FPNumber> {
  const soraParams = getSoraParams(props);

  const fee = await apiSora.bridgeProxy.sub.getNetworkFee(...soraParams);

  return FPNumber.fromCodecValue(fee);
}

async function makeSoraCrossChain(props: MakeCrossChainProps, state: State): Promise<void> {
  const { originNet, amount, to } = props;

  const api = state.getSubstrateApiMap[originNet.toLowerCase()].api;

  if (!api) return;

  await api.isReadyOrError;

  const [asset, subNetwork] = getSoraParams(props);

  await apiSora.bridgeProxy.sub.transfer(asset, to, amount, subNetwork);
}

export { makeSoraCrossChain, estimateSoraCrossChainFee, getSoraParaId };
