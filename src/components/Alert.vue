<template>
  <FCorners :isError="true" size="big">
    <div class="alert-container" data-testid="alertContainer">
      <div class="alert__content">
        <Hint class="alert__header" size="big" iconName="warning" :text="headerText" />

        <p data-testid="alertMessage" :class="messageClasses">
          <slot>{{ tMessage }}</slot>
        </p>
      </div>
    </div>
  </FCorners>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import { useI18n } from 'vue-i18n-composable';
import type { ComponentText } from '@/interfaces';

type SizeTextType = 'small' | 'medium' | 'big';

type Props = {
  message?: ComponentText;
  sizeText?: SizeTextType;
  headerText?: string;
};

const props = withDefaults(defineProps<Props>(), { sizeText: 'medium', headerText: 'common.attention', message: '' });
const { t, tc } = useI18n();

const messageClasses = computed(() => {
  const classes = ['alert__message'];

  if (props.sizeText !== 'medium') classes.push(`text-${props.sizeText}`);

  return classes;
});

const tMessage = computed(() => {
  if (typeof props.message === 'string') return t(props.message);

  const { text, localeProps } = props.message;

  if (localeProps) {
    const { tc: tcProps } = localeProps;

    if (tcProps) return tc(text, tcProps, localeProps);
  }

  return t(text, localeProps);
});
</script>

<style lang="scss" scoped>
.alert-container {
  background: $secondary-background-color;
  padding: $default-padding;
  border: 1px solid $simple-orange-color;
  clip-path: $big-clip-path-left-top-and-right-bottom;
  border-radius: $default-border-radius;
  width: 100%;
}

.alert__content {
  width: 100%;
}

.alert__header {
  margin-bottom: 6px;
  font-size: $default-padding !important;
  line-height: 150%;
  color: $default-white !important;
}

.alert__message {
  font-weight: 400;
  line-height: 150%;
  color: $default-white;
  text-align: left;
}

.text-small {
  font-size: 14px;
}

.text-big {
  font-size: 18px;
}
</style>
