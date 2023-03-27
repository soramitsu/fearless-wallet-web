<template>
  <SelectPopup
    class="select-network-popup"
    sizeWidth="big"
    placeholder="common.searchNetwork"
    :value="selectedNetwork"
    :height="height"
    :maxHeight="maxHeight"
    :horizontalPlacement="horizontalPlacement"
    :verticalPlacement="verticalPlacement"
    :top="top"
    :left="left"
    :showBlur="showBlur"
    :showBackground="showBackground"
    :options="filteredOptionsNetworks"
    :toggleValue="toggleSelectedNetwork"
    :handlerClose="handlerClose"
    :handlerFilter="handlerFilter"
  />
</template>

<script lang="ts">
import { Component, Vue, Prop } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import type { RelayChainName } from '@/interfaces';
import { firstCharToUp } from '@/helpers/common';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import { NetworkJsonOld } from '@/extension/background/extension-base/src/types';

interface Options {
  name: string;
  value: string;
  icon: string;
  relayChain?: RelayChainName;
  isAll?: true;
}

@Component
export default class SelectNetworkButton extends Vue {
  filterValue = '';

  @Prop(String) selectedNetwork!: string;
  @Prop(String) relayChain!: string;
  @Prop({ default: 105 }) top!: number;
  @Prop({ default: 0 }) left!: number;
  @Prop({ default: 'right' }) horizontalPlacement!: string;
  @Prop({ default: 'top' }) verticalPlacement!: string;
  @Prop({ default: true }) allNetworksItem!: boolean;
  @Prop({ default: true }) showBlur!: boolean;
  @Prop({ default: true }) showBackground!: boolean;
  @Prop(Number) height!: number;
  @Prop(Number) maxHeight!: number;
  @Prop(Array) _optionsNetworks!: Options[];
  @Prop(Function) toggleSelectedNetwork!: (value: string) => void;
  @Prop(Function) handlerClose!: VoidFunction;
  @Getter(NetworksGettersTypes.getNetworks) networks!: NetworkJsonOld[];

  get optionsNetworks() {
    if (this._optionsNetworks !== undefined) return this._optionsNetworks;

    let options: Options[] = [
      ...this.networks.map(({ name, parentId, icon }) => {
        const relayChain = this.networks.find(({ chainId }) => chainId === parentId)?.name ?? name;

        return {
          name: firstCharToUp(name),
          value: name,
          icon: icon,
          relayChain: relayChain as RelayChainName,
        };
      }),
    ];

    if (this.relayChain) options = options.filter(({ relayChain }) => relayChain === this.relayChain);

    if (this.allNetworksItem)
      options.unshift({
        name: this.$t('common.allNetworks') as string,
        value: 'All',
        icon: 'globus',
        isAll: true,
      });

    return options;
  }

  get filteredOptionsNetworks() {
    const filter = this.filterValue.trim().toLowerCase();

    return this.optionsNetworks.filter(({ value }) => {
      return value.toLowerCase().includes(filter);
    });
  }

  handlerFilter(value: string) {
    this.filterValue = value;
  }
}
</script>

<style lang="scss" scoped>
.select-network-popup {
  text-transform: capitalize;
}
</style>
