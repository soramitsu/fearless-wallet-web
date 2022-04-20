<template>
  <div class="wallet">
    <AllNetworksButton
      :text="selectedNetwork"
      :isActive="showSelectNetworkPopup"
      @click.native="toggleSelectNetworkPopupVisible"
    />

    <PopupWithChoice
      v-if="showSelectNetworkPopup"
      v-model="selectedNetwork"
      header="Select Network"
      space="big"
      :icon="true"
      :options="optionsNetworks"
      :toggleValue="toggleSelectedNetwork"
      :handlerClose="toggleSelectNetworkPopupVisible"
    />

    <Content />
  </div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import { GettersTypes as ApisGettersTypes } from '../../store/api/getters';
import { Networks } from '../../store/api/types';
import keyring from '@polkadot/ui-keyring';
import AllNetworksButton from './SelectNetworkButton.vue';
import Content from './Content.vue';
import PopupWithChoice from '../../components/PopupWithChoice.vue';

@Component({
  components: {
    PopupWithChoice,
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
      { label: 'All networks', value: 'All networks', path: this.getIconPath() },
      ...Object.keys(this.networksInfo).map((networkName) => {
        return { label: networkName, value: networkName, path: `networks/${this.getIconPath(networkName)}` };
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

  getIconPath(networkName = '') {
    switch (networkName) {
      case 'Polkadot':
        return 'polkadot.svg';
      case 'Kusama':
        return 'kusama.svg';
      case 'Westend':
        return 'westend.svg';
      case 'Statemine':
        return 'statemine.svg';
      case 'Statemint':
        return 'statemine.svg';
      case 'Acala':
        return 'acala.svg';
      case 'Karura':
        return 'karura.svg';
      case 'Moonriver':
        return 'moonriver.svg';
      case 'Shiden':
        return 'shiden.svg';
      case 'Bifrost':
        return 'bifrost.svg';
      case 'Khala':
        return 'khala.svg';
      case 'KILT Spiritnet':
        return 'kilt_spiritnet.svg';
      case 'Calamari':
        return 'calamari.svg';
      case 'Quartz':
        return 'quartz.svg';
      case 'Parallel Heiko':
        return 'parallelfinance.svg';
      case 'Picasso':
        return 'Picasso.svg';
      case 'Altair':
        return 'altair.svg';
      case 'Bit.Country Pioneer':
        return 'bitcountry.svg';
      case 'Clover':
        return 'clover.svg';
      case 'Astar':
        return 'astar.svg';
      case 'Parallel':
        return 'parallelfinance.svg';
      case 'Basilisk':
        return 'basilisk.svg';
      case 'Moonbeam':
        return 'moonbeam.svg';
      case 'Moonbase Alpha':
        return 'moonbeam.svg';
      case 'Genshiro':
        return 'genshiro.svg';
      case 'Robonomics':
        return 'robonomics.svg';
      case 'Kintsugi':
        return 'kintsugi.svg';
      case 'Subsocial Parachain':
        return 'subsocial.svg';
      case 'Zeitgeist':
        return 'zeitgeist.svg';
      default:
        return 'fw-logo.svg';
    }
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

  .content {
    margin: 5px 0;
    display: flex;
    padding: 10px 15px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    background-color: rgba(255, 255, 255, 0.05);
    clip-path: var(--default-clip-path);
    border-radius: 8px;
    min-height: 410px;
  }
}
</style>
