<template>
  <div class="network-management" :class="classes" @click.stop="onToggle">
    <Icon v-if="isGroupIcon" :icon="icon" className="icon--network" width="16" height="16" />
    <ExternalLogo v-else :name="icon" width="16" height="16" class="icon--network" />

    <span class="network__title">{{ selectedNetwork }}</span>
    <Icon icon="down" className="icon--down" width="10" height="9" />
  </div>
</template>
<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';

@Component({})
export default class Header extends Vue {
  @Prop(Boolean) isGroupIcon!: boolean;
  @Prop(String) icon!: string;
  @Prop(String) classes?: string;
  @Prop(String) selectedNetwork!: string;

  onToggle() {
    this.$emit('onToggle');
  }
}
</script>

<style lang="scss" scoped>
.network-management {
  justify-content: space-between;
  white-space: nowrap;
  overflow-x: clip;
  height: 32px;
  display: flex;
  gap: 4px;
  max-width: fit-content;
  width: fit-content;
}
.icon--down {
  height: 9px;
  width: 9px;
}
.icon--network {
  height: 16px;
  width: 16px;
}
.network__title {
  max-width: 80px;
  text-overflow: ellipsis;
  overflow: hidden;
}
</style>
