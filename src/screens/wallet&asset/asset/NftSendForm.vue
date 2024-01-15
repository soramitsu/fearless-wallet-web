<template>
  <AboveForm>
    <template v-if="!showHistoryBook">
      <div class="container">
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
      </div>
    </template>

    <template v-if="showConfirmScreen">
      <img alt="nft" />
      <InfoList>
        <InfoItem v-for="(value, key) in nftDetails" :name="key" :value="value" :key="key" />
      </InfoList>
    </template>

    <template>
      <FButton size="big" :disabled="isDisabled" class="button" :text="actionBtnName" @click="sendNft" />
      <HistoryBook
        v-if="showHistoryBook"
        :network="network"
        :assetId="assetId"
        @toggleHistoryBookVisibility="toggleHistoryBookVisibility"
        @setRecipient="setRecipient"
        @setAddress="setAddress"
      />

      <SelectPopup
        v-if="showSelectNetworkPopup"
        placeholder="common.searchNetwork"
        verticalPlacement="top"
        class="transfer-select-popup"
        :value="network"
        :showBlur="false"
        :showBackground="false"
        :top="148"
        :left="-160"
        :height="360"
        :options="options"
        @handlerFilter="handlerFilter"
        @toggleValue="toggleSelectedNetwork"
        @handlerClose="handlerCloseSelectPopup"
      />
    </template>
  </AboveForm>
</template>

<script lang="ts" setup>
import { ref, computed } from 'vue';
import type { AccountJson } from '@extension-base/background/types/types';
import { getClipboard } from '@/helpers';
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

const isDisabled = computed(() => false);

const setAddress = (address: string, showHistBook = false) => {
  newAddress.value = address;
  showHistoryBook.value = showHistBook;
};

const handlerFilter = () => {};

const showConfirmScreen = ref(false);
const actionBtnName = computed(() => `common.${showConfirmScreen.value ? 'confirm' : 'accept'}`);

const nftDetails = {
  'send to': newAddress.value,
  collection: 'this.nonce',
  owned: 'this.genesisHash',
  created: 'this.specVersion',
  network: 'this.method',
  date: 'this.mortality',
};

const toggleSelectedNetwork = () => {};

const handlerCloseSelectPopup = () => {};

const options = computed(() => []);
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

const sendNft = () => {
  //sending
};
</script>

<style lang="scss" scoped>
.activity-buttons {
  display: flex;
  user-select: none;
  margin-bottom: 30px;
}
.container {
  display: flex;
  flex-flow: column;
  gap: 10px;
}
</style>
