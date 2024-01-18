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
        <FInput v-model="recipientCut" icon="close" placeholder="assets.sendTo" @click="setRecipient" />

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
      <div v-else-if="showMyWallets">
        <WalletInfo
          v-for="({ name, address, ethereumAddress, isMobile }, index) in filteredWallets"
          :key="name + index"
          :name="name"
          :isSelected="getStatusWallet(ethereumAddress)"
          :isMobile="isMobile"
          :address="address"
          :showMenu="false"
          class="wallet"
          @setWallet="setWallet(ethereumAddress)"
        />
      </div>

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
import { cut, getClipboard } from '@/helpers';
import { useStore } from '@/store';
import HistoryBook from '@/screens/wallet&asset/HistoryBook.vue';
import WalletInfo from '@/screens/extension-ui/signing/WalletInfo.vue';
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
const wallets = computed<AccountJson[]>(() => store.getters.getAccounts);
const filteredWallets = computed(() => wallets.value.filter(({ active }) => !active));
const showMyWalletsButton = computed(() => filteredWallets.value.length !== 0);
const paste = () => (to.value = getClipboard());
const toggleMyWalletsVisibility = () => (showMyWallets.value = !showMyWallets.value);
const toggleHistoryBookVisibility = () => (showHistoryBook.value = !showHistoryBook.value);
const recipientCut = computed(() => cut(to.value));

const setRecipient = (address = '') => {
  to.value = BaseApi.formatAddress({ address, ethereumAddress: address }, network.value);
};

const isDisabled = computed(() => false);

const setAddress = (address: string, showHistBook = false) => {
  newAddress.value = address;
  showHistoryBook.value = showHistBook;
};

const getStatusWallet = (ethereumAddress: string) => {
  const currentAddress = ethereumAddress;

  return currentAddress === to.value;
};

const setWallet = (ethereumAddress: string) => {
  to.value = ethereumAddress;

  toggleMyWalletsVisibility();
};

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
