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
    @handlerClose="handleClose"
  />
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { Lang } from '@/locales';
import { accountController } from '@/controllers';

const options = [
  { name: 'English', value: 'en-EN' },
  { name: 'Русский', value: 'ru-RU' },
];
const i18n = useI18n();
const emit = defineEmits<{
  handlerClose: [];
}>();

const language = computed({
  get: () => {
    return i18n.locale.value as Lang;
  },
  set: (language: Lang) => {
    i18n.locale.value = language;

    accountController.setLang(language);
  },
});

const handleClose = () => emit('handlerClose');

const toggleLanguage = (lang: Lang) => {
  language.value = lang;

  handleClose();
};
</script>
