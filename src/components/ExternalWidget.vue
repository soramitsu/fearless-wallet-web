<template>
  <div :class="containerClasses">
    <Loader v-if="widgetLoading" />

    <iframe v-show="showFrame" :src="src" title="External Widget" class="widget" @load="onLoadWidget" />
  </div>
</template>

<script lang="ts" setup>
import { ref, watch, computed } from 'vue';

type BackgroundColor = 'polkaswap' | 'default';

type Props = {
  src?: string;
  withBorder?: boolean;
  backgroundColor?: BackgroundColor;
};

const props = withDefaults(defineProps<Props>(), {
  src: '',
  withBorder: false,
  backgroundColor: 'default',
});

const widgetLoading = ref(true);

watch(
  () => props.src,
  (value) => {
    if (value) widgetLoading.value = true;
  }
);

const showFrame = computed(() => props.src && !widgetLoading.value);

const containerClasses = computed(() => {
  const backgroundColor = `background-${props.backgroundColor}`;

  return [
    'widget-container',
    {
      'container-border': props.withBorder,
      [backgroundColor]: !widgetLoading.value,
    },
  ];
});

const onLoadWidget = () => {
  widgetLoading.value = false;
};
</script>

<style lang="scss" scoped>
.widget-container {
  display: flex;
  justify-content: center;
  align-content: center;
  border: none;
  width: 100%;
  height: 100%;
  overflow: hidden;
  padding: 10px;
  border-radius: 10px;
  background-color: #111111;

  .widget {
    flex: 1;
    border: none;
  }

  .container-border {
    padding: 8px 4px;
    margin: 4px;
  }
}

.background-default {
  background-color: #111111;
}

.background-polkaswap {
  background-color: #fdf7fb;
}
</style>
