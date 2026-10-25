export function walletGenerationExpiredMessage(locale: string): string {
  return locale === 'ru-RU'
    ? 'Сеанс создания кошелька истёк. Нажмите «Продолжить», чтобы получить и сохранить новую фразу восстановления. Не используйте предыдущую фразу.'
    : 'Your wallet creation session expired. Continue to generate and back up a new recovery phrase. Do not use the previous phrase.';
}
