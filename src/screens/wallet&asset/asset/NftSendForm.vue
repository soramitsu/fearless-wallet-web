<template>
  <AboveForm
    header="common.send"
    :fullScreen="true"
    :showBackIcon="showBackIcon"
    @handlerBack="onBack"
    @closeHandler="onClose"
  >
    <div class="nft-send-form">
      <div
        v-if="!popupControls.showHistoryBook && !popupControls.showMyWallets && !popupControls.showConfirmScreen"
        class="container"
      >
        <FInput v-model="recipientCut" icon="close" placeholder="assets.sendTo" @click="setRecipient" />
        <div class="activity-buttons row">
          <BadgeButton text="assets.history" @click="toggleHistoryBookVisibility" />

          <BadgeButton text="common.paste" @click="paste" />

          <BadgeButton v-if="showMyWalletsButton" text="assets.myWallets" @click="toggleMyWalletsVisibility" />
        </div>
      </div>

      <template v-if="popupControls.showConfirmScreen">
        <img :src="image" class="nft-img" alt="nft" width="180px" height="180px" />
        <InfoList>
          <InfoItem v-for="(value, key) in nftDetails" :name="key" :value="value" :key="key" />
        </InfoList>
      </template>

      <HistoryBook
        v-if="popupControls.showHistoryBook"
        :network="network"
        :assetId="assetId"
        @toggleHistoryBookVisibility="toggleHistoryBookVisibility"
        @setRecipient="setRecipient"
        @setAddress="setAddress"
      />
      <ConfirmationPasswordPopup
        v-if="popupControls.showConfirmationPasswordPopup"
        :tx="tx"
        extrinsicType="nft"
        @close="onConfirmClose"
      />

      <div v-if="popupControls.showMyWallets">
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

      <div
        v-if="!popupControls.showConfirmScreen && !popupControls.showHistoryBook && !popupControls.showMyWallets"
        class="fees"
      >
        <span>{{ $t('common.networkFees') }}</span>
        <span>{{ fees.fees }}</span>
      </div>

      <FButton
        v-if="!popupControls.showHistoryBook && !popupControls.showMyWallets"
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
import { ref, computed, reactive, onMounted, watch } from 'vue';
import { useRoute } from 'vue-router/composables';
import type { NftCollection, NftState, NftTx } from '@extension-base/services/nft-service/types';
import type { AccountJson } from '@extension-base/background/types/types';
import { cut, getClipboard } from '@/helpers';
import { type SelectedWallet, useStore } from '@/store';
import HistoryBook from '@/screens/wallet&asset/HistoryBook.vue';
import ConfirmationPasswordPopup from '@/screens/wallet&asset/ConfirmationPasswordPopup.vue';
import WalletInfo from '@/screens/main/WalletInfo.vue';
import InfoList from '@/screens/extension-ui/InfoList.vue';
import InfoItem from '@/screens/extension-ui/InfoItem.vue';
import { checkNft } from '@/extension/messaging/nfts';
import router from '@/router';

const store = useStore();
const to = ref('');
const popupControls = reactive({
  showConfirmScreen: false,
  showConfirmationPasswordPopup: false,
  showHistoryBook: false,
  showMyWallets: false,
});
const fees = reactive({ fees: '0' });
const assetId = ref('');
const wallets = computed<AccountJson[]>(() => store.getters.getAccounts);
const selectedWallet = computed<SelectedWallet>(() => store.getters.selectedWallet);

const filteredWallets = computed(() =>
  wallets.value.filter(({ active, ethereumAddress }) => !active && ethereumAddress)
);
const showMyWalletsButton = computed(() => filteredWallets.value.length !== 0);
const paste = () => (to.value = getClipboard());
const toggleMyWalletsVisibility = () => (popupControls.showMyWallets = !popupControls.showMyWallets);
const toggleHistoryBookVisibility = () => (popupControls.showHistoryBook = !popupControls.showHistoryBook);
const recipientCut = computed(() => cut(to.value));

const isDisabled = computed(() => to.value === '');

const setRecipient = (address = '') => (to.value = address);

const setAddress = (address: string, showHistoryBook = false) => {
  to.value = address;
  popupControls.showHistoryBook = showHistoryBook;
};

const getStatusWallet = (ethereumAddress: string) => ethereumAddress === to.value;

const setWallet = (ethereumAddress: string) => {
  to.value = ethereumAddress;

  toggleMyWalletsVisibility();
};

const actionBtnName = computed(() => `common.${popupControls.showConfirmScreen ? 'confirm' : 'accept'}`);
const showBackIcon = computed(
  () => popupControls.showHistoryBook || popupControls.showMyWallets || popupControls.showConfirmScreen
);

const onBack = () => {
  popupControls.showConfirmScreen = false;
  popupControls.showMyWallets = false;
  popupControls.showHistoryBook = false;
};

const onClose = () => router.back();

const route = useRoute();

const id = computed(() => route.params.id);
const contract = computed(() => route.params.contract);
const nfts = computed<NftState>(() => store.getters.nfts ?? {});

const collection = computed<NftCollection | undefined>(() => nfts.value[contract.value]);

const ownedNfts = computed(() => collection.value?.ownedNfts ?? []);
const nft = computed(() => ownedNfts.value.find((nft) => nft.id === id.value));
const image = computed(() => nft.value?.image ?? '');
const nftDetails = computed(() => ({
  'send to': to.value,
  collection: contract.value,
  owned: selectedWallet.value.ethereumAddress,
  network: collection.value?.network ?? '',
  type: nft.value?.type ?? '',
}));
const network = computed(() => nft.value?.network ?? '');

const tx = computed<NftTx>(() => ({
  type: nft.value?.type ?? '',
  contract: contract.value,
  to: to.value,
  from: selectedWallet.value.ethereumAddress,
  network: nft.value?.network ?? '',
  tokenId: nft.value?.id ?? '',
}));

const onProceed = () => {
  if (!popupControls.showConfirmScreen) popupControls.showConfirmScreen = true;
  else popupControls.showConfirmationPasswordPopup = true;
};

const fetchFees = async () => {
  if (!tx.value.network) return;

  const checkData = await checkNft(tx.value);
  fees.fees = checkData.fee;
};

watch(tx, fetchFees);
onMounted(fetchFees);

const onConfirmClose = () => (popupControls.showConfirmScreen = true);
</script>

<style lang="scss" scoped>
.nft-send-form {
  height: 100%;
  display: flex;
  flex-flow: column;
  justify-content: space-between;
  gap: 6px;

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

  .wallet {
    cursor: pointer;
  }
  .nft-img {
    margin-left: auto;
    margin-right: auto;
    width: 180px;
    height: 180px;
  }
  .fees {
    display: flex;
    justify-content: space-between;
  }
}
</style>
