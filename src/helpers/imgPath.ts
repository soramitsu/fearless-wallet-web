import type { RelayChainName } from '@/interfaces/teleport';
import { LIT, NETWORK_AND_ASSET, PHA, UNIT } from '@/consts/networks';

const ormlNetworks: Record<string, string> = {
  ausd: 'aUSD',
  lcdot: 'lcDOT',
  tdot: 'tDOT',
  tai: 'TAI',
  ldot: 'lDOT',
  vsksm: 'vsKSM',
  taiksm: 'taiKSM',
  aris: 'ARIS',
  lksm: 'LKSM',
  kusd: 'KUSD',
  rmrk: 'RMRK',
  kbtc: 'KBTC',
  usdt: 'USDT',
  zlk: 'ZLK',
  eqd: 'EQD',
  vksm: 'vKSM',
  xstusd: 'XSTUSD',
  val: 'VAL',
  pswap: 'PSWAP',
  xst: 'XST',
  busd: 'BUSD',
  usdc: 'USDC',
  deo: 'DEO',
  noir: 'NOIRE',
  umi: 'UMI',
  ceres: 'CERES',
  dai: 'DAI',
  eth: 'ETH',
};

function getOrmlFileName(value: string) {
  const prepValue = value.toLocaleLowerCase();

  return ormlNetworks[prepValue] ?? '';
}

function getImgPathByNetworkOrAssetName(value = '', relayChain?: RelayChainName) {
  const prepValue = value.toLowerCase();

  if (NETWORK_AND_ASSET[prepValue]) return NETWORK_AND_ASSET[prepValue];

  const prepRelayChain = relayChain?.toLowerCase();

  if (prepRelayChain) {
    if (prepValue === 'pha') return PHA[prepRelayChain] ?? '_default';
    if (prepValue === 'lit') return LIT[prepRelayChain] ?? '_default';
    if (prepValue === 'unit') return UNIT[prepRelayChain] ?? '_default';
  }

  return '_default';
}

function getIconName(value: string, relayChain?: RelayChainName) {
  const ormlFileName = getOrmlFileName(value);

  if (ormlFileName !== '') return ormlFileName;

  return getImgPathByNetworkOrAssetName(value, relayChain).toLocaleLowerCase();
}

export { getIconName };
