// Kept out of translation.json until reviewed Akkadian and Egyptian translations exist; other locales show English.
const en = {
  restoresOtherAccount:
    'This wallet was made with a derivation path or password, so this phrase alone restores a different account: keep the path or password with it, or use the JSON export.',
};

const ru: typeof en = {
  restoresOtherAccount:
    'Этот кошелёк создан с путём деривации или паролем, поэтому одна эта фраза восстановит другой аккаунт: сохраните вместе с ней путь или пароль либо используйте экспорт JSON.',
};

export const derivedWalletExportMessages = { 'en-EN': en, 'ru-RU': ru } as const;
