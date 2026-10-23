import { i18n } from '@/locales';

// The dashboard's own message bundle, merged into vue-i18n when the dashboard first mounts. It lives apart from the
// translation.json files for now: the Akkadian and Egyptian locales must cover every key of the English one
// (tests/unit/akkadian-locale.spec.ts, egyptian-hieroglyph-locale.spec.ts), and the dashboard is still behind a
// build flag. Those two locales fall back to English here; the keys move into translation.json, with cuneiform and
// hieroglyph text, when the flag graduates. Nothing is registered in a build that never mounts the dashboard.
const en = {
  allWallets: 'All wallets',
  walletsCount: '1 wallet | {count} wallets',
  totalBalance: 'Total balance',
  changeLabel: '24h',
  changeAria: '{direction} {amount}, {percent} in 24 hours',
  direction: { up: 'Up', down: 'Down', flat: 'Unchanged' },
  changeCurrency: 'Change currency',
  howWeCount: 'How we count',
  notIncluded: '{parts} not included',
  hiddenCount: '{count} hidden',
  unpricedCount: '{count} unpriced',
  sky: 'Winged sun with your allocation',
  sync: {
    live: 'Live',
    saved: 'Saved',
    savedAge: 'Saved · {age}',
    partial: 'Partial',
    offline: 'Offline',
    open: 'Balance status: {state}. Show details',
    title: 'Balance status',
    liveText: 'Every wallet was updated in the last 15 minutes.',
    savedText: 'These balances were saved earlier and may not match what you hold now.',
    partialText: 'These networks did not answer, so their value may be missing or out of date.',
    offlineText: 'You are offline. These are the last balances saved on this device.',
    wallets: 'Saved balances',
    networks: 'Networks that did not answer',
    refresh: 'Refresh balances',
    refreshing: 'Refreshing…',
  },
  lens: { label: 'View', tokens: 'Tokens', networks: 'Networks', wallets: 'Wallets' },
  legend: {
    label: 'Allocation of your balance',
    chip: '{name}, {percent} percent, {value}',
    other: 'Other',
    otherDetail: 'Other: {names}',
    selected: 'Highlighted',
  },
  actions: { swap: 'Swap', swapAria: 'Swap on Polkaswap' },
  rows: {
    networks: '1 network | {count} networks',
    holdings: '1 holding | {count} holdings',
    share: '{percent}% of total',
    openWallet: 'Open {wallet}',
    expand: 'Show where {name} is held',
    collapse: 'Hide where {name} is held',
    walletMeta: '{networks} · {age}',
    emptyTitle: 'No balances to show',
    emptyText: 'Counted balances from your wallets appear here.',
    loading: 'Loading all wallets',
  },
  counting: {
    title: 'How we count your balance',
    rules: {
      amount: 'An amount is what you can spend plus what is reserved.',
      value: "Value is that amount times the asset's own trusted price. A group of tokens never lends a price to one of its members.",
      testnets: 'Test networks are never counted.',
      excluded: 'Hidden, unpriced and pool-staked value is named, never dropped silently.',
      allWallets: "All wallets adds up each wallet's own total, with the same exclusions.",
      filter: 'A network filter changes the list, never the total.',
    },
    now: 'Not included right now',
    none: 'Nothing is excluded right now.',
    hidden: '1 hidden asset | {count} hidden assets',
    unpriced: '1 asset without a trusted price | {count} assets without a trusted price',
    unavailable: '1 balance could not be loaded | {count} balances could not be loaded',
    poolStakes: 'Pool stakes are not included',
  },
  scope: { all: 'All wallets, {total}' },
};

const ru: typeof en = {
  allWallets: 'Все кошельки',
  walletsCount: '1 кошелёк | Кошельков: {count}',
  totalBalance: 'Общий баланс',
  changeLabel: '24 ч',
  changeAria: '{direction} {amount}, {percent} за 24 часа',
  direction: { up: 'Рост', down: 'Падение', flat: 'Без изменений' },
  changeCurrency: 'Сменить валюту',
  howWeCount: 'Как мы считаем',
  notIncluded: '{parts} не учтено',
  hiddenCount: 'скрыто: {count}',
  unpricedCount: 'без цены: {count}',
  sky: 'Крылатое солнце со структурой баланса',
  sync: {
    live: 'Онлайн',
    saved: 'Сохранено',
    savedAge: 'Сохранено · {age}',
    partial: 'Частично',
    offline: 'Офлайн',
    open: 'Состояние баланса: {state}. Показать подробности',
    title: 'Состояние баланса',
    liveText: 'Все кошельки обновлены за последние 15 минут.',
    savedText: 'Эти балансы сохранены ранее и могут не совпадать с тем, что у вас сейчас.',
    partialText: 'Эти сети не ответили, поэтому их стоимость может отсутствовать или устареть.',
    offlineText: 'Нет сети. Показаны последние балансы, сохранённые на этом устройстве.',
    wallets: 'Сохранённые балансы',
    networks: 'Сети, которые не ответили',
    refresh: 'Обновить балансы',
    refreshing: 'Обновляем…',
  },
  lens: { label: 'Вид', tokens: 'Токены', networks: 'Сети', wallets: 'Кошельки' },
  legend: {
    label: 'Структура баланса',
    chip: '{name}, {percent} процентов, {value}',
    other: 'Другое',
    otherDetail: 'Другое: {names}',
    selected: 'Выделено',
  },
  actions: { swap: 'Обмен', swapAria: 'Обмен в Polkaswap' },
  rows: {
    networks: '1 сеть | Сетей: {count}',
    holdings: '1 позиция | Позиций: {count}',
    share: '{percent}% от общего',
    openWallet: 'Открыть {wallet}',
    expand: 'Показать, где хранится {name}',
    collapse: 'Скрыть, где хранится {name}',
    walletMeta: '{networks} · {age}',
    emptyTitle: 'Нет балансов',
    emptyText: 'Здесь появятся учтённые балансы ваших кошельков.',
    loading: 'Загружаем все кошельки',
  },
  counting: {
    title: 'Как мы считаем ваш баланс',
    rules: {
      amount: 'Количество — это доступные средства плюс зарезервированные.',
      value: 'Стоимость — это количество, умноженное на собственную проверенную цену актива. Группа токенов никогда не одалживает цену своим участникам.',
      testnets: 'Тестовые сети не учитываются.',
      excluded: 'Скрытая, неоценённая и заблокированная в пулах стоимость называется явно и не пропадает молча.',
      allWallets: 'Все кошельки — это сумма итогов каждого кошелька с теми же исключениями.',
      filter: 'Фильтр по сети меняет список, но не итог.',
    },
    now: 'Сейчас не учитывается',
    none: 'Сейчас ничего не исключено.',
    hidden: '1 скрытый актив | Скрытых активов: {count}',
    unpriced: '1 актив без проверенной цены | Активов без проверенной цены: {count}',
    unavailable: '1 баланс не удалось загрузить | Балансов не удалось загрузить: {count}',
    poolStakes: 'Стейкинг в пулах не учитывается',
  },
  scope: { all: 'Все кошельки, {total}' },
};

export const dashboardMessages = { 'en-EN': en, 'ru-RU': ru } as const;

let registered = false;

/** Merges the bundle once; every locale without its own text reads the English one through the fallback. */
export function registerDashboardMessages(): void {
  if (registered) return;

  registered = true;
  Object.entries(dashboardMessages).forEach(([locale, messages]) => {
    i18n.global.mergeLocaleMessage(locale, { portfolioDashboard: messages });
  });
}
