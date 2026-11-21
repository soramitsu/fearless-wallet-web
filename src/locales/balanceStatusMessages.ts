// What the wallet's list says about its balances while they arrive. Like walletHomeMessages.ts, these stay outside
// translation.json until reviewed Akkadian and Egyptian translations exist: those locales read the English text
// through the fallback. Registered at locale initialization, because the list is on every wallet screen.
const en = {
  balanceStatus: {
    notResponding: '1 network is not responding | {count} networks are not responding',
    discovering: 'Looking for your tokens on every network · {checked} of {total}',
    foundNotVerified: '1 more token found, not verified · Review | {count} more tokens found, not verified · Review',
  },
};

const ru: typeof en = {
  balanceStatus: {
    notResponding: '1 сеть не отвечает | Не отвечают сети: {count}',
    discovering: 'Ищем ваши токены во всех сетях · {checked} из {total}',
    foundNotVerified: 'Найден ещё 1 непроверенный токен · Посмотреть | Найдено непроверенных токенов: {count} · Посмотреть',
  },
};

export const balanceStatusMessages = { 'en-EN': en, 'ru-RU': ru } as const;
