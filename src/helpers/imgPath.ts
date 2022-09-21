import type { RelayChainName } from '@/consts/teleport';

const NETWORKS_PATH = 'networks';
const ORML_PATH = 'orml';

function getOrmlFileName(value: string) {
  switch (value.toLowerCase()) {
    case 'ausd':
      return 'aUSD.svg';
    case 'lcdot':
      return 'lcDOT.svg';
    case 'tdot':
      return 'tDOT.svg';
    case 'tai':
      return 'TAI.svg';
    case 'ldot':
      return 'lDOT.svg';
    case 'vsksm':
      return 'vsKSM.svg';
    case 'taiksm':
      return 'taiKSM.svg';
    case 'aris':
      return 'ARIS.svg';
    case 'lksm':
      return 'LKSM.svg';
    case 'kusd':
      return 'KUSD.svg';
    case 'rmrk':
      return 'RMRK.svg';
    case 'kbtc':
      return 'KBTC.svg';
    case 'usdt':
      return 'USDT.svg';
    case 'zlk':
      return 'ZLK.svg';
    case 'eqd':
      return 'EQD.svg';
    default:
      return '';
  }
}

function getImgPathByNetworkOrTokenName(value = '', relayChain?: RelayChainName) {
  switch (value.toLowerCase()) {
    case 'statemine':
      return 'statemine.svg';

    case 'statemint':
      return 'statemine.svg';

    case 'kico':
      return 'kico.svg';

    case 'encointer on kusama':
      return 'encointer.svg';

    case 'polkadot':
    case 'dot':
      return 'polkadot.svg';

    case 'kusama':
    case 'ksm':
      return 'kusama.svg';

    case 'westend':
    case 'wnd':
      return 'westend.svg';

    case 'acala':
    case 'aca':
      return 'acala.svg';

    case 'karura':
    case 'kar':
      return 'karura.svg';

    case 'moonriver':
    case 'movr':
      return 'moonriver.svg';

    case 'shiden':
    case 'sdn':
      return 'shiden.svg';

    case 'bifrost':
    case 'bifrost polkadot':
    case 'bnc':
      return 'bifrost.svg';

    case 'kilt spiritnet':
    case 'kilt':
      return 'kilt_spiritnet.svg';

    case 'calamari':
    case 'kma':
      return 'calamari.svg';

    case 'quartz':
    case 'qtz':
      return 'quartz.svg';

    case 'parallel heiko':
    case 'hko':
      return 'parallelfinance.svg';

    case 'picasso':
    case 'pica':
      return 'picasso.svg';

    case 'altair':
    case 'air':
      return 'altair.svg';

    case 'bit.country pioneer':
    case 'neer':
      return 'bitcountry.svg';

    case 'clover':
    case 'clv':
      return 'clover.svg';

    case 'astar':
    case 'astr':
      return 'astar.svg';

    case 'parallel':
    case 'para':
      return 'parallelfinance.svg';

    case 'basilisk':
    case 'bsx':
      return 'basilisk.svg';

    case 'moonbeam':
    case 'glmr':
      return 'moonbeam.svg';

    case 'moonbase alpha':
    case 'dev':
      return 'moonbase_alpha.svg';

    case 'genshiro':
    case 'gens':
      return 'genshiro.svg';

    case 'robonomics':
    case 'xrt':
      return 'robonomics.svg';

    case 'kintsugi':
    case 'kint':
      return 'kintsugi.svg';

    case 'subsocial':
    case 'sub':
      return 'subsocial.svg';

    case 'zeitgeist':
    case 'ztg':
      return 'zeitgeist.svg';

    case 'integritee shell':
    case 'teer':
      return 'integritee.svg';

    case 'hydradx':
    case 'hdx':
      return 'hydradx.svg';

    case 'centrifuge':
    case 'cfg':
      return 'centrifuge.svg';

    case 'efinity':
    case 'efi':
      return 'efinity.svg';

    case 'polkadex main network':
    case 'pdex':
      return 'polkadex.svg';

    case 'turing network':
    case 'tur':
      return 'turing.svg';

    case 'crust shadow parachain':
    case 'csm':
      return 'crustshadow.svg';

    case 'interlay':
    case 'intr':
      return 'interlay.svg';

    case 'dorafactory network':
    case 'dora':
      return 'dora_factory.svg';

    case 'unique':
    case 'unq':
      return 'unique.svg';

    case 'origintrail parachain':
    case 'otp':
      return 'origintrail.svg';

    case 'nodle parachain':
    case 'nodl':
      return 'nodle.svg';

    case 'sora kusama':
    case 'xor':
      return 'sora.svg';

    case 'composable finance':
    case 'layr':
      return 'composable.svg';

    case 'crab parachain':
    case 'crab':
      return 'crab.svg';

    case 'kabocha':
    case 'kab':
      return 'kabocha.svg';

    case 'pichiu network':
    case 'pchu':
      return 'pichiu.svg';

    case 'equilibrium':
    case '25969':
      return 'equilibrium.svg';

    case 'datahighway tanganika':
    case 'dhx':
      return 'datahighway.svg';

    case 'gm parachain':
    case 'fren':
      return 'gm_parachain.svg';

    case 'bajun kusama':
    case 'baju':
      return 'bajun.svg';

    case 'imbue kusama':
    case 'imbu':
      return 'imbue.svg';

    case 'invarch tinker network':
    case 'tnkr':
      return 'tinker.svg';

    case 'mangata kusama mainnet':
    case 'mgx':
      return 'mangata.svg';

    case 'amplitude':
    case 'ampe':
      return 'amplitude.svg';

    case 'darwinia parachain':
    case 'ring':
      return 'darwinia.svg';

    //////////////////////

    case 'litentry':
      return 'litentry.svg';

    case 'litmus':
      return 'litmus.svg';

    case 'lit':
      switch (relayChain?.toLocaleLowerCase()) {
        case 'polkadot':
          return 'litentry.svg';
        case 'kusama':
          return 'litmus.svg';
        default:
          return '_default.svg';
      }

    //////////////////////

    case 'phala':
      return 'phala.svg';

    case 'khala':
      return 'khala.svg';

    case 'pha':
      switch (relayChain?.toLocaleLowerCase()) {
        case 'polkadot':
          return 'phala.svg';
        case 'kusama':
          return 'khala.svg';
        default:
          return '_default.svg';
      }

    //////////////////////

    default:
      return '_default.svg';
  }
}

function getImgPath(value: string, relayChain?: RelayChainName) {
  const ormlFileName = getOrmlFileName(value);

  if (ormlFileName !== '') return `${ORML_PATH}/${ormlFileName}`;

  return `${NETWORKS_PATH}/${getImgPathByNetworkOrTokenName(value, relayChain)}`;
}

export { getImgPath };
