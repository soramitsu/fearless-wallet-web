import { createI18n } from 'vue-i18n';
import * as akk from './akk/translation.json';
import * as egy from './egy/translation.json';
import * as en from './en/translation.json';
import * as ru from './ru/translation.json';
import { syncDocumentLanguage, type Lang } from './languages';
import { accountController } from '@/controllers';

const messages = {
  'akk-Latn-x-old': akk,
  'egy-Egyp': egy,
  'en-EN': en,
  'ru-RU': ru,
} satisfies Record<Lang, unknown>;

export { isLang, languageOptions, syncDocumentLanguage, type Lang } from './languages';

const initialLocale = accountController.getLang();

syncDocumentLanguage(initialLocale);

export const i18n = createI18n({
  legacy: false,
  globalInjection: true,
  locale: initialLocale,
  fallbackLocale: 'en-EN',
  messages,
  numberFormats: {
    'akk-Latn-x-old': {
      currency: {
        style: 'currency',
        currency: 'USD',
        currencyDisplay: 'code',
        notation: 'standard',
      },
      decimal: {
        style: 'decimal',
        minimumFractionDigits: 4,
        maximumFractionDigits: 4,
      },
      decimalPrecise: {
        style: 'decimal',
        minimumFractionDigits: 4,
        maximumFractionDigits: 12,
      },
      price: {
        style: 'decimal',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      },
      percent: {
        style: 'percent',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      },
    },
    'egy-Egyp': {
      currency: {
        style: 'currency',
        currency: 'USD',
        currencyDisplay: 'code',
        notation: 'standard',
      },
      decimal: {
        style: 'decimal',
        minimumFractionDigits: 4,
        maximumFractionDigits: 4,
      },
      decimalPrecise: {
        style: 'decimal',
        minimumFractionDigits: 4,
        maximumFractionDigits: 12,
      },
      price: {
        style: 'decimal',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      },
      percent: {
        style: 'percent',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      },
    },
    'en-EN': {
      currency: {
        style: 'currency',
        currency: 'USD',
        notation: 'standard',
      },
      decimal: {
        style: 'decimal',
        minimumFractionDigits: 4,
        maximumFractionDigits: 4,
      },
      decimalPrecise: {
        style: 'decimal',
        minimumFractionDigits: 4,
        maximumFractionDigits: 12,
      },
      price: {
        style: 'decimal',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      },
      percent: {
        style: 'percent',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      },
    },
    'ru-RU': {
      currency: {
        style: 'currency',
        currency: 'RUB',
        currencyDisplay: 'symbol',
      },
      decimal: {
        style: 'decimal',
        minimumFractionDigits: 4,
        maximumFractionDigits: 4,
      },
      decimalPrecise: {
        style: 'decimal',
        minimumFractionDigits: 4,
        maximumFractionDigits: 12,
      },
      price: {
        style: 'decimal',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      },
      percent: {
        style: 'percent',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      },
    },
  },
});
