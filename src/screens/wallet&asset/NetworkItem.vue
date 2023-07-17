<template>
  <li class="network" @click="$emit('onToggleNetworkType')">
    <Icon v-if="isNetworkGroup" icon="all-networks" width="24" height="24" className="network__icon" />
    <ExternalLogo v-else :name="network.icon" width="24" height="24" class="img" />

    <span class="network__name">{{ network.name }}</span>

    <div class="network__state">
      <Icon
        v-if="isNetworkSelected"
        icon="check"
        :iconColor="iconColor"
        width="18"
        height="18"
        className="network__icon-state"
      />
      <Icon
        :icon="iconType"
        :iconColor="iconColorFavorite"
        width="18"
        height="18"
        className="network__icon-state"
        @click.stop.self="onToggleState"
      />
    </div>
  </li>
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import { NetworkJson } from '@/extension/background/extension-base/src/types';
import { GettersTypes as AccountGettersTypes } from '@/store/accounts/getters';
import { SelectedWallet } from '@/store/accounts/types';

@Component({})
export default class NetworkItem extends Vue {
  @Prop(Object) network!: NetworkJson;
  @Prop(Boolean) isSelected!: boolean;
  @Prop({ default: false }) isNetworkGroup!: boolean;
  @Getter(AccountGettersTypes.getSelectedWallet) selectedWallet!: SelectedWallet;

  get iconColor() {
    return this.isSelected ? 'purple' : '';
  }

  get isNetworkSelected() {
    return this.isSelected && !this.isNetworkGroup;
  }

  get isFavorite() {
    if (this.isNetworkGroup) return false;

    return this.network.favorite.includes(this.selectedWallet.address);
  }

  get iconColorFavorite() {
    return this.isFavorite || (this.isSelected && this.isNetworkGroup) ? 'purple' : '';
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
  color: $default-white;
  font-size: 16px;
  border: solid 1px transparent;
  border-bottom-color: $default-background-color;
  padding-top: 16px;
  padding-bottom: 16px;
  justify-content: center;
  align-items: center;
  gap: 16px;

  &__name {
    white-space: nowrap;
  }

  &__icon-state {
    width: 18px;
    height: 18px;
  }

  &__icon {
    width: 24px;
    height: 24px;
  }

  &__state {
    flex-grow: 3;
    width: 100%;
    display: flex;
    gap: 10px;
    justify-content: flex-end;
  }
}
</style>
