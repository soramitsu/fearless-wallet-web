<template>
  <div :class="containerClasses">
    <div class="network-management" :class="assetPageClasses" data-testid="networkManagement" @click.stop="onToggle">
      <Icon v-if="isGroupIcon" :icon="icon" :hover="false" className="icon--network" width="16" height="16" />
      <ExternalLogo v-else :name="icon" :width="16" class="icon--network" />

      <span class="network__title" data-testid="networkTitle">{{ selectedNetwork }}</span>
      <Icon icon="down" className="icon--down" width="10" height="9" />
    </div>
  </div>
</template>
<script lang="ts" setup>
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { Components } from '@/router/routes';

defineOptions({
  name: 'NetworkManagementButton',
});

const props = withDefaults(
  defineProps<{
    isGroupIcon?: boolean;
    isDisable?: boolean;
    icon: string;
    selectedNetwork: string;
  }>(),
  {
    isGroupIcon: false,
    isDisable: false,
  }
);

const emit = defineEmits<{
  (_event: 'onToggle'): void;
}>();

const route = useRoute();

const isAssetPage = computed(() => route.name === Components.AssetNetworks || route.name === Components.AssetHistory);

const containerClasses = computed(() => ({
  'network-management--cursor-not-allowed': isAssetPage.value || props.isDisable,
}));

const assetPageClasses = computed(() => ({
  'network-management--disabled': isAssetPage.value,
}));

const onToggle = () => {
  if (props.isDisable) return;

  emit('onToggle');
};
</script>

<style lang="scss" scoped>
.network-management {
  justify-content: space-between;
  align-items: center;
  white-space: nowrap;
  overflow-x: clip;
  height: 32px;
  display: flex;
  gap: 4px;
  max-width: fit-content;
  width: fit-content;

  &--disabled {
    pointer-events: none;
    opacity: 0.5;
  }

  &--cursor-not-allowed {
    cursor: not-allowed;
  }
}

.icon--network {
  width: 16px;
  height: 16px;
}

.icon--down {
  height: 9px;
  width: 9px;
}

.network__title {
  max-width: 80px;
  text-overflow: ellipsis;
  overflow: hidden;
}
</style>
