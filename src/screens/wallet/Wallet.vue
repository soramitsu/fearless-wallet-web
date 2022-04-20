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
      :options="optionsNetworks"
      :toggleValue="toggleSelectedNetwork"
      :handlerClose="toggleSelectNetworkPopupVisible"
    />

    <Content :selectedNetwork="selectedNetwork" />
  </div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import { GettersTypes as ApisGettersTypes } from '../../store/api/getters';
import { Networks } from '../../store/api/types';
import { getIconPathByNetworkName } from '../../util/IconsPath';
import keyring from '@polkadot/ui-keyring';
import AllNetworksButton from './SelectNetworkButton.vue';
import Content from './Content.vue';
import PopupWithSelect from '../../components/PopupWithSelect.vue';

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

  @Getter(ApisGettersTypes.getNetworksInfo) networksInfo!: Networks;

  get optionsNetworks() {
    return [
      { label: 'All networks', value: 'All networks', path: getIconPathByNetworkName() },
      ...Object.keys(this.networksInfo).map((networkName) => {
        return { label: networkName, value: networkName, path: `networks/${getIconPathByNetworkName(networkName)}` };
      }),
    ];
  }

  get accounts() {
    return keyring.getAccounts();
  }

  get addressesInfo() {
    return this.accounts.map(({ address }) => {
      const {
        meta: { name },
      } = keyring.getPair(address);

      return {
        address,
        name: name ?? 'default name',
      };
    });
  }

  toggleSelectedNetwork(value: string) {
    this.selectedNetwork = value;

    this.toggleSelectNetworkPopupVisible();
  }

  toggleSelectNetworkPopupVisible() {
    this.showSelectNetworkPopup = !this.showSelectNetworkPopup;
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
