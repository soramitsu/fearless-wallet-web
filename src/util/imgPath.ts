export function getIconPathByNetworkName(networkName = '') {
  switch (networkName.toLowerCase()) {
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
      return 'Picasso.svg';
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
      return 'moonbase alpha.svg';
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
    default:
      return 'fw-logo.svg';
  }
}
