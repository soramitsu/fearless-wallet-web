<template>
  <div class="hint">
    <Icon :icon="iconName" :className="getClasses" />

    <span class="info-text" :class="getSize">{{ tText }}</span>
  </div>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import { useI18n } from 'vue-i18n-composable';
import type { ComponentText } from '@/interfaces';

type Props = {
  iconName: 'notification' | 'warning';
  size: 'big' | 'medium';
  text: ComponentText;
};

const baseClass = 'notifications-icon';
const props = withDefaults(defineProps<Props>(), { size: 'medium' });
const { t, tc } = useI18n();

const getClasses = computed(() => {
  return [
    baseClass,
    {
      'warning--orange': props.iconName === 'warning',
    },
  ];
});

const tText = computed(() => {
  if (typeof props.text === 'string') return t(props.text);

  const { text, localeProps } = props.text;

  if (localeProps) {
    const { tc: tcProps } = localeProps;

    if (tcProps) return tc(text, tcProps, localeProps);
  }

  return t(text, localeProps);
});

const getSize = computed(() => (props.size === 'big' ? 'info-text--big' : 'info-text'));
</script>

<style lang="scss" scoped>
.hint {
  color: $grayish-white;
  display: flex;
  font-size: 12px;
  align-items: center;
  text-align: left;

  i {
    color: $grayish-white;
  }

  .warning--orange {
    color: $simple-orange-color;
  }

  .notifications-icon {
    display: flex;
    align-items: center;
    width: 20px;
    height: 20px;
    margin-right: 15px;
  }

  .info-text {
    width: 491px;
    font-size: 14px;
    margin: auto 0;
    line-height: 19px;
  }
  .info-text--big {
    font-size: 16px;
    font-weight: 600;
    line-height: 150%;
  }
}
</style>
