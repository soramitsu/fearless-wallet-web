export function getImgPathByNetworkName(network = '') {
  switch (network.toLowerCase()) {
    case 'polkadot':
      return 'polkadot.svg';
    case 'kusama':
      return 'kusama.svg';
    case 'westend':
      return 'westend.svg';
    case 'statemine':
      return 'statemine.svg';
    case 'statemint':
      return 'statemine.svg';
    case 'acala':
      return 'acala.svg';
    case 'karura':
      return 'karura.svg';
    case 'moonriver':
      return 'moonriver.svg';
    case 'shiden':
      return 'shiden.svg';
    case 'bifrost':
      return 'bifrost.svg';
    case 'khala':
      return 'khala.svg';
    case 'kilt spiritnet':
      return 'kilt_spiritnet.svg';
    case 'calamari':
      return 'calamari.svg';
    case 'quartz':
      return 'quartz.svg';
    case 'parallel heiko':
      return 'parallelfinance.svg';
    case 'picasso':
      return 'picasso.svg';
    case 'altair':
      return 'altair.svg';
    case 'bit.country pioneer':
      return 'bitcountry.svg';
    case 'clover':
      return 'clover.svg';
    case 'astar':
      return 'astar.svg';
    case 'parallel':
      return 'parallelfinance.svg';
    case 'basilisk':
      return 'basilisk.svg';
    case 'moonbeam':
      return 'moonbeam.svg';
    case 'moonbase alpha':
      return 'moonbase_alpha.svg';
    case 'genshiro':
      return 'genshiro.svg';
    case 'robonomics':
      return 'robonomics.svg';
    case 'kintsugi':
      return 'kintsugi.svg';
    case 'subsocial parachain':
      return 'subsocial.svg';
    case 'zeitgeist':
      return 'zeitgeist.svg';
    case 'integritee shell':
      return 'integritee.svg';
    case 'hydradx':
      return 'hydradx.svg';
    case 'centrifuge':
      return 'centrifuge.svg';
    case 'efinity':
      return 'efinity.svg';
    case 'litmus':
      return 'litmus.svg';
    case 'polkadex main network':
      return 'polkadex.svg';
    case 'turing network':
      return 'turing.svg';
    case 'crust shadow parachain':
      return 'crustshadow.svg';
    case 'interlay':
      return 'interlay.svg';
    case 'dorafactory network':
      return 'dora_factory.svg';
    case 'unique':
      return 'unique.svg';
    case 'origintrail parachain':
      return 'origintrail.svg';
    case 'nodle parachain':
      return 'nodle.svg';
    default:
      return '_default.svg';
  }
}
