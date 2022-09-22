<template>
  <SelectPopup
    v-model="selectedNetwork"
    header="Select Network"
    horizontalPlacement="right"
    sizeWidth="big"
    placeholder="Search in networks"
    :top="25"
    :options="filteredOptionsNetworks"
    :toggleValue="toggleSelectedNetwork"
    :handlerClose="handlerClose"
    :handlerFilter="handlerFilter"
  />
</template>

<script lang="ts">
import { Component, Vue, Prop, VModel } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import type { Networks as NetworksType } from '@/interfaces/networks';
import type { RelayChainName } from '@/interfaces/teleport';
import { firstCharToUp } from '@/helpers/common';
import SelectPopup from '@/components/SelectPopup.vue';
import { GettersTypes as NetworksGettersTypes } from '@/store/networks/getters';
import { getImgPath } from '@/helpers/imgPath';

interface Options {
  label: string;
  value: string;
  path: string;
  relayChain?: RelayChainName;
  isAll?: true;
}

@Component({
  components: { SelectPopup },
})
export default class SelectNetworkButton extends Vue {
  filterValue = '';

  @VModel({ type: String }) selectedNetwork!: string;
  @Prop(String) relayChain!: string;
  @Prop(Function) toggleSelectedNetwork!: (value: string) => void;
  @Prop(Function) handlerClose!: VoidFunction;
  @Getter(NetworksGettersTypes.getNetworks) networks!: NetworksType;

  get optionsNetworks() {
    const options: Options[] = [
      ...this.networks.map(({ name, parentId }) => {
        const relayChain = this.networks.find(({ chainId }) => chainId === parentId)?.name ?? name;

        return {
          label: firstCharToUp(name),
          value: name,
          path: getImgPath(name),
          relayChain: relayChain as RelayChainName,
        };
      }),
    ];

    if (this.relayChain) {
      return options.filter(({ relayChain }) => relayChain === this.relayChain);
    } else options.unshift({ label: 'All networks', value: 'All networks', path: 'globus.svg', isAll: true });

    return options;
  }

  get filteredOptionsNetworks() {
    const filter = this.filterValue.trim().toLowerCase();

    return this.optionsNetworks.filter(({ label }) => label.toLowerCase().includes(filter));
  }

  handlerFilter(value: string) {
    this.filterValue = value;
  }
}
</script>
