// Like sidePanelMessages.ts, these stay outside translation.json until reviewed Akkadian and Egyptian translations
// exist: those locales read the English text through the fallback. Registered at locale initialization: the sound
// switch is in Settings and the arrival toast can show on any wallet screen.
const en = {
  feel: {
    soundEffects: 'Sound effects',
    soundEffectsDescription: 'A short sound when a transfer is sent and when tokens arrive',
    received: 'Tokens received',
    receivedAmount: '+{amount} {symbol}',
    receivedMore: '+{amount} {symbol} and {count} more',
  },
};

const ru: typeof en = {
  feel: {
    soundEffects: 'Звуковые эффекты',
    soundEffectsDescription: 'Короткий звук, когда перевод отправлен и когда приходят токены',
    received: 'Токены получены',
    receivedAmount: '+{amount} {symbol}',
    receivedMore: '+{amount} {symbol} и ещё {count}',
  },
};

export const feelMessages = { 'en-EN': en, 'ru-RU': ru } as const;
