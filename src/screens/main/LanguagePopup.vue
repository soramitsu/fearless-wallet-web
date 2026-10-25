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
    @handlerClose="$emit('handlerClose')"
  />
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import { languageOptions, syncDocumentLanguage, type Lang } from '@/locales';
import { useI18n } from '@/locales/useI18n';
import { accountController } from '@/controllers';

const options = [...languageOptions];
const i18n = useI18n();
const emit = defineEmits(['handlerClose']);

const language = computed({
  get: () => {
    return i18n.locale.value as Lang;
  },
  set: (language: Lang) => {
    i18n.locale.value = language;
    syncDocumentLanguage(language);

    accountController.setLang(language);
  },
});

const toggleLanguage = (lang: Lang) => {
  language.value = lang;

  emit('handlerClose');
};
</script>
