// Like the dashboard bundle, these messages stay outside translation.json until reviewed Akkadian and Egyptian
// translations are available. Their base catalogs retain exact English-key parity; these additions fall back to English.
// Register at locale initialization because the warnings and creation flow are also available outside the dashboard.
const en = {
  exposureNotice: {
    importedReminder:
      'This wallet uses an imported key. For a fresh start, create a new wallet in Fearless and transfer your funds to it.',
    guide: {
      createImportedText:
        'Create it here to generate a new recovery phrase. Importing an existing phrase, key or JSON file restores the same wallet instead.',
      migrateLink: 'SORA migration information on Polkaswap',
      migrateLimitation: 'Fearless cannot sign Polkaswap migration requests with old wallets.',
    },
  },
  ux: {
    walletGenerationExpired:
      'Your wallet creation session expired. Continue to generate and back up a new recovery phrase. Do not use the previous phrase.',
  },
};

const ru: typeof en = {
  exposureNotice: {
    importedReminder:
      'Этот кошелёк использует импортированный ключ. Чтобы начать с новой фразой восстановления, создайте новый кошелёк в Fearless и переведите на него средства.',
    guide: {
      createImportedText:
        'Создайте его здесь, чтобы получить новую фразу восстановления. Импорт существующей фразы, ключа или файла JSON восстанавливает прежний кошелёк.',
      migrateLink: 'Информация о переносе аккаунта SORA на Polkaswap',
      migrateLimitation: 'Fearless не может подписывать запросы на перенос аккаунта Polkaswap с помощью старых кошельков.',
    },
  },
  ux: {
    walletGenerationExpired:
      'Сеанс создания кошелька истёк. Нажмите «Продолжить», чтобы получить и сохранить новую фразу восстановления. Не используйте предыдущую фразу.',
  },
};

export const walletUpgradeMessages = { 'en-EN': en, 'ru-RU': ru } as const;
