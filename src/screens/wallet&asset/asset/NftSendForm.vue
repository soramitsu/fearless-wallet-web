<template>
  <AboveForm
    header="common.send"
    :fullScreen="true"
    :showBackIcon="showBackIcon"
    @handlerBack="onBack"
    @closeHandler="onClose"
  >
    <div class="nft-send-form">
      <template v-if="showSendForm">
        <div class="container">
          <FInput v-model="recipientCut" icon="close" placeholder="assets.sendTo" @click="setRecipient" />
          <div class="activity-buttons row">
            <BadgeButton text="assets.history" @click="toggleHistoryBookVisibility" />

            <BadgeButton text="common.paste" @click="paste" />

            <BadgeButton v-if="showMyWalletsButton" text="assets.myWallets" @click="toggleMyWalletsVisibility" />
          </div>
        </div>

        <div class="fees">
          <span>{{ $t('common.networkFees') }}</span>
          <span>{{ formatFeeString }}</span>
        </div>
      </template>

      <template v-if="popupControls.showConfirmScreen">
        <img v-if="image" :src="image" class="nft-img" alt="nft" width="180px" height="180px" />
        <img
          v-else
          class="nft-img"
          src="@/assets/fearless-logo-animated.gif"
          alt="nft-placeholder"
          width="180px"
          height="180px"
        />

        <InfoList>
          <InfoItem v-for="(value, key) in nftDetails" :name="key" :value="value" :key="key" />
        </InfoList>
      </template>

      <HistoryBook
        v-if="popupControls.showHistoryBook"
        :network="network"
        :assetId="formInfo.assetId"
        @toggleHistoryBookVisibility="toggleHistoryBookVisibility"
        @setRecipient="setRecipient"
        @setAddress="setAddress"
      />

      <ConfirmationPasswordPopup
        v-if="popupControls.showConfirmationPasswordPopup"
        :tx="tx"
        extrinsicType="nft"
        :firstIcon="image"
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

      <FButton
        v-if="showSubmitBtn"
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
import { computed, reactive, onMounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router/composables';
import { useI18n } from 'vue-i18n-composable';
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
import { type NetworkJson } from '@/extension/background/extension-base/src/types';

const store = useStore();
const route = useRoute();
const router = useRouter();
const { t, n } = useI18n();

const popupControls = reactive({
  showConfirmScreen: false,
  showConfirmationPasswordPopup: false,
  showHistoryBook: false,
  showMyWallets: false,
});

const errors = reactive({
  unsufficientFunds: false,
  incorrenctRecipient: false,
});
const formInfo = reactive({
  fee: '0',
  to: '',
  assetId: '',
});
const id = computed(() => route.params.id);
const contract = computed(() => route.params.contract);
const nfts = computed<NftState>(() => store.getters.nfts ?? {});

const collection = computed<NftCollection | undefined>(() => nfts.value[contract.value]);

const ownedNfts = computed(() => collection.value?.ownedNfts ?? []);
const nft = computed(() => ownedNfts.value.find((nft) => nft.id === id.value));
const wallets = computed<AccountJson[]>(() => store.getters.getAccounts);
const selectedWallet = computed<SelectedWallet>(() => store.getters.selectedWallet);

const filteredWallets = computed(() =>
  wallets.value.filter(({ active, ethereumAddress }) => !active && ethereumAddress)
);
const showMyWalletsButton = computed(() => filteredWallets.value.length !== 0);
const paste = () => (formInfo.to = getClipboard());
const toggleMyWalletsVisibility = () => (popupControls.showMyWallets = !popupControls.showMyWallets);
const toggleHistoryBookVisibility = () => (popupControls.showHistoryBook = !popupControls.showHistoryBook);
const recipientCut = computed(() => cut(formInfo.to));

const isDisabled = computed(() => formInfo.to === '' || errors.incorrenctRecipient || errors.unsufficientFunds);

const setRecipient = (address = '') => (formInfo.to = address);

const setAddress = (address: string, showHistoryBook = false) => {
  formInfo.to = address;
  popupControls.showHistoryBook = showHistoryBook;
};

const getStatusWallet = (ethereumAddress: string) => ethereumAddress === formInfo.to;

const setWallet = (ethereumAddress: string) => {
  formInfo.to = ethereumAddress;

  toggleMyWalletsVisibility();
};

const assetSymbol = computed(() => {
  const network: NetworkJson = store.getters.getNetwork(nft.value?.network ?? '');

  return network?.assets.find((el) => el.isUtility)?.symbol ?? '';
});

const actionBtnName = computed(() => {
  if (errors.unsufficientFunds) return t('assets.insufficientBalance', { asset: assetSymbol.value.toUpperCase() });

  return `common.${popupControls.showConfirmScreen ? 'confirm' : 'send'}`;
});

const showBackIcon = computed(
  () => popupControls.showHistoryBook || popupControls.showMyWallets || popupControls.showConfirmScreen
);

const onBack = () => {
  popupControls.showConfirmScreen = false;
  popupControls.showMyWallets = false;
  popupControls.showHistoryBook = false;
};

const onClose = () => router.back();

const image = computed(() => nft.value?.image ?? '');
const nftDetails = computed(() => ({
  'send to': formInfo.to,
  collection: contract.value,
  owned: selectedWallet.value.ethereumAddress,
  network: collection.value?.network ?? '',
  type: nft.value?.type ?? '',
}));

const network = computed(() => nft.value?.network ?? '');

const tx = computed<NftTx>(() => ({
  type: nft.value?.type ?? '',
  contract: contract.value,
  to: formInfo.to,
  from: selectedWallet.value.ethereumAddress,
  network: nft.value?.network ?? '',
  tokenId: nft.value?.id ?? '',
}));

const onProceed = () => {
  if (!popupControls.showConfirmScreen) popupControls.showConfirmScreen = true;
  else popupControls.showConfirmationPasswordPopup = true;
};

function validateTx() {
  if (!tx.value.network) return;

  checkNft(tx.value).then((checkData) => {
    if (checkData.error) {
      if (checkData.error === 'unsufficientFunds') errors.unsufficientFunds = true;
    }

    formInfo.fee = checkData.fee;
  });
}

const showSendForm = computed(
  () => !popupControls.showHistoryBook && !popupControls.showMyWallets && !popupControls.showConfirmScreen
);
const showSubmitBtn = computed(() => !popupControls.showHistoryBook && !popupControls.showMyWallets);
const formatFeeString = computed(() => `${n(+formInfo.fee, 'decimalPrecise')} ${assetSymbol.value?.toUpperCase()}`);

watch(tx, validateTx);
onMounted(validateTx);

const onConfirmClose = () => (popupControls.showConfirmationPasswordPopup = false);
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
