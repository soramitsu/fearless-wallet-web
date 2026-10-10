import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/controllers', () => ({
  accountController: {
    getLang: () => 'en-EN',
  },
}));

import akkadian from '@/locales/akk/translation.json';
import english from '@/locales/en/translation.json';
import { akkadianOnboardingStories } from '@/locales/akk/onboarding';
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
const cuneiformSigns = (value: string): string[] => value.match(/[\u{12000}-\u{1254F}]/gu) ?? [];
const containsCuneiform = (value: string): boolean => cuneiformSigns(value).length > 0;
// Normalized transliteration marks; none may survive the conversion to cuneiform.
const transliterationMarks = /[āēīūâêîûšṣṭḫʾ]/iu;
// Every sign of the locale's fixed syllabary (see the sign list in src/locales/akk/README.md). Each phonetic
// syllable has exactly one of these signs, so a sign outside the list means a word was spelled another way.
const syllabarySigns = new Set(
  '𒀀𒀉𒀊𒀜𒀝𒀠𒀪𒀭𒀸𒁀𒁁𒁉𒁍𒁕𒁲𒁺𒂊𒂖𒂗𒂵𒄀𒄑𒄖𒄠𒄩𒄭𒄴𒄷𒄿𒅀𒅁𒅅𒅆𒅈𒅋𒅎𒅔𒅕𒅖𒅗𒆠𒆥𒆪𒆷𒇷𒇻𒈠𒈨𒈪𒈬𒈾𒉆𒉈𒉌𒉡𒉺𒉿𒊌𒊍𒊏𒊑𒊒𒊓𒊭𒊺𒊻𒋗𒋛𒋡𒋢𒋫𒋼𒋾𒌅𒌌𒌍𒌑𒌒𒌓𒌔𒌝𒌦𒌨𒍑𒍝𒍣𒍪'
);

const readRepositoryFile = (path: string): string => readFileSync(resolve(__dirname, '../..', path), 'utf8');

const allowedLatinMessages = {
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
    'element',
    'eth',
    'ethereum',
    'etherscan',
    'evm',
    'extension',
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
    'mainnet',
    'matrix',
    'medium',
    'moonbeam',
    'moonriver',
    'network',
    'nexus',
    'nft',
    'nfts',
    'npos',
    'open',
    'polkadot',
    'polkamarkt',
    'polkaswap',
    'qr',
    'sdk',
    'solana',
    'sora',
    'subscan',
    'substrate',
    'taira',
    'telegram',
    'the',
    'ton',
    'toncoin',
    'tonconnect',
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

// Stable cuneiform spellings of the locale's semantic compounds (see src/locales/akk/README.md).
const semanticAnchors = {
  password: '𒀀𒉿𒀜 𒉿𒊑𒅖𒋾𒅎',
  recoveryPhrase: '𒀀𒉿𒀜 𒄩𒊓𒋛𒅎',
  account: '𒌅𒌒𒁍𒌝 𒊭 𒋗𒈪𒅎',
  network: '𒊑𒅅𒋢𒌝',
  networkObject: '𒊑𒅅𒊓𒄠',
  wallet: '𒆠𒋢𒌝',
  blockchain: '𒊑𒅅𒊓𒀜 𒌅𒌒𒉿',
  liquidity: '𒈨𒂊 𒅗𒊍𒉿𒅎',
  language: '𒇷𒊭𒉡𒌝',
  address: '𒀸𒊏𒄠',
} as const;

const englishMessages = flattenMessages(english);
const akkadianMessages = flattenMessages(akkadian);
const onboardingText = [...akkadianOnboardingStories.new, ...akkadianOnboardingStories.regular].flatMap(
  ({ title, description }) => [title, description]
);
const akkadianOption = languageOptions.find(({ value }) => value === 'akk-Xsux-x-old');

describe('Old Akkadian cuneiform locale', () => {
  it('is selectable through the cuneiform script tag', () => {
    expect(akkadianOption).toEqual({ name: '𒀝𒅗𒁺𒌑𒌝 𒆷𒁉𒊒𒌝 · Akkadûm labīrum', value: 'akk-Xsux-x-old' });
    expect(Intl.getCanonicalLocales(akkadianOption!.value)).toEqual(['akk-Xsux-x-old']);
    expect(isLang(akkadianOption!.value)).toBe(true);
    expect(isLang('akk-Latn-x-old')).toBe(false);
    expect(i18n.global.availableLocales).toContain('akk-Xsux-x-old');
    expect(i18n.global.availableLocales).not.toContain('akk-Latn-x-old');
  });

  it('renders the locale through Vue I18n without falling back to English', () => {
    const previousLocale = i18n.global.locale.value;

    try {
      i18n.global.locale.value = 'akk-Xsux-x-old';

      expect(i18n.global.t('common.password')).toBe(semanticAnchors.password);
      expect(i18n.global.t('authorize.accountsConnected', { url: 'dapp.example' })).toBe(
        '𒌅𒌒𒉺𒀜 𒋗𒈪𒅎 𒀀𒈾 dapp.example 𒅗𒊍𒊒'
      );
      expect(i18n.global.t('welcome.enterReset', { phrase: 'Reset wallet' })).toBe('𒀀𒈾 𒀀𒆷𒆠𒅎, ‘Reset wallet’ 𒋗𒆪𒌦');
      expect(i18n.global.t('authorize.connectCountAccounts', { count: 2 })).toBe('2 𒌅𒌒𒉺𒀜 𒋗𒈪𒅎 𒆪𒍪𒌨');
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

  it('uses normalized Unicode strings', () => {
    for (const [key, translation] of Object.entries(akkadianMessages)) {
      expect(translation.normalize('NFC'), key).toBe(translation);
    }
  });

  it('writes every non-empty explanatory message and onboarding story in cuneiform', () => {
    const latinOnly = Object.entries(akkadianMessages)
      .filter(([, value]) => value !== '' && !containsCuneiform(value))
      .map(([key]) => key)
      .sort();

    expect(latinOnly).toEqual(Object.keys(allowedLatinMessages).sort());

    for (const [key, value] of Object.entries(allowedLatinMessages)) {
      expect(akkadianMessages[key], key).toBe(value);
    }

    expect(onboardingText.every(containsCuneiform)).toBe(true);
  });

  it('leaves no Latin transliteration behind, only an explicit proper-name and protocol allowlist', () => {
    const unexpectedTerms: string[] = [];

    for (const [key, translation] of [
      ...Object.entries(akkadianMessages),
      ...onboardingText.map((text, index) => [`onboarding.${index}`, text]),
    ]) {
      const withoutTokens = translation.replace(/\{[^{}]+\}|%s/g, '');
      // Preserve the exact TON proper name only in its network description.
      const text = key === 'ux.tonNetworkDescription' ? withoutTokens.replace(/\bThe Open Network\b/g, '') : withoutTokens;

      expect(text, key).not.toMatch(transliterationMarks);
      expect(text, key).not.toMatch(/\p{Script=Cyrillic}/u);

      // A Latin name may carry an Akkadian enclitic after a hyphen (SDK v2-𒈠); the hyphen is not part of the name.
      for (const term of text.match(/\p{Script=Latin}(?:[\p{Script=Latin}\p{Mark}\d]|-(?=[\p{Script=Latin}\d]))*/gu) ?? []) {
        if (!allowedLatinTerms.has(term.toLocaleLowerCase('en-US'))) unexpectedTerms.push(`${key}: ${term}`);
      }
    }

    expect(unexpectedTerms).toEqual([]);
  });

  it('only uses signs that the bundled Noto Sans Cuneiform font covers', () => {
    const fontRanges = JSON.parse(readRepositoryFile('node_modules/@fontsource/noto-sans-cuneiform/unicode.json'))
      .cuneiform.split(',')
      .map((range: string) => range.replace('U+', '').split('-').map((bound) => Number.parseInt(bound, 16)));
    const covered = (sign: string) =>
      fontRanges.some(([low, high = low]: number[]) => sign.codePointAt(0)! >= low && sign.codePointAt(0)! <= high);
    const signs = new Set(
      [...Object.values(akkadianMessages), ...onboardingText, akkadianOption!.name].flatMap(cuneiformSigns)
    );

    expect(signs.size).toBeGreaterThan(50);
    expect([...signs].filter((sign) => !covered(sign))).toEqual([]);
  });

  it('spells every word with the signs of the fixed syllabary', () => {
    const offSyllabary = [
      ...Object.entries(akkadianMessages),
      ...onboardingText.map((text, index) => [`onboarding.${index}`, text]),
      ['languageOptions.akk', akkadianOption!.name],
    ].flatMap(([key, value]) =>
      cuneiformSigns(value)
        .filter((sign) => !syllabarySigns.has(sign))
        .map((sign) => `${key}: ${sign} U+${sign.codePointAt(0)!.toString(16).toUpperCase()}`)
    );

    expect(syllabarySigns.size).toBe(87);
    expect(offSyllabary).toEqual([]);
  });

  it('bundles the cuneiform font into every text fallback stack', () => {
    expect(readRepositoryFile('src/styles/index.ts')).toContain("import '@fontsource/noto-sans-cuneiform';");
    expect(readRepositoryFile('package.json')).toContain('"@fontsource/noto-sans-cuneiform"');

    for (const [path, stack] of [
      ['src/styles/soramitsu-variables.scss', /--s-font-family-default:[^;]*'Noto Sans Cuneiform'/],
      ['src/screens/onboarding/Onboarding.vue', /font-family: Unbounded,[^;]*'Noto Sans Cuneiform'/],
      ['src/screens/onboarding/OnboardingStory.vue', /font-family: Unbounded,[^;]*'Noto Sans Cuneiform'/],
    ] as const) {
      expect(readRepositoryFile(path), path).toMatch(stack);
    }
  });

  it('keeps the core semantic compounds stable', () => {
    expect(akkadianMessages['common.password']).toBe(semanticAnchors.password);
    expect(akkadianMessages['addWallet.enterPassphrase']).toContain(semanticAnchors.recoveryPhrase);
    expect(akkadianMessages['addWallet.enterPassphrase']).not.toBe(akkadianMessages['addWallet.enterPassword']);
    expect(akkadianMessages['common.network']).toBe(semanticAnchors.network);
    expect(akkadianMessages['accounts.account']).toBe(semanticAnchors.account);
    expect(akkadianMessages['menu.wallet']).toBe(semanticAnchors.wallet);
    expect(akkadianMessages['assets.feeDescription']).toContain(semanticAnchors.blockchain);
    expect(akkadianMessages['pools.liquidityPools']).toContain(semanticAnchors.liquidity);
    expect(akkadianMessages['settingsPage.language']).toBe(semanticAnchors.language);

    for (const [sourceTerm, anchor] of [
      ['network fee', '𒈪𒅅'],
      ['private key', '𒈾𒄠𒍝𒀝'],
      ['indexer', '𒌅𒌒𒊭'],
      ['testnet', '𒆷𒈠𒁲𒅎'],
      ['not confirmed yet', '𒀀𒁲𒉌 𒌌'],
    ] as const) {
      for (const [key, source] of Object.entries(englishMessages)) {
        if (source.toLocaleLowerCase('en-US').includes(sourceTerm)) {
          expect(akkadianMessages[key], `${key} (${sourceTerm})`).toContain(anchor);
        }
      }
    }

    // SOL, the Solana coin, is "silver of Solana", never the Latin ticker.
    for (const [key, source] of Object.entries(englishMessages)) {
      if (/\bSOL\b/.test(source)) expect(akkadianMessages[key], key).toContain('𒅗𒊍𒁍𒌝 𒊭 Solana');
    }
  });

  it('keeps task labels, funding states and recipient checks consistent', () => {
    expect(akkadianMessages['primaryMenu.portfolio']).toBe(akkadianMessages['menu.wallet']);
    expect(akkadianMessages['primaryMenu.polkaswap']).toBe(akkadianMessages['assets.swap']);
    expect(akkadianMessages['primaryMenu.crossChain']).toBe(akkadianMessages['assets.transfer']);
    expect(akkadianMessages['primaryMenu.defi']).toBe(akkadianMessages['defiHub.title']);
    expect(new Set(['loadingPositions', 'incompletePositions', 'positionsUnavailable', 'positionsEmpty']
      .map((key) => akkadianMessages[`ux.${key}`])).size).toBe(4);
    expect(akkadianMessages['ux.verifyRecipient']).toContain(semanticAnchors.address);
    expect(akkadianMessages['ux.verifyRecipient']).toContain(semanticAnchors.networkObject);
    expect(akkadianMessages['ux.tonNetworkDescription']).toContain('The Open Network');
  });
});
