// Local scope, like the security notice: other locales show the English text until reviewed translations
// are available. The same wording is used by Fearless for iOS and Android.
const messages = {
  'en-EN': {
    title: 'Choose your address',
    description:
      'Earlier versions of the Fearless browser extension made a different address from this password. Choose the one that holds your funds.',
    nfkd: 'All Fearless apps',
    nfc: 'Earlier browser extension',
    asTyped: 'Browser extension 3.0, as typed',
    inWallet: 'Already in your wallet',
    hint: 'Not sure? Nothing is lost by choosing any of them. You can import this phrase again later to add another address.',
  },
  'ru-RU': {
    title: 'Выберите адрес',
    description:
      'Прежние версии расширения Fearless для браузера получали из этого пароля другой адрес. Выберите тот, на котором хранятся ваши средства.',
    nfkd: 'Все приложения Fearless',
    nfc: 'Прежнее расширение для браузера',
    asTyped: 'Расширение 3.0, как введено',
    inWallet: 'Уже в вашем кошельке',
    hint: 'Не уверены? При любом выборе ничего не теряется. Позже эту фразу можно импортировать ещё раз, чтобы добавить другой адрес.',
  },
} as const;

export type SubstratePasswordMessageKey = keyof (typeof messages)['en-EN'];

export function substratePasswordMessage(locale: string, key: SubstratePasswordMessageKey): string {
  return (locale === 'ru-RU' ? messages['ru-RU'] : messages['en-EN'])[key];
}
