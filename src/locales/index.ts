import { createI18n } from 'vue-i18n';
import * as en from './en/translation.json';
import * as ru from './ru/translation.json';
import { accountController } from '@/controllers';

const messages = {
  'en-EN': en,
  'ru-RU': ru,
};

export type Lang = keyof typeof messages;

export const i18n = createI18n({
  legacy: false,
  globalInjection: true,
  locale: accountController.getLang(),
  fallbackLocale: 'en-EN',
  messages,
  numberFormats: {
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
      decimalTiny: {
        style: 'decimal',
        minimumFractionDigits: 6,
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
      decimalTiny: {
        style: 'decimal',
        minimumFractionDigits: 6,
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
