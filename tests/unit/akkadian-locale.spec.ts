import { describe, expect, it, vi } from 'vitest';

vi.mock('@/controllers', () => ({
  accountController: {
    getLang: () => 'en-EN',
  },
}));

import akkadian from '@/locales/akk/translation.json';
import english from '@/locales/en/translation.json';
import { i18n, languageOptions } from '@/locales';

type FlatMessages = Record<string, string>;

const flattenMessages = (messages: Record<string, unknown>, prefix = ''): FlatMessages =>
  Object.entries(messages).reduce<FlatMessages>((flat, [key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;

    if (typeof value === 'string') {
      flat[path] = value;
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(flat, flattenMessages(value as Record<string, unknown>, path));
    } else {
      throw new TypeError(`Locale value at ${path} must be a string or an object`);
    }

    return flat;
  }, {});

const interpolationTokens = (value: string): string[] => (value.match(/\{[^{}]+\}|%s/g) ?? []).sort();
const numericLiterals = (value: string): string[] => value.match(/\d+/g) ?? [];

const englishMessages = flattenMessages(english);
const akkadianMessages = flattenMessages(akkadian);

describe('Old Akkadian locale', () => {
  it('is selectable through a valid language tag', () => {
    const option = languageOptions.find(({ value }) => value === 'akk-Latn-x-old');

    expect(option).toEqual({ name: 'Akkadûm labīrum', value: 'akk-Latn-x-old' });
    expect(Intl.getCanonicalLocales(option!.value)).toEqual(['akk-Latn-x-old']);
    expect(i18n.global.availableLocales).toContain('akk-Latn-x-old');
  });

  it('renders the locale through Vue I18n without falling back to English', () => {
    const previousLocale = i18n.global.locale.value;

    try {
      i18n.global.locale.value = 'akk-Latn-x-old';

      expect(i18n.global.t('common.password')).toBe('Awāt pirištim');
      expect(i18n.global.t('authorize.accountsConnected', { url: 'dapp.example' })).toBe(
        'Ṭuppāt šumim ana dapp.example kaṣrū'
      );
      expect(i18n.global.t('welcome.enterReset', { phrase: 'Reset wallet' })).toBe('Ana alākim, ‘Reset wallet’ šukun');
      expect(i18n.global.t('authorize.connectCountAccounts', { count: 2 })).toBe('2 ṭuppāt šumim kuṣur');
      expect(i18n.global.n(1234.5, 'decimal')).toBe('1,234.5000');
    } finally {
      i18n.global.locale.value = previousLocale;
    }
  });

  it('covers every English message without extra or structurally missing entries', () => {
    expect(Object.keys(akkadianMessages).sort()).toEqual(Object.keys(englishMessages).sort());
    expect(Object.keys(akkadianMessages)).toHaveLength(Object.keys(englishMessages).length);
  });

  it('preserves runtime tokens, plural branches, numeric literals, and intentional empty messages', () => {
    for (const [key, source] of Object.entries(englishMessages)) {
      const translation = akkadianMessages[key];

      expect(interpolationTokens(translation), key).toEqual(interpolationTokens(source));
      expect(translation.split('|'), key).toHaveLength(source.split('|').length);
      expect(numericLiterals(translation), key).toEqual(numericLiterals(source));
      expect(translation === '', key).toBe(source === '');
    }
  });

  it('uses normalized scholarly transliteration', () => {
    for (const [key, translation] of Object.entries(akkadianMessages)) {
      expect(translation.normalize('NFC'), key).toBe(translation);
    }
  });

  it('leaves only proper names, protocols, formats, or the source-empty message verbatim', () => {
    const unchanged = Object.entries(akkadianMessages)
      .filter(([key, value]) => value === englishMessages[key])
      .map(([key]) => key)
      .sort();

    expect(unchanged).toEqual(
      [
        'accounts.json',
        'assets.polkaswap',
        'browserTabs.google',
        'browserTabs.polkaswap',
        'common.dapps',
        'common.fearlessWallet',
        'common.twitter',
        'common.wc',
        'menu.polkaswap',
        'ux.tonNetwork',
        'walletConnect.notifications.sessionApproved.message',
      ].sort()
    );
  });

  it('keeps the core semantic metaphors stable', () => {
    expect(akkadianMessages['common.password']).toBe('Awāt pirištim');
    expect(akkadianMessages['addWallet.enterPassphrase']).toBe('Awāt ḫasāsim šukun');
    expect(akkadianMessages['addWallet.enterPassphrase']).not.toBe(akkadianMessages['addWallet.enterPassword']);
    expect(akkadianMessages['common.network']).toBe('Riksum');
    expect(akkadianMessages['accounts.account']).toBe('Ṭuppum ša šumim');
    expect(akkadianMessages['menu.wallet']).toBe('Kīsum');
    expect(akkadianMessages['assets.feeDescription']).toContain('riksāt ṭuppī');
    expect(akkadianMessages['pools.liquidityPools']).toBe('Būrāt mê kaspim');
    expect(akkadianMessages['settingsPage.language']).toBe('Lišānum');
  });
  it('keeps task labels, funding states and recipient checks consistent', () => {
    expect(akkadianMessages['primaryMenu.portfolio']).toBe(akkadianMessages['menu.wallet']);
    expect(akkadianMessages['primaryMenu.polkaswap']).toBe(akkadianMessages['assets.swap']);
    expect(akkadianMessages['primaryMenu.crossChain']).toBe(akkadianMessages['assets.transfer']);
    expect(akkadianMessages['primaryMenu.defi']).toBe(akkadianMessages['defiHub.title']);
    expect(new Set(['loadingPositions', 'incompletePositions', 'positionsUnavailable', 'positionsEmpty']
      .map((key) => akkadianMessages[`ux.${key}`])).size).toBe(4);
    expect(akkadianMessages['ux.verifyRecipient']).toContain('Ašram');
    expect(akkadianMessages['ux.verifyRecipient']).toContain('riksam');
    expect(akkadianMessages['ux.tonNetworkDescription']).toContain('The Open Network');
  });

});
