<template>
  <li class="network">
    <Icon v-if="isNetworkGroup" icon="all-networks" width="24" height="24" className="network__icon" />
    <ExternalLogo v-else :name="network.icon" width="24" height="24" class="img" />

    <span class="network__name">{{ network.name }}</span>
    <div class="network__state">
      <Icon
        :icon="iconType"
        :iconColor="active"
        width="18"
        height="18"
        className="network__icon-state"
        @click="onToggleState"
      />
    </div>
  </li>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import { Fragment } from 'vue-fragment';
import { NetworkJson } from '@/extension/background/extension-base/src/types';

@Component({
  components: {
    Fragment,
  },
})
export default class NetworkItem extends Vue {
  @Prop(Object) network!: NetworkJson;
  @Prop(Boolean) isActive!: boolean;
  @Prop({ default: false }) isNetworkGroup!: boolean;

  get active() {
    return this.isActive ? 'purple' : '';
  }

  get iconType() {
    return this.isNetworkGroup ? 'check' : 'star';
  }

  onToggleState() {
    this.$emit('onToggleState');
  }
}
</script>

<style lang="scss" scoped>
.network {
  display: flex;
  flex-flow: row nowrap;
  gap: 16px;
  color: $default-white;
  font-size: 16px;
  border: solid 1px transparent;
  border-bottom-color: $default-background-color;
  padding-top: 16px;
  padding-bottom: 16px;
  justify-content: center;
  align-items: center;
  .network__name {
    white-space: nowrap;
  }
  .network__icon-state {
    width: 18px;
    height: 18px;
  }
  .network__icon {
    width: 24px;
    height: 24px;
  }
  .network__state {
    flex-grow: 3;
    width: 100%;
    display: flex;
    justify-content: flex-end;
  }
}
</style>
