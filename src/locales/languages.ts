export const OLD_AKKADIAN_LOCALE = 'akk-Xsux-x-old' as const;
export const EGYPTIAN_HIEROGLYPH_LOCALE = 'egy-Egyp' as const;

export const languageOptions = [
  { name: 'English', value: 'en-EN' },
  { name: 'Русский', value: 'ru-RU' },
  { name: '𒀝𒅗𒁺𒌑𒌝 𒆷𒁉𒊒𒌝 · Akkadûm labīrum', value: OLD_AKKADIAN_LOCALE },
  { name: '𓂋 𓈖 𓆎𓅓𓏏 · R n Kmt', value: EGYPTIAN_HIEROGLYPH_LOCALE },
] as const;

export type Lang = (typeof languageOptions)[number]['value'];

const languageValues = new Set<string>(languageOptions.map(({ value }) => value));

// Tags that earlier builds persisted for a locale which has since changed script.
const legacyLanguageTags: Readonly<Record<string, Lang>> = {
  'akk-Latn-x-old': OLD_AKKADIAN_LOCALE,
};

export const isLang = (value: unknown): value is Lang => typeof value === 'string' && languageValues.has(value);

export const resolveLang = (value: unknown): Lang | undefined => {
  if (isLang(value)) return value;
  if (typeof value !== 'string' || !Object.hasOwn(legacyLanguageTags, value)) return undefined;

  return legacyLanguageTags[value];
};

export const syncDocumentLanguage = (lang: Lang): void => {
  if (typeof document === 'undefined') return;

  document.documentElement.lang = lang;
  // Both ancient locales deliberately follow modern left-to-right digital encoding.
  document.documentElement.dir = 'ltr';
};
