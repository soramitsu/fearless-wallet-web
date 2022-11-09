import type { RelayChainName } from '@/interfaces/teleport';

function getOrmlFileName(value: string) {
  switch (value.toLowerCase()) {
    case 'ausd':
      return 'aUSD';
    case 'lcdot':
      return 'lcDOT';
    case 'tdot':
      return 'tDOT';
    case 'tai':
      return 'TAI';
    case 'ldot':
      return 'lDOT';
    case 'vsksm':
      return 'vsKSM';
    case 'taiksm':
      return 'taiKSM';
    case 'aris':
      return 'ARIS';
    case 'lksm':
      return 'LKSM';
    case 'kusd':
      return 'KUSD';
    case 'rmrk':
      return 'RMRK';
    case 'kbtc':
      return 'KBTC';
    case 'usdt':
      return 'USDT';
    case 'zlk':
      return 'ZLK';
    case 'eqd':
      return 'EQD';
    case 'vksm':
      return 'vKSM';
    case 'xstusd':
      return 'XSTUSD';
    case 'val':
      return 'VAL';
    case 'pswap':
      return 'PSWAP';
    case 'xst':
      return 'XST';
    default:
      return '';
  }
}

function getImgPathByNetworkOrAssetName(value = '', relayChain?: RelayChainName) {
  switch (value.toLowerCase()) {
    case 'statemine':
      return 'statemine';

    case 'statemint':
      return 'statemine';

    case 'kico':
      return 'kico';

    case 'encointer on kusama':
      return 'encointer';

    case 'westend':
    case 'wnd':
      return 'westend';

    case 'acala':
    case 'aca':
      return 'acala';

    case 'karura':
    case 'kar':
      return 'karura';

    case 'moonriver':
    case 'movr':
      return 'moonriver';

    case 'shiden':
    case 'sdn':
      return 'shiden';

    case 'bifrost':
    case 'bifrost polkadot':
    case 'bnc':
      return 'bifrost';

    case 'kilt spiritnet':
    case 'kilt':
      return 'kilt_spiritnet';

    case 'calamari':
    case 'kma':
      return 'calamari';

    case 'quartz':
    case 'qtz':
      return 'quartz';

    case 'parallel heiko':
    case 'hko':
      return 'parallelfinance';

    case 'picasso':
    case 'pica':
      return 'picasso';

    case 'altair':
    case 'air':
      return 'altair';

    case 'bit.country pioneer':
    case 'neer':
      return 'bitcountry';

    case 'clover':
    case 'clv':
      return 'clover';

    case 'astar':
    case 'astr':
      return 'astar';

    case 'parallel':
    case 'para':
      return 'parallelfinance';

    case 'basilisk':
    case 'bsx':
      return 'basilisk';

    case 'moonbeam':
    case 'glmr':
      return 'moonbeam';

    case 'moonbase alpha':
    case 'dev':
      return 'moonbase_alpha';

    case 'genshiro':
    case 'gens':
      return 'genshiro';

    case 'robonomics':
    case 'xrt':
      return 'robonomics';

    case 'kintsugi':
    case 'kint':
      return 'kintsugi';

    case 'subsocial':
    case 'sub':
      return 'subsocial';

    case 'zeitgeist':
    case 'ztg':
      return 'zeitgeist';

    case 'integritee shell':
    case 'teer':
      return 'integritee';

    case 'hydradx':
    case 'hdx':
      return 'hydradx';

    case 'centrifuge':
    case 'cfg':
      return 'centrifuge';

    case 'efinity':
    case 'efi':
      return 'efinity';

    case 'polkadex main network':
    case 'pdex':
      return 'polkadex';

    case 'turing network':
    case 'tur':
      return 'turing';

    case 'crust shadow parachain':
    case 'csm':
      return 'crustshadow';

    case 'interlay':
    case 'intr':
      return 'interlay';

    case 'dorafactory network':
    case 'dora':
      return 'dora_factory';

    case 'unique':
    case 'unq':
      return 'unique';

    case 'origintrail parachain':
    case 'otp':
      return 'origintrail';

    case 'nodle parachain':
    case 'nodl':
      return 'nodle';

    case 'sora kusama':
    case 'sora test':
    case 'xor':
      return 'sora';

    case 'composable finance':
    case 'layr':
      return 'composable';

    case 'crab parachain':
    case 'crab':
      return 'crab';

    case 'kabocha':
    case 'kab':
      return 'kabocha';

    case 'pichiu network':
    case 'pchu':
      return 'pichiu';

    case 'equilibrium':
    case 'eq':
      return 'equilibrium';

    case 'datahighway tanganika':
    case 'dhx':
      return 'datahighway';

    case 'gm parachain':
    case 'fren':
      return 'gm_parachain';

    case 'bajun kusama':
    case 'baju':
      return 'bajun';

    case 'imbue kusama':
    case 'imbu':
      return 'imbue';

    case 'invarch tinker network':
    case 'tnkr':
      return 'tinker';

    case 'mangata kusama mainnet':
    case 'mgx':
      return 'mangata';

    case 'amplitude':
    case 'ampe':
      return 'amplitude';

    case 'darwinia parachain':
    case 'ring':
      return 'darwinia';

    case 'kylin network':
    case 'kyl':
      return 'kylin network';

    case 'snow kusama':
    case 'icz':
      return 'snow';

    //////////////////////

    case 'polkadot':
    case 'polkadot (test)':
    case 'dot':
      return 'polkadot';

    case 'kusama':
    case 'kusama (test)':
    case 'ksm':
      return 'kusama';

    case 'unit':
      switch (relayChain?.toLowerCase()) {
        case 'polkadot (test)':
          return 'polkadot';
        case 'kusama (test)':
          return 'kusama';
        default:
          return '_default';
      }

    //////////////////////

    case 'litentry':
      return 'litentry';

    case 'litmus':
      return 'litmus';

    case 'lit':
      switch (relayChain?.toLowerCase()) {
        case 'polkadot':
          return 'litentry';
        case 'kusama':
          return 'litmus';
        default:
          return '_default';
      }

    //////////////////////

    case 'phala':
      return 'phala';

    case 'khala':
      return 'khala';

    case 'pha':
      switch (relayChain?.toLowerCase()) {
        case 'polkadot':
          return 'phala';
        case 'kusama':
          return 'khala';
        default:
          return '_default';
      }

    //////////////////////

    default:
      return '_default';
  }
}

function getIconName(value: string, relayChain?: RelayChainName) {
  const ormlFileName = getOrmlFileName(value);

  if (ormlFileName !== '') return ormlFileName;

  return getImgPathByNetworkOrAssetName(value, relayChain).toLocaleLowerCase();
}

export { getIconName };
