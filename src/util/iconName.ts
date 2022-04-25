export type IconType =
  | 'back'
  | 'full-screen'
  | 'lock'
  | 'settings'
  | 'send'
  | 'right'
  | 'receive'
  | 'search'
  | 'filter'
  | 'more-vertical'
  | 'buy'
  | 'twitter'
  | 'telegram'
  | 'planet'
  | 'question'
  | 'teleport';

export default function (iconType: IconType) {
  switch (iconType) {
    case 'back':
      return 'chevron-left-16';
    case 'full-screen':
      return 'arrows-arrows-diagonals-bltr-24';
    case 'lock':
      return 'lock-16';
    case 'settings':
      return 'basic-settings-24';
    case 'send':
      return 'basic-send-24';
    case 'right':
      return 'arrows-chevron-right-24';
    case 'receive':
      return 'basic-download-24';
    case 'search':
      return 'basic-search-24';
    case 'filter':
      return 'basic-filterlist-24';
    case 'more-vertical':
      return 'basic-more-vertical-24';
    case 'buy':
      return 'basic-plus-24';
    case 'twitter':
      return 'symbols-twitter-24';
    case 'telegram':
      return 'symbols-telegram-24';
    case 'planet':
      return 'various-planet-24';
    case 'question':
      return 'notifications-question-circle-24';
    case 'teleport':
      return 'arrows-swap-24';
    default:
      return '';
  }
}
