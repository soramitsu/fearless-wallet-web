<template>
  <AboveForm>
    <template v-if="!showHistoryBook">
      <InputWithIcon
        v-model="network"
        class="row"
        icon="rotate"
        placeholder="assets.network"
        :isActiveRotate="showSelectNetworkPopup"
        @click="toggleSelectNetworkPopup"
      />
      <FInput placeholder="send to" />

      <div class="activity-buttons row">
        <BadgeButton text="assets.history" @click="toggleHistoryBookVisibility" />

        <BadgeButton text="common.paste" @click="paste" />

        <BadgeButton v-if="showMyWalletsButton" text="assets.myWallets" @click="toggleMyWalletsVisibility" />
      </div>
    </template>

    <HistoryBook
      v-else
      :network="network"
      :assetId="assetId"
      @toggleHistoryBookVisibility="toggleHistoryBookVisibility"
      @setRecipient="setRecipient"
      @setAddress="setAddress"
    />

    <!-- <SelectPopup
      v-if="showSelectNetworkPopup"
      placeholder="common.searchNetwork"
      verticalPlacement="top"
      class="transfer-select-popup"
      :value="network"
      :showBlur="false"
      :showBackground="false"
      :top="top"
      :left="left"
      :height="285"
      :options="options"
      @handlerFilter="handlerFilter"
      @toggleValue="toggleSelectedNetwork"
      @handlerClose="handlerCloseSelectPopup"
    /> -->
  </AboveForm>
</template>

<script lang="ts" setup>
import { ref, computed } from 'vue';
import type { AccountJson } from '@extension-base/background/types/types';
import {
  // firstCharToUp,
  getClipboard,
} from '@/helpers';
import { useStore } from '@/store';
import BaseApi from '@/util/BaseApi';

const store = useStore();

const to = ref('');
const showHistoryBook = ref(false);
const newAddress = ref('');
const showMyWallets = ref(false);
const network = ref('');
const assetId = ref('');
const showSelectNetworkPopup = ref(false);
const wallets = computed<AccountJson[]>(() => store.getters.getAccounts);
const filteredWallets = computed(() => wallets.value.filter(({ active }) => !active));
const showMyWalletsButton = computed(() => filteredWallets.value.length !== 0);
const paste = () => (to.value = getClipboard());
const toggleMyWalletsVisibility = () => (showMyWallets.value = !showMyWallets.value);
const toggleHistoryBookVisibility = () => (showHistoryBook.value = !showHistoryBook.value);

const setRecipient = (address = '') => {
  to.value = BaseApi.formatAddress({ address, ethereumAddress: address }, network.value);
};

const setAddress = (address: string, showHistBook = false) => {
  newAddress.value = address;
  showHistoryBook.value = showHistBook;
};

const toggleSelectNetworkPopup = () => (showSelectNetworkPopup.value = !showSelectNetworkPopup.value);
// const optionsNetworks = computed(() => {
//   // used only for transfer
//   const walletBalance = this.currency?.balances ?? [];

//   return walletBalance.reduce(
//     (result, { name, icon }) => {
//       return [
//         ...result,
//         {
//           name: firstCharToUp(name),
//           value: name.toLowerCase(),
//           icon,
//         },
//       ];
//     },
//     [] as {
//       name: string;
//       value: string;
//       icon: string;
//     }[]
//   );
// });
</script>

<style lang="scss" scoped>
.activity-buttons {
  display: flex;
  user-select: none;
  margin-bottom: 30px;
}
</style>
