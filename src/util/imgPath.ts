export function getImgPathByNetworkOrTokenName(value = '') {
  switch (value.toLowerCase()) {
    case 'statemine':
      return 'statemine.svg';
    case 'statemint':
      return 'statemine.svg';
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
    case 'bnc':
      return 'bifrost.svg';
    case 'khala':
    case 'pha':
      return 'khala.svg';
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
    case 'subsocial parachain':
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
    case 'litmus':
    case 'lit':
      return 'litmus.svg';
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
    default:
      return '_default.svg';
  }
}
