import Vue from 'vue';
import VueI18n from 'vue-i18n';
import * as en from './en/translation.json';
import * as ru from './ru/translation.json';

Vue.use(VueI18n);

const messages = {
  en,
  ru,
};

export default new VueI18n({
  locale: 'en',
  messages,
});
