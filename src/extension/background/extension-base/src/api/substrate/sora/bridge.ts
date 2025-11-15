import { SubNetworkId, SubEvmNetworks } from '@sora/bridgeProxy/sub/consts';
import { getFPNumberCtor, getSoraApi } from '@extension-base/services/utils/sora';
import { decodeAddress, isEthereumAddress } from '@polkadot/util-crypto';
import { KUSAMA_PARACHAIN_ID, POLKADOT_PARACHAIN_ID, getSoraAsset } from '.';
import type { FPNumber as FPNumberInstance } from '@sora/math';
import type { SubNetwork } from '@sora/bridgeProxy/sub/types';
import type State from '@extension-base/background/handlers/State';
import type { Asset } from '@sora/assets/types';
import type { CrossChainProps, MakeCrossChainProps } from '@extension-base/api/substrate/types';
import type { NetworkName } from '@/interfaces';

const getApiSora = getSoraApi;
const getFPNumber = getFPNumberCtor;
const EVM_SUB_NETWORKS = new Set(SubEvmNetworks as ReadonlyArray<SubNetwork>);

const normalizeNetworkLabel = (networkName: string): string =>
  networkName
    .trim()
    .toLowerCase()
    .replace(/[()]/g, '')
    .replace(/[-_/]+/g, ' ')
    .replace(/asset\s*hub/g, 'assethub')
    .replace(/\bnetwork\b/g, '')
    .replace(/\bparachain\b/g, '')
    .replace(/\brelaychain\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const STATIC_NETWORK_ID_MAP: Record<string, SubNetwork> = {
  polkadot: SubNetworkId.Polkadot,
  kusama: SubNetworkId.Kusama,
  rococo: SubNetworkId.Rococo,
  alphanet: SubNetworkId.Alphanet,
  liberland: SubNetworkId.Liberland,
  acala: SubNetworkId.PolkadotAcala,
  astar: SubNetworkId.PolkadotAstar,
  moonriver: SubNetworkId.KusamaMoonriver,
  moonbeam: SubNetworkId.PolkadotMoonbeam,
  'moonbase alpha': SubNetworkId.AlphanetMoonbase,
  moonbase: SubNetworkId.AlphanetMoonbase,
  'moonbase testnet': SubNetworkId.AlphanetMoonbase,
  shiden: SubNetworkId.KusamaShiden,
  curio: SubNetworkId.KusamaCurio,
};

const matchesAllTokens = (value: string, ...tokens: string[]): boolean =>
  tokens.every((token) => value.includes(token));

function assertValidRecipient(network: NetworkName, subNetwork: SubNetwork, recipient: string): void {
  const sanitizedRecipient = recipient?.trim() ?? '';

  if (!sanitizedRecipient) {
    throw new Error('Bridge recipient address is required');
  }

  if (EVM_SUB_NETWORKS.has(subNetwork)) {
    if (!isEthereumAddress(sanitizedRecipient)) {
      throw new Error(`Destination network "${network}" expects an EVM address (0x...)`);
    }

    return;
  }

  try {
    const decoded = decodeAddress(sanitizedRecipient);

    if (decoded.length !== 32) {
      throw new Error();
    }
  } catch (_error) {
    throw new Error(`Destination network "${network}" expects a valid Substrate public key`);
  }
}

function getSoraParaId(network: NetworkName, state: State): string {
  const paraChainTypes: Record<string, string> = {
    kusama: KUSAMA_PARACHAIN_ID,
    polkadot: POLKADOT_PARACHAIN_ID,
  };

  const networkJson = state.networkService.getNetworkJson(network);
  if (networkJson?.paraId) return networkJson.paraId;

  const parachainId = paraChainTypes[network.toLowerCase()];

  if (!parachainId) return '-1';

  const fromChainId =
    state.networkService.findNetworkJsonByChainId(parachainId) ??
    state.networkService.networksGithub.find(({ chainId }) => chainId === parachainId);

  return fromChainId?.paraId ?? '-1';
}

function getNetworkId(networkName: NetworkName): SubNetwork {
  const normalized = normalizeNetworkLabel(networkName);
  const directMatch = STATIC_NETWORK_ID_MAP[normalized];

  if (directMatch) return directMatch;

  if (matchesAllTokens(normalized, 'assethub', 'polkadot')) return SubNetworkId.PolkadotAssetHub;
  if (matchesAllTokens(normalized, 'assethub', 'kusama')) return SubNetworkId.KusamaAssetHub;

  if (matchesAllTokens(normalized, 'sora', 'polkadot')) return SubNetworkId.PolkadotSora;
  if (matchesAllTokens(normalized, 'sora', 'kusama')) return SubNetworkId.KusamaSora;
  if (matchesAllTokens(normalized, 'sora', 'rococo')) return SubNetworkId.RococoSora;
  if (matchesAllTokens(normalized, 'sora', 'alphanet')) return SubNetworkId.AlphanetSora;
  if (matchesAllTokens(normalized, 'sora', 'testnet')) return SubNetworkId.AlphanetSora;

  if (matchesAllTokens(normalized, 'liberland')) return SubNetworkId.Liberland;
  if (normalized.includes('moonbeam')) return SubNetworkId.PolkadotMoonbeam;
  if (normalized.includes('moonriver')) return SubNetworkId.KusamaMoonriver;
  if (normalized.includes('moonbase')) return SubNetworkId.AlphanetMoonbase;
  if (normalized.includes('shiden')) return SubNetworkId.KusamaShiden;
  if (normalized.includes('curio')) return SubNetworkId.KusamaCurio;
  if (normalized.includes('acala')) return SubNetworkId.PolkadotAcala;
  if (normalized.includes('astar')) return SubNetworkId.PolkadotAstar;

  throw new Error(`Unsupported SORA bridge destination "${networkName}"`);
}

type SoraBridgeParams = {
  asset: Asset;
  subNetwork: SubNetwork;
  recipient: string;
};

function getSoraParams(props: CrossChainProps): SoraBridgeParams {
  const { destinationNet } = props;
  const recipient = props.to.trim();
  const asset = getSoraAsset({ ...props, network: props.originNet });
  const subNetworkId = getNetworkId(destinationNet);

  assertValidRecipient(destinationNet, subNetworkId, recipient);

  return { asset, subNetwork: subNetworkId, recipient };
}

async function estimateSoraCrossChainFee(props: CrossChainProps): Promise<FPNumberInstance> {
  const [apiSora, fpNumberCtor] = await Promise.all([getApiSora(), getFPNumber()]);
  const { asset, subNetwork } = getSoraParams(props);

  const fee = await apiSora.bridgeProxy.sub.getNetworkFee(asset, subNetwork);

  return fpNumberCtor.fromCodecValue(fee);
}

async function makeSoraCrossChain(props: MakeCrossChainProps, state: State): Promise<void> {
  const apiSora = await getApiSora();
  const { originNet, amount } = props;

  const api = state.getSubstrateApiMap[originNet.toLowerCase()].api;

  if (!api) return;

  await api.isReadyOrError;

  const { asset, subNetwork, recipient } = getSoraParams(props);

  await apiSora.bridgeProxy.sub.transfer(asset, recipient, amount, subNetwork);
}

export { makeSoraCrossChain, estimateSoraCrossChainFee, getSoraParaId, assertValidRecipient, getNetworkId };
