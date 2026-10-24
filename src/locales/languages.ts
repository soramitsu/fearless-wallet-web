export const OLD_AKKADIAN_LOCALE = 'akk-Latn-x-old' as const;
export const EGYPTIAN_HIEROGLYPH_LOCALE = 'egy-Egyp' as const;

export const languageOptions = [
  { name: 'English', value: 'en-EN' },
  { name: 'Русский', value: 'ru-RU' },
  { name: 'Akkadûm labīrum', value: OLD_AKKADIAN_LOCALE },
  { name: '𓂋 𓈖 𓆎𓅓𓏏 · R n Kmt', value: EGYPTIAN_HIEROGLYPH_LOCALE },
] as const;

export type Lang = (typeof languageOptions)[number]['value'];

const languageValues = new Set<string>(languageOptions.map(({ value }) => value));

export const isLang = (value: unknown): value is Lang => typeof value === 'string' && languageValues.has(value);

export const syncDocumentLanguage = (lang: Lang): void => {
  if (typeof document === 'undefined') return;

  document.documentElement.lang = lang;
  // The locale deliberately follows modern Egyptological left-to-right encoding.
  document.documentElement.dir = 'ltr';
};
