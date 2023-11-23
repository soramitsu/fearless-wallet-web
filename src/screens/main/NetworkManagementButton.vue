<template>
  <div :class="assetPageWrapperClasses">
    <div class="network-management" :class="assetPageClasses" @click.stop="onToggle">
      <Icon v-if="isGroupIcon" :icon="icon" className="icon--network" width="16" height="16" />
      <ExternalLogo v-else :name="icon" :width="16" class="icon--network" />

      <span class="network__title">{{ selectedNetwork }}</span>
      <Icon icon="down" className="icon--down" width="10" height="9" />
    </div>
  </div>
</template>
<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import { Components } from '@/router/routes';

@Component({})
export default class NetworkManagementButton extends Vue {
  @Prop(Boolean) isGroupIcon!: boolean;
  @Prop(String) icon!: string;
  @Prop(String) selectedNetwork!: string;

  onToggle() {
    this.$emit('onToggle');
  }

  get isAssetPage() {
    const route = this.$route.name;

    return route === Components.AssetNetworks || route === Components.AssetHistory;
  }

  get assetPageWrapperClasses() {
    if (this.isAssetPage) return 'network-management--cursor-not-allowed';

    return '';
  }

  get assetPageClasses() {
    if (this.isAssetPage) return 'network-management--disabled';

    return '';
  }
}
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
