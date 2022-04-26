<template>
  <div class="wallet">
    <AllNetworksButton
      :text="selectedNetwork"
      :isActive="showSelectNetworkPopup"
      @click.native="toggleSelectNetworkPopupVisible"
    />

    <PopupWithSelect
      v-if="showSelectNetworkPopup"
      v-model="selectedNetwork"
      header="Select Network"
      space="big"
      :icon="true"
      :search="true"
      :staticHeight="true"
      :options="optionsNetworks"
      :toggleValue="toggleSelectedNetwork"
      :handlerClose="toggleSelectNetworkPopupVisible"
      :handlerFilter="handlerFilter"
    />

    <Content :selectedNetwork="selectedNetwork" />
  </div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import { GettersTypes as ApisGettersTypes } from '@/store/api/getters';
import { Networks } from '@/store/api/types';
import { getIconPathByNetworkName } from '@/util/imgPath';
import { firstCharToUp } from '@/util/stringHelper';
import AllNetworksButton from './SelectNetworkButton.vue';
import Content from './Content.vue';
import PopupWithSelect from '@/components/PopupWithSelect.vue';

@Component({
  components: {
    PopupWithSelect,
    AllNetworksButton,
    Content,
  },
})
export default class extends Vue {
  showSelectNetworkPopup = false;
  selectedNetwork = 'All networks';
  filteredValue = '';

  @Getter(ApisGettersTypes.getNetworksInfo) networksInfo!: Networks;

  get optionsNetworks() {
    const optionsNetworks = [
      { label: 'All networks', value: 'All networks', path: getIconPathByNetworkName() },
      ...Object.keys(this.networksInfo).map((network) => {
        return { label: firstCharToUp(network), value: network, path: `networks/${getIconPathByNetworkName(network)}` };
      }),
    ];

    if (this.filteredValue === '') return optionsNetworks;

    return optionsNetworks.filter(({ label }) => label.includes(this.filteredValue));
  }

  toggleSelectedNetwork(value: string) {
    this.selectedNetwork = value;

    this.toggleSelectNetworkPopupVisible();
  }

  toggleSelectNetworkPopupVisible() {
    this.showSelectNetworkPopup = !this.showSelectNetworkPopup;
  }

  handlerFilter(value: string) {
    this.filteredValue = value;
  }
}
</script>

<style lang="scss" scoped>
.wallet {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;

  .nickname {
    text-align: left;
  }
}
</style>
