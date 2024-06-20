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
          <FInput
            :value="recipientCut"
            icon="close"
            placeholder="assets.sendTo"
            data-testid="sendToInput"
            @click="setRecipient"
          />
          <div class="activity-buttons row">
            <BadgeButton text="assets.history" data-testid="historyBtn" @click="toggleHistoryBookVisibility" />

            <BadgeButton text="common.paste" data-testid="pasteBtn" @click="paste" />

            <BadgeButton
              v-if="showMyWalletsButton"
              text="assets.myWallets"
              data-testid="myWalletsBtn"
              @click="toggleMyWalletsVisibility"
            />
          </div>
        </div>

        <dl class="fees">
          <dt>{{ $t('common.networkFees') }}</dt>
          <dd data-testid="networkFeeValue">{{ formatFeeString }}</dd>
        </dl>
      </template>

      <template v-if="popupControls.showConfirmScreen">
        <img :src="image" class="nft-img" alt="nft" width="180px" height="180px" />

        <ContentForm bottomRightCorner>
          <InfoRow v-for="(value, key) in nftDetails" :text="key" :value="value" :key="key" />
        </ContentForm>
      </template>

      <EditAddressBook v-if="showEditAddressBook" :network="network" :_address="formInfo.to" @setAddress="setAddress" />

      <HistoryBook
        v-else-if="popupControls.showHistoryBook"
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
          v-for="{ name, address, ethereumAddress, isMobile } in filteredWallets"
          :key="ethereumAddress"
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
        v-if="showSubmitBtn"
        size="big"
        data-testid="proceedBtn"
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
import { type NetworkJson } from '@extension-base/types';
import type { NftCollection, NftTx } from '@extension-base/services/nft-service/types';
import type { AccountJson } from '@extension-base/background/types/types';
import { cut, getClipboard } from '@/helpers';
import { type SelectedWallet, useStore } from '@/store';
import HistoryBook from '@/screens/wallet&asset/HistoryBook.vue';
import EditAddressBook from '@/screens/wallet&asset/EditAddressBook.vue';
import ConfirmationPasswordPopup from '@/screens/wallet&asset/ConfirmationPasswordPopup.vue';
import WalletInfo from '@/screens/main/WalletInfo.vue';
import { checkNft } from '@/extension/messaging/nfts';
import ContentForm from '@/components/ContentForm.vue';
import { Components } from '@/router/routes';

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
  insufficientFunds: false,
  incorrectRecipient: false,
});

const formInfo = reactive({
  fee: '0',
  to: '',
  newAddress: '',
  assetId: '',
});

const showEditAddressBook = computed(() => formInfo.newAddress !== '');
const id = computed(() => route.params.id);
const contract = computed(() => route.params.contract);
const nfts = computed<NftCollection[]>(() => store.getters.nfts ?? {});

const collection = computed<NftCollection | undefined>(() => nfts.value.find((nft) => nft.address === contract.value));

const ownedNfts = computed(() => collection.value?.ownedNfts ?? []);
const nft = computed(() => ownedNfts.value.find((nft) => nft.id === id.value));
const wallets = computed<AccountJson[]>(() => store.getters.getAccounts);
const selectedWallet = computed<SelectedWallet>(() => store.getters.selectedWallet);
const image = computed(() => nft.value?.image ?? require('@/assets/fearless-logo-animated.gif'));

const filteredWallets = computed(() =>
  wallets.value.filter(({ active, ethereumAddress }) => !active && ethereumAddress)
);
const showMyWalletsButton = computed(() => filteredWallets.value.length !== 0);
const paste = () => (formInfo.to = getClipboard());
const toggleMyWalletsVisibility = () => (popupControls.showMyWallets = !popupControls.showMyWallets);
const toggleHistoryBookVisibility = () => (popupControls.showHistoryBook = !popupControls.showHistoryBook);
const recipientCut = computed(() => cut(formInfo.to));

const isDisabled = computed(() => formInfo.to === '' || errors.incorrectRecipient || errors.insufficientFunds);

const setRecipient = (address = '') => (formInfo.to = address);

const setAddress = (address: string, showHistoryBook = false) => {
  formInfo.newAddress = address;
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
  if (errors.insufficientFunds) return t('assets.insufficientBalance', { asset: assetSymbol.value.toUpperCase() });

  return `common.${popupControls.showConfirmScreen ? 'confirm' : 'send'}`;
});

const showBackIcon = computed(
  () =>
    popupControls.showHistoryBook ||
    showEditAddressBook.value ||
    popupControls.showMyWallets ||
    popupControls.showConfirmScreen
);

const onBack = () => {
  popupControls.showConfirmScreen = false;
  popupControls.showMyWallets = false;

  if (showEditAddressBook.value) {
    setAddress('', true);
  } else popupControls.showHistoryBook = false;
};

const onClose = () => router.back();
const nftDetails = computed(() => ({
  'assets.sendTo': recipientCut.value,
  'nft.collection': collection.value?.name,
  'nft.owned': cut(selectedWallet.value.ethereumAddress),
  'common.network': collection.value?.network ?? '',
  'nft.type': nft.value?.type ?? '',
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
      if (checkData.error === 'insufficientFunds') errors.insufficientFunds = true;
    }

    formInfo.fee = checkData.fee;
  });
}

const showSendForm = computed(
  () =>
    !popupControls.showHistoryBook &&
    !showEditAddressBook.value &&
    !popupControls.showMyWallets &&
    !popupControls.showConfirmScreen
);
const showSubmitBtn = computed(
  () => !popupControls.showHistoryBook && !showEditAddressBook.value && !popupControls.showMyWallets
);
const formatFeeString = computed(() => `${n(+formInfo.fee, 'decimalPrecise')} ${assetSymbol.value?.toUpperCase()}`);

watch(tx, validateTx);
onMounted(validateTx);

const onConfirmClose = () => {
  router.push({ name: Components.Nfts });
};
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
    width: 150px;
    height: 150px;
    clip-path: $big-clip-path-left-top-and-right-bottom;
    border-radius: $default-border-radius;
  }
  .fees {
    display: flex;
    justify-content: space-between;
  }
}
</style>
