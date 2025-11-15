<template>
  <div :class="nodeItemClasses" data-testid="nodeItem" @click="changeNode">
    <div>
      <div class="name" data-testid="nodeName">{{ name }}</div>
      <div class="url" data-testid="nodeUrl">{{ url }}</div>
    </div>

    <CircleButton
      v-if="isCustomNode"
      ref="dotsHorizontalRef"
      iconName="dots-horizontal"
      backgroundColor="light-black"
      data-testid="nodeSettingsBtn"
      @click="openNodeSettingsPopup"
    />
  </div>
</template>

<script lang="ts" setup>
import { computed, ref } from 'vue';
import type { ComponentPublicInstance } from 'vue';
import type { CustomEvent } from '@/interfaces';

const props = withDefaults(
  defineProps<{
    name: string;
    url: string;
    isActive: boolean;
    isCustomNode: boolean;
    isRemoveBorderBottom: boolean;
  }>(),
  {
    isActive: false,
    isCustomNode: false,
    isRemoveBorderBottom: false,
  }
);

const emit = defineEmits<{
  changeNode: [];
  openNodeSettingsPopup: [top: number, isActive: boolean];
}>();

const dotsHorizontalRef = ref<ComponentPublicInstance | HTMLElement | null>(null);

const nodeItemClasses = computed(() => [
  'node-item',
  {
    'node-active': props.isActive,
    'not-border-bottom': props.isRemoveBorderBottom,
  },
]);

const changeNode = (event: CustomEvent) => {
  const target = event.target as HTMLElement | null;
  const classList = target?.classList;

  if (
    classList?.contains('node-item') ||
    classList?.contains('node-active') ||
    classList?.contains('url') ||
    classList?.contains('name')
  ) {
    emit('changeNode');
  }
};

const openNodeSettingsPopup = () => {
  const element = dotsHorizontalRef.value;
  const targetElement = element instanceof HTMLElement ? element : ((element?.$el ?? null) as HTMLElement | null);

  if (!targetElement) return;

  const buttonTop = targetElement.getBoundingClientRect().top;

  targetElement.style.zIndex = '200';

  emit('openNodeSettingsPopup', buttonTop, props.isActive);
};
</script>

<style lang="scss" scoped>
.node-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  height: 60px;
  padding: 10px 20px;
  border-bottom: $default-border;
  box-sizing: border-box;

  &:last-child {
    border-bottom: none;
  }

  .url {
    font-weight: 400;
    font-size: 0.875em;
    text-align: left;
    width: 410px;
    height: 21px;
    line-height: 21px;
    color: #888888;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .name {
    text-align: left;
  }

  &:hover {
    cursor: pointer;
  }
}

.not-border-bottom {
  border-bottom: none;
}

.node-active {
  background-color: #7700ee;
  border-radius: $default-border-radius;
  padding: 10px 20px;
  clip-path: $big-clip-path-left-top-and-right-bottom;
  border-bottom: 1px solid #7700ee;

  .url {
    color: white;
  }
}
</style>
