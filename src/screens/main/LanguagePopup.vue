<template>
  <SelectPopup
    verticalPlacement="top"
    horizontalPlacement="right"
    headerText="header.settings.language.translated"
    :value="language"
    :top="50"
    :showAnimation="false"
    :showIcon="false"
    :showSearch="false"
    :options="options"
    @toggleValue="toggleLanguage"
    @handlerClose="handlerClose"
  />
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import type { Lang } from '@/locales';
import { accountController } from '@/controllers';

@Component
export default class LanguagePopup extends Vue {
  readonly options = [
    { name: 'English', value: 'en-EN' },
    { name: 'Русский', value: 'ru-RU' },
  ];

  @Prop(Function) handlerClose!: VoidFunction;

  get language() {
    return this.$root.$i18n.locale as Lang;
  }

  set language(language: Lang) {
    this.$root.$i18n.locale = language;

    accountController.setLang(language);
  }

  toggleLanguage(language: Lang) {
    this.language = language;

    this.handlerClose();
  }
}
</script>
