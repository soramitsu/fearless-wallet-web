<template>
  <AboveForm
    header="common.send"
    :fullScreen="true"
    :showBackIcon="showBackIcon"
    @handlerBack="onBack"
    @closeHandler="onClose"
  >
    <div class="nft-send-form">
      <div v-if="!showHistoryBook && !showMyWallets && !showConfirmScreen" class="container">
        <FInput v-model="recipientCut" icon="close" placeholder="assets.sendTo" @click="setRecipient" />

        <div class="activity-buttons row">
          <BadgeButton text="assets.history" @click="toggleHistoryBookVisibility" />

          <BadgeButton text="common.paste" @click="paste" />

          <BadgeButton v-if="showMyWalletsButton" text="assets.myWallets" @click="toggleMyWalletsVisibility" />
        </div>
      </div>

      <template v-if="showConfirmScreen">
        <img :src="image" class="nft-img" alt="nft" width="180px" height="180px" />
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

      <div v-if="showMyWallets">
        <WalletInfo
          v-for="{ name, ethereumAddress, isMobile } in filteredWallets"
          :key="ethereumAddress"
          :name="name"
          :isSelected="getStatusWallet(ethereumAddress)"
          :isMobile="isMobile"
          :address="ethereumAddress"
          :showMenu="false"
          class="wallet"
          @setWallet="setWallet(ethereumAddress)"
        />
      </div>

      <FButton
        v-if="!showHistoryBook && !showMyWallets"
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
import { useRoute } from 'vue-router/composables';
import type { NftCollection, NftState, NftTx } from '@extension-base/services/nft-service/types';
import type { AccountJson } from '@extension-base/background/types/types';
import { cut, getClipboard } from '@/helpers';
import { type SelectedWallet, useStore } from '@/store';
import HistoryBook from '@/screens/wallet&asset/HistoryBook.vue';
import WalletInfo from '@/screens/main/WalletInfo.vue';
import InfoList from '@/screens/extension-ui/InfoList.vue';
import InfoItem from '@/screens/extension-ui/InfoItem.vue';
import { sendNft } from '@/extension/messaging/nfts';
import router from '@/router';

const store = useStore();

const to = ref('');
const showHistoryBook = ref(false);
const showMyWallets = ref(false);
const network = ref('ethreum');
const assetId = ref('');
const wallets = computed<AccountJson[]>(() => store.getters.getAccounts);
const selectedWallet = computed<SelectedWallet>(() => store.getters.selectedWallet);

const filteredWallets = computed(() =>
  wallets.value.filter(({ active, ethereumAddress }) => !active && ethereumAddress)
);
const showMyWalletsButton = computed(() => filteredWallets.value.length !== 0);
const paste = () => (to.value = getClipboard());
const toggleMyWalletsVisibility = () => (showMyWallets.value = !showMyWallets.value);
const toggleHistoryBookVisibility = () => (showHistoryBook.value = !showHistoryBook.value);
const recipientCut = computed(() => cut(to.value));

const setRecipient = (address = '') => (to.value = address);
const isDisabled = computed(() => to.value === '');

const setAddress = (address: string, showHistBook = false) => {
  to.value = address;
  showHistoryBook.value = showHistBook;
};

const getStatusWallet = (ethereumAddress: string) => ethereumAddress === to.value;

const setWallet = (ethereumAddress: string) => {
  to.value = ethereumAddress;

  toggleMyWalletsVisibility();
};

const showConfirmScreen = ref(false);

const actionBtnName = computed(() => `common.${showConfirmScreen.value ? 'confirm' : 'accept'}`);

const tx = computed<NftTx>(() => ({
  type: '',
  contract: '',
  to: '',
  network: '',
  tokenId: '',
}));

const onProceed = () => {
  if (!showConfirmScreen.value) showConfirmScreen.value = true;
  else sendNft(tx.value);
};

const showBackIcon = computed(() => showHistoryBook.value || showMyWallets.value || showConfirmScreen.value);

const onBack = () => {
  showConfirmScreen.value = showMyWallets.value = showHistoryBook.value = false;
};

const onClose = () => {
  router.back();
};

const route = useRoute();

const id = computed(() => route.params.id);
const contract = computed(() => route.params.contract);
const nfts = computed<NftState>(() => store.getters.nfts ?? []);

const collection = computed<NftCollection | undefined>(() => {
  return nfts.value[contract.value];
});
const ownedNfts = computed(() => collection.value?.ownedNfts ?? []);
const nft = computed(() => ownedNfts.value.find((nft) => nft.id === id.value));
const image = computed(() => nft.value?.img ?? '');
const nftDetails = computed(() => ({
  'send to': to.value,
  collection: contract.value,
  owned: selectedWallet.value.ethereumAddress,
  network: collection.value?.network ?? '',
  type: nft.value?.type ?? '',
}));
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
.wallet {
  cursor: pointer;
}
.nft-img {
  margin-left: auto;
  margin-right: auto;
  width: 180px;
  height: 180px;
}
</style>
