import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/controllers', () => ({
  accountController: { getLang: () => 'en-EN' },
}));

import { i18n } from '@/locales';
import akkadian from '@/locales/akk/translation.json';
import egyptian from '@/locales/egy/translation.json';
import english from '@/locales/en/translation.json';
import russian from '@/locales/ru/translation.json';
import { walletUpgradeMessages } from '@/locales/walletUpgradeMessages';

const initialLocale = i18n.global.locale.value;
const translate = (key: string) => i18n.global.t(key, {}, { missingWarn: false, fallbackWarn: false });

describe('wallet upgrade supplemental messages', () => {
  afterEach(() => {
    i18n.global.locale.value = initialLocale;
  });

  it.each(['en-EN', 'ru-RU'] as const)('registers all warning and creation messages for %s before any screen mounts', (lang) => {
    i18n.global.locale.value = lang;
    const messages = walletUpgradeMessages[lang];

    expect(translate('exposureNotice.importedReminder')).toBe(messages.exposureNotice.importedReminder);
    expect(translate('exposureNotice.guide.createImportedText')).toBe(messages.exposureNotice.guide.createImportedText);
    expect(translate('exposureNotice.guide.migrateLink')).toBe(messages.exposureNotice.guide.migrateLink);
    expect(translate('ux.walletGenerationExpired')).toBe(messages.ux.walletGenerationExpired);
    expect(i18n.global.te('ux.walletGenerationExpired', lang)).toBe(true);
  });

  it.each(['akk-Xsux-x-old', 'egy-Egyp'] as const)('uses the English fallback for the additions in %s', (lang) => {
    i18n.global.locale.value = lang;
    const messages = walletUpgradeMessages['en-EN'];

    expect(translate('exposureNotice.importedReminder')).toBe(messages.exposureNotice.importedReminder);
    expect(translate('exposureNotice.guide.createImportedText')).toBe(messages.exposureNotice.guide.createImportedText);
    expect(translate('exposureNotice.guide.migrateLink')).toBe(messages.exposureNotice.guide.migrateLink);
    expect(translate('ux.walletGenerationExpired')).toBe(messages.ux.walletGenerationExpired);
    expect(i18n.global.te('ux.walletGenerationExpired', lang)).toBe(false);
  });

  it('does not mutate the shared base catalogs when registering supplemental messages', () => {
    for (const messages of [english, russian]) {
      expect(messages).not.toHaveProperty('exposureNotice.importedReminder');
      expect(messages).not.toHaveProperty('exposureNotice.guide.createImportedText');
      expect(messages).not.toHaveProperty('ux.walletGenerationExpired');
    }
  });

  it.each([
    ['en-EN', english],
    ['ru-RU', russian],
    ['akk-Xsux-x-old', akkadian],
    ['egy-Egyp', egyptian],
  ] as const)('preserves existing nested warning and UX messages in %s', (lang, messages) => {
    i18n.global.locale.value = lang;

    expect(translate('exposureNotice.guide.createText')).toBe(messages.exposureNotice.guide.createText);
    expect(translate('exposureNotice.title')).toBe(messages.exposureNotice.title);
    expect(translate('ux.retry')).toBe(messages.ux.retry);
    expect(translate('common.password')).toBe(messages.common.password);
  });
});
