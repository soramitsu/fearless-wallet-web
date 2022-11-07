import Vue from 'vue';
import VueI18n from 'vue-i18n';
import * as en from './en/translation.json';
import * as ru from './ru/translation.json';
import { accountController } from '@/controllers/accountController';

Vue.use(VueI18n);
type MessageSchema = typeof en;

const messages: Record<string, MessageSchema> = {
  en,
  ru,
};

type Lang = keyof typeof messages;

export default new VueI18n({
  locale: accountController.getLang(),
  fallbackLocale: 'en',
  messages,
});

export { Lang };
