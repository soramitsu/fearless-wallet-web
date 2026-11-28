import { describe, expect, it, vi } from 'vitest';

vi.mock('@/controllers', () => ({
  accountController: { getLang: () => 'en-EN' },
}));

import { i18n } from '@/locales';
import akkadian from '@/locales/akk/translation.json';
import egyptian from '@/locales/egy/translation.json';
import english from '@/locales/en/translation.json';
import russian from '@/locales/ru/translation.json';
import { dappSigningMessages } from '@/locales/dappSigningMessages';

const KEY = 'signingReview.dappSigningPaused';
const catalogs = {
  'en-EN': english,
  'ru-RU': russian,
  'akk-Xsux-x-old': akkadian,
  'egy-Egyp': egyptian,
} as const;

describe('dApp signing pause message', () => {
  it.each(Object.keys(catalogs) as (keyof typeof catalogs)[])('says in %s that signing for the family is paused', (lang) => {
    const sentence = dappSigningMessages[lang].signingReview.dappSigningPaused;

    expect(i18n.global.te(KEY, lang)).toBe(true);
    expect(i18n.global.t(KEY, { family: 'EVM' }, { locale: lang })).toBe(sentence.replace('{family}', 'EVM'));
    expect(sentence.match(/\{family\}/g)).toHaveLength(1);
    expect(sentence).toBe(sentence.normalize('NFC'));
    // Registering the sentence keeps the rest of the signing review's messages in that locale.
    expect(i18n.global.t('signingReview.crossChainRefused', {}, { locale: lang })).toBe(
      catalogs[lang].signingReview.crossChainRefused
    );
  });

  it('gives every locale its own sentence and leaves the shared catalogs as they are', () => {
    const sentences = Object.values(dappSigningMessages).map(({ signingReview }) => signingReview.dappSigningPaused);

    expect(new Set(sentences).size).toBe(Object.keys(catalogs).length);
    for (const catalog of Object.values(catalogs)) expect(catalog).not.toHaveProperty(KEY);
  });
});
