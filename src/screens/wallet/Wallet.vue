<template>
  <div class="wallet">
    <div class="select-network">
      <SelectNetworkButton
        :text="selectedNetwork"
        :isActive="showSelectNetworkPopup"
        @click.native="toggleSelectNetworkPopupVisible"
      />
    </div>

    <PopupWithSelect
      v-if="showSelectNetworkPopup"
      v-model="selectedNetwork"
      header="Select Network"
      placement="right"
      space="big"
      :icon="true"
      :search="true"
      :staticHeight="true"
      :options="filterOptionsNetworks"
      :toggleValue="toggleSelectedNetwork"
      :handlerClose="toggleSelectNetworkPopupVisible"
      :handlerFilter="handlerFilter"
    />

    <Content :selectedNetwork="selectedNetwork" :toggleVisibleActivityForm="toggleVisibleActivityForm" />

    <SendForm v-if="showSendForm" :closeForm="toggleVisibleActivityForm.bind(null, 'showSendForm', false)" />

    <ReceiveForm v-if="showReceiveForm" :closeForm="toggleVisibleActivityForm.bind(null, 'showReceiveForm', false)" />
  </div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';
import { Getter } from 'vuex-class';
import { GettersTypes as ApisGettersTypes } from '@/store/api/getters';
import { Networks } from '@/store/api/types';
import { getImgPathByNetworkName } from '@/util/imgPath';
import { firstCharToUp } from '@/util/stringHelper';
import SelectNetworkButton from './SelectNetworkButton.vue';
import Content from './Content.vue';
import PopupWithSelect from '@/components/PopupWithSelect.vue';
import ReceiveForm from './ReceiveForm.vue';
import SendForm from './SendForm.vue';

@Component({
  components: {
    PopupWithSelect,
    SelectNetworkButton,
    Content,
    SendForm,
    ReceiveForm,
  },
})
export default class extends Vue {
  showSendForm = false;
  showReceiveForm = false;
  showSelectNetworkPopup = false;
  selectedNetwork = 'All networks';
  filterValue = '';

  @Getter(ApisGettersTypes.getNetworksInfo) networksInfo!: Networks;

  get optionsNetworks() {
    return [
      { label: 'All networks', value: 'All networks', path: getImgPathByNetworkName() },
      ...Object.keys(this.networksInfo).map((network) => {
        return { label: firstCharToUp(network), value: network, path: `networks/${getImgPathByNetworkName(network)}` };
      }),
    ];
  }

  get filterOptionsNetworks() {
    const filter = this.filterValue.trim().toLowerCase();

    return this.optionsNetworks.filter(({ label }) => label.includes(filter));
  }

  toggleVisibleActivityForm(field: 'showSendForm' | 'showReceiveForm', value = true) {
    this[field] = value;
  }

  toggleSelectedNetwork(value: string) {
    this.selectedNetwork = value;

    this.toggleSelectNetworkPopupVisible();
  }

  toggleSelectNetworkPopupVisible() {
    this.showSelectNetworkPopup = !this.showSelectNetworkPopup;
  }

  handlerFilter(value: string) {
    this.filterValue = value;
  }
}
</script>

<style lang="scss" scoped>
.wallet {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;

  .select-network {
    width: 100%;
    display: flex;
    justify-content: right;
  }

  .nickname {
    text-align: left;
  }
}
</style>
