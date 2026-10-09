import { describe, expect, it, vi } from 'vitest';

vi.mock('@/controllers', () => ({
  accountController: {
    getLang: () => 'en-EN',
  },
}));

import egyptian from '@/locales/egy/translation.json';
import english from '@/locales/en/translation.json';
import { i18n, isLang, languageOptions } from '@/locales';

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
const containsHieroglyph = (value: string): boolean => /[\u{13000}-\u{1342F}]/u.test(value);

const allowedNonHieroglyphMessages = {
  'accounts.json': 'JSON',
  'assets.polkaswap': 'Polkaswap',
  'browserTabs.google': 'Google',
  'browserTabs.polkaswap': 'Polkaswap',
  'common.dapps': 'DApps',
  'common.fearlessWallet': 'Fearless Wallet',
  'common.twitter': 'Twitter',
  'common.wc': 'Wallet Connect',
  'menu.polkaswap': 'Polkaswap',
  'ux.tonNetwork': 'TON',
} satisfies FlatMessages;

const allowedLatinTerms = new Set(
  [
    'bitcoin',
    'btc',
    'connect',
    'dapp',
    'dapps',
    'defi',
    'demeter',
    'drive',
    'eth',
    'ethereum',
    'etherscan',
    'evm',
    'faq',
    'fearless',
    'github',
    'google',
    'instagram',
    'iroha',
    'irohaconnect',
    'json',
    'kusd',
    'lp',
    'matrix',
    'medium',
    'moonbeam',
    'moonriver',
    'nexus',
    'nft',
    'nfts',
    'npos',
    'polkadot',
    'polkamarkt',
    'polkaswap',
    'qr',
    'qr-code',
    'sdk',
    'solana',
    'sora',
    'subscan',
    'substrate',
    'taira',
    'telegram',
    'ton',
    'tonconnect',
    'toncoin',
    'tonviewer',
    'twitter',
    'uranai',
    'url',
    'v1',
    'v2',
    'val',
    'wallet',
    'walletconnect',
    'wiki',
    'xcm',
    'xor',
    'youtube',
  ].sort()
);

const semanticAnchors = {
  account: '𓇋𓊪𓏥 𓈖 𓂋𓈖',
  blockchain: '𓈙𓈖𓏥 𓈖 𓅓𓆓𓄿𓅱𓏏𓏥',
  network: '𓄡𓈖𓅓𓏥',
  networkFee: '𓇋𓋴𓅱 𓈖 𓄡𓈖𓅓𓏥',
  password: '𓂋𓈖 𓈙𓇾𓍔𓄿𓏴𓏛',
  wallet: '𓉒',
} as const;

const englishMessages = flattenMessages(english);
const egyptianMessages = flattenMessages(egyptian);

describe('Classical Middle Egyptian hieroglyph locale', () => {
  it('is selectable through the canonical Ancient Egyptian hieroglyph tag', () => {
    const option = languageOptions.find(({ value }) => value === 'egy-Egyp');

    expect(option).toEqual({ name: '𓂋 𓈖 𓆎𓅓𓏏 · R n Kmt', value: 'egy-Egyp' });
    expect(Intl.getCanonicalLocales(option!.value)).toEqual(['egy-Egyp']);
    expect(isLang(option!.value)).toBe(true);
    expect(isLang('egy-Latn')).toBe(false);
    expect(i18n.global.availableLocales).toContain('egy-Egyp');
  });

  it('renders the locale through Vue I18n without falling back to English', () => {
    const previousLocale = i18n.global.locale.value;

    try {
      i18n.global.locale.value = 'egy-Egyp';

      expect(i18n.global.t('common.password')).toContain(semanticAnchors.password);
      expect(i18n.global.t('authorize.accountsConnected', { url: 'dapp.example' })).toMatch(
        /[\u{13000}-\u{1342F}].*dapp\.example|dapp\.example.*[\u{13000}-\u{1342F}]/u
      );
      expect(i18n.global.t('welcome.enterReset', { phrase: 'Reset wallet' })).toMatch(
        /[\u{13000}-\u{1342F}].*Reset wallet|Reset wallet.*[\u{13000}-\u{1342F}]/u
      );
      expect(i18n.global.t('authorize.connectCountAccounts', { count: 2 })).toMatch(
        /[\u{13000}-\u{1342F}].*2|2.*[\u{13000}-\u{1342F}]/u
      );
      expect(i18n.global.n(1234.5, 'decimal')).toBe('1,234.5000');
    } finally {
      i18n.global.locale.value = previousLocale;
    }
  });

  it('covers every English message without extra or structurally missing entries', () => {
    expect(Object.keys(egyptianMessages).sort()).toEqual(Object.keys(englishMessages).sort());
    expect(Object.keys(egyptianMessages)).toHaveLength(Object.keys(englishMessages).length);
  });

  it('preserves runtime tokens, plural branches, numeric literals, and intentional empty messages', () => {
    for (const [key, source] of Object.entries(englishMessages)) {
      const translation = egyptianMessages[key];

      expect(interpolationTokens(translation), key).toEqual(interpolationTokens(source));
      expect(translation.split('|'), key).toHaveLength(source.split('|').length);
      expect(numericLiterals(translation), key).toEqual(numericLiterals(source));
      expect(translation === '', key).toBe(source === '');
    }
  });

  it('uses normalized Unicode hieroglyph strings', () => {
    for (const [key, translation] of Object.entries(egyptianMessages)) {
      expect(translation.normalize('NFC'), key).toBe(translation);
    }
  });

  it('uses hieroglyphs in every non-empty explanatory message', () => {
    const nonEmptyMessagesWithoutHieroglyphs = Object.entries(egyptianMessages)
      .filter(([, value]) => value !== '' && !containsHieroglyph(value))
      .map(([key]) => key)
      .sort();

    expect(nonEmptyMessagesWithoutHieroglyphs).toEqual(Object.keys(allowedNonHieroglyphMessages).sort());

    for (const [key, value] of Object.entries(allowedNonHieroglyphMessages)) {
      expect(egyptianMessages[key], key).toBe(value);
    }
  });

  it('limits non-Egyptian text to an explicit proper-name and protocol allowlist', () => {
    const unexpectedTerms: string[] = [];

    for (const [key, translation] of Object.entries(egyptianMessages)) {
      const withoutTokens = translation.replace(/\{[^{}]+\}|%s/g, '');
      // Preserve the exact TON proper name only in its network description.
      const textWithoutRuntimeTokens = key === 'ux.tonNetworkDescription'
        ? withoutTokens.replace(/\bThe Open Network\b/g, '')
        : withoutTokens;
      const latinTerms = textWithoutRuntimeTokens.match(/\p{Script=Latin}[\p{Script=Latin}\p{Mark}\d-]*/gu) ?? [];

      for (const term of latinTerms) {
        if (!allowedLatinTerms.has(term.toLocaleLowerCase('en-US'))) unexpectedTerms.push(`${key}: ${term}`);
      }

      expect(textWithoutRuntimeTokens, key).not.toMatch(/\p{Script=Cyrillic}/u);
    }

    expect(unexpectedTerms).toEqual([]);
  });

  it('keeps the core poetic calques semantically stable', () => {
    for (const [sourceTerm, anchor] of [
      ['account', semanticAnchors.account],
      ['network fee', semanticAnchors.networkFee],
      ['password', semanticAnchors.password],
    ] as const) {
      for (const [key, source] of Object.entries(englishMessages)) {
        if (source.toLocaleLowerCase('en-US').includes(sourceTerm)) {
          expect(egyptianMessages[key], key).toContain(anchor);
        }
      }
    }

    expect(egyptianMessages['menu.wallet']).toContain(semanticAnchors.wallet);
    expect(egyptianMessages['accounts.account']).toContain(semanticAnchors.account);
    expect(egyptianMessages['staking.defaultPayout']).toContain(semanticAnchors.account);
    expect(egyptianMessages['staking.defaultPayout']).not.toContain(semanticAnchors.wallet);
    expect(egyptianMessages['common.network']).toContain(semanticAnchors.network);
    expect(egyptianMessages['assets.feeDescription']).toContain(semanticAnchors.blockchain);
    expect(egyptianMessages['assets.feeDescription']).toContain(semanticAnchors.networkFee);

    const allMessages = Object.values(egyptianMessages).join('\n');

    expect(allMessages).not.toContain('𓋴𓐍𓈖');
    expect(allMessages).not.toContain('𓇋𓊪𓏏𓏤');
  });

  it('keeps safety-sensitive states and warnings semantically distinct', () => {
    const distinctPairs = [
      ['addWallet.google.somethingWrong', 'googleExport.uploading'],
      ['addWallet.google.saved', 'common.attention'],
      ['addWallet.google.saved', 'common.warning'],
      ['addWallet.importTypes.mnemonicPassphrase', 'addWallet.confirmPassphrase'],
      ['assets.transactionMayFail', 'assets.transactionFrontrun'],
      ['assets.reserved', 'assets.frozen'],
      ['assets.frozen', 'assets.transferable'],
      ['assets.locked', 'common.sign'],
      ['assets.locked', 'common.close'],
      ['assets.amount', 'header.networkManagement.tabs.popular'],
      ['assets.value', 'crossChainPage.fees'],
      ['assets.direction', 'assets.to'],
      ['irohaConnectPage.status.pairing', 'irohaConnectPage.status.connected'],
      ['irohaConnectPage.payload', 'metadata.text'],
      ['nft.collection', 'polkamarktPage.shares'],
      ['polkamarktPage.status.closed', 'polkamarktPage.status.locked'],
      ['staking.regular', 'common.approve'],
      ['staking.regular', 'common.confirm'],
      ['staking.regular', 'common.confirmation'],
    ] as const;

    for (const [left, right] of distinctPairs) {
      expect(egyptianMessages[left], `${left} / ${right}`).not.toBe(egyptianMessages[right]);
    }

    expect(egyptianMessages['addWallet.google.somethingWrong']).toContain('𓃀𓇋𓈖');
    expect(egyptianMessages['googleExport.uploading']).toContain('𓉔𓄿𓃀');
    expect(egyptianMessages['assets.slippage']).toContain('𓇋𓋴𓅱');
    expect(egyptianMessages['assets.transactionPending']).toContain('𓁷 𓅱𓄿𓎛');
    expect(egyptianMessages['addWallet.confirmPassphrase']).toContain('𓅓𓄿𓂝 𓐙');
    expect(egyptianMessages['header.networkManagement.tabs.popular']).toContain('𓅓𓂋𓇌');
    expect(egyptianMessages['crossChainPage.fees']).toContain('𓅱𓄿𓏏');
    expect(egyptianMessages['assets.direction']).toContain('𓅱𓄿𓏏');
    expect(egyptianMessages['irohaConnectPage.payload']).toContain('𓋴𓈙');
    expect(egyptianMessages['polkamarktPage.shares']).toContain('𓊪𓋴𓈙𓏏');

    for (const key of [
      'accounts.downloadFile',
      'assets.extrinsic',
      'assets.filters.popularity',
      'assets.frozen',
      'assets.insufficientLiquidity',
      'assets.legacyCrowdloan',
      'assets.market',
      'assets.maxSales',
      'assets.recent',
      'assets.reserved',
      'assets.slippage',
      'assets.summary',
      'assets.transferable',
    ]) {
      expect(egyptianMessages[key], key).not.toMatch(/^𓅓𓂧𓅱(?: 𓅓𓂧𓅱)?$/u);
    }
  });
  it('keeps task labels, funding states and recipient checks consistent', () => {
    expect(egyptianMessages['primaryMenu.portfolio']).toBe(egyptianMessages['menu.wallet']);
    expect(egyptianMessages['primaryMenu.polkaswap']).toBe(egyptianMessages['assets.swap']);
    expect(egyptianMessages['primaryMenu.crossChain']).toBe(egyptianMessages['assets.transfer']);
    expect(egyptianMessages['primaryMenu.defi']).toBe(egyptianMessages['defiHub.title']);
    expect(new Set(['loadingPositions', 'incompletePositions', 'positionsUnavailable', 'positionsEmpty']
      .map((key) => egyptianMessages[`ux.${key}`])).size).toBe(4);
    expect(egyptianMessages['ux.verifyRecipient']).toContain('𓊨 𓈖 𓂋𓈖');
    expect(egyptianMessages['ux.verifyRecipient']).toContain('𓄡𓈖𓅓𓏥');
    expect(egyptianMessages['ux.tonNetworkDescription']).toContain('The Open Network');
  });

});
