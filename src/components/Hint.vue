<template>
  <div class="hint">
    <Icon :icon="iconName" :className="getClasses" />

    <span class="info-text" :class="getSize">{{ $t(text) }}</span>
  </div>
</template>

<script lang="ts" setup>
import { computed } from 'vue';

type IconNameType = 'notification' | 'warning';
type Size = 'big' | 'medium';
type Props = {
  iconName: IconNameType;
  text: string;
  size: Size;
};
const baseClass = 'notifications-icon';
const props = withDefaults(defineProps<Props>(), { size: 'medium' });

const getClasses = computed(() => {
  if (props.iconName === 'warning') return [`${baseClass} warning--orange`];

  return [baseClass];
});

const getSize = computed(() => (props.size === 'big' ? 'info-text--big' : 'info-text'));
</script>

<style lang="scss" scoped>
.hint {
  color: $grayish-white;

  i {
    color: $grayish-white;
  }

  display: flex;
  font-size: 12px;
  align-items: center;
  text-align: left;

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
