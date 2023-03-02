import Vue from 'vue';
import VueI18n from 'vue-i18n';
import * as en from './en/translation.json';
import * as ru from './ru/translation.json';
import { accountController } from '@/controllers/accountController';

Vue.use(VueI18n);

const messages = {
  'en-EN': en,
  'ru-RU': ru,
};

type Lang = keyof typeof messages;

export default new VueI18n({
  locale: accountController.getLang(),
  fallbackLocale: 'en',
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
      percent: {
        style: 'percent',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      },
      price: {
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
      percent: {
        style: 'percent',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      },
      price: {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      },
    },
  },
});

export { Lang };
