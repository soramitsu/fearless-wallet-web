<template>
  <AboveForm
    header="common.send"
    :fullScreen="true"
    :showBackIcon="showConfirmScreen"
    @handlerBack="onBack"
    @closeHandler="onClose"
  >
    <div class="nft-send-form">
      <div v-if="!showHistoryBook" class="container">
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

      <template v-if="showConfirmScreen">
        <img alt="nft" />
        <InfoList>
          <InfoItem v-for="(value, key) in nftDetails" :name="key" :value="value" :key="key" />
        </InfoList>
      </template>

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

      <FButton
        v-if="!showHistoryBook"
        size="big"
        :disabled="isDisabled"
        class="button"
        :text="actionBtnName"
        @click="onProceed"
      />
    </div>
  </AboveForm>
</template>

<script lang="ts" setup>
import { ref, computed } from 'vue';
import type { NftTx } from '@extension-base/services/nft-service/types';
import type { AccountJson } from '@extension-base/background/types/types';
import { getClipboard } from '@/helpers';
import { useStore } from '@/store';
import HistoryBook from '@/screens/wallet&asset/HistoryBook.vue';
import BaseApi from '@/util/BaseApi';
import { sendNft } from '@/extension/messaging/nfts';
import router from '@/router';

const store = useStore();

const to = ref('');
const showHistoryBook = ref(false);
const newAddress = ref('');
const showMyWallets = ref(false);
const network = ref('ethreum');
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

const tx = computed<NftTx>(() => ({
  type: '',
  contract: '',
  to: '',
  network: '',
  tokenId: '',
}));

const onProceed = () => {
  if (showConfirmScreen.value) sendNft(tx.value);
  else showConfirmScreen.value = true;
};

const onBack = () => {
  if (showConfirmScreen.value) {
    showConfirmScreen.value = false;

    return;
  }

  router.back();
};

const onClose = () => {
  router.back();
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
  height: 100%;
}
.nft-send-form {
  height: 100%;
  display: flex;
  flex-flow: column;
  justify-content: space-between;
}
</style>
