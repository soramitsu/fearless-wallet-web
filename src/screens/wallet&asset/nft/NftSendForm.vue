<template>
  <AboveForm
    :header="header"
    :fullScreen="true"
    :showBackIcon="showBackIcon"
    @handlerBack="onBack"
    @closeHandler="onClose"
  >
    <div class="nft-send-form">
      <div class="container">
        <template v-if="showSendForm">
          <FInput
            :value="recipientCut"
            icon="close"
            size="big"
            placeholder="assets.sendTo"
            data-testid="sendToInput"
            :readonly="true"
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

          <InfoRow
            text="assets.networkFee"
            :value="formatFeeString"
            :hideLastBorder="true"
            data-testid="networkFeeValue"
          />
        </template>

        <template v-else-if="popupControls.showConfirmScreen">
          <img :src="image" class="nft-img" alt="nft" />

          <ContentForm bottomRightCorner>
            <InfoRow v-for="(value, key) in nftDetails" :text="key" :value="value" :key="key" />
          </ContentForm>
        </template>

        <EditAddressBook
          v-if="showEditAddressBook"
          :network="network"
          :_address="formInfo.newAddress"
          @setAddress="setAddress"
        />

        <HistoryBook
          v-else-if="popupControls.showHistoryBook"
          :network="network"
          :assetId="formInfo.assetId"
          @toggleHistoryBookVisibility="toggleHistoryBookVisibility"
          @setRecipient="setRecipient"
          @setAddress="setAddress"
        />

        <div v-else-if="popupControls.showMyWallets">
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
      </div>

      <ConfirmationPasswordPopup
        v-if="popupControls.showConfirmationPasswordPopup"
        extrinsicType="nft"
        :tx="tx"
        :firstIcon="image"
        @close="onConfirmClose"
      />

      <FButton
        v-if="showSubmitBtn"
        size="big"
        data-testid="proceedBtn"
        class="button"
        :disabled="isDisabled"
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
import BaseApi from '@/util/BaseApi';

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
const recipientCut = computed(() => cut(formInfo.to));
const network = computed(() => nft.value?.network ?? '');

const isSameAddress = computed(() => BaseApi.isSameAddress(selectedWallet.value, formInfo.to, network.value));
const isDisabled = computed(() => formInfo.to === '' || errors.incorrectRecipient || errors.insufficientFunds);

const assetSymbol = computed(() => {
  const net: NetworkJson = store.getters.getNetwork(network.value);

  return net?.assets.find(({ isUtility }) => isUtility)?.symbol ?? '';
});

const formatFeeString = computed(() => `${n(+formInfo.fee, 'decimalPrecise')} ${assetSymbol.value?.toUpperCase()}`);

const header = computed(() => {
  if (popupControls.showHistoryBook) return 'assets.chooseFromHistory';

  if (popupControls.showMyWallets) return 'assets.wallets';

  if (showEditAddressBook.value) return 'assets.addContact';

  return 'common.send';
});

const actionBtnName = computed(() => {
  if (errors.insufficientFunds) return t('assets.insufficientBalance', { asset: assetSymbol.value.toUpperCase() });

  if (isSameAddress.value) return 'assets.isSameAddress';

  return `common.${popupControls.showConfirmScreen ? 'confirm' : 'send'}`;
});

const showBackIcon = computed(
  () =>
    popupControls.showHistoryBook ||
    showEditAddressBook.value ||
    popupControls.showMyWallets ||
    popupControls.showConfirmScreen
);

const nftDetails = computed(() => ({
  'assets.sendTo': recipientCut.value,
  'nft.collection': collection.value?.name,
  'nft.owned': cut(selectedWallet.value.ethereumAddress),
  'common.network': collection.value?.network ?? '',
  'nft.type': nft.value?.type ?? '',
  'assets.networkFee': formatFeeString,
}));

const tx = computed<NftTx>(() => ({
  type: nft.value?.type ?? '',
  contract: contract.value,
  to: formInfo.to,
  from: selectedWallet.value.ethereumAddress,
  network: nft.value?.network ?? '',
  tokenId: nft.value?.id ?? '',
}));

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

watch(formInfo, validateAddress);
watch(tx, validateTx);
onMounted(validateTx);

const onConfirmClose = () => router.push({ name: Components.Nfts });
const paste = () => (formInfo.to = getClipboard());
const toggleMyWalletsVisibility = () => (popupControls.showMyWallets = !popupControls.showMyWallets);
const toggleHistoryBookVisibility = () => (popupControls.showHistoryBook = !popupControls.showHistoryBook);
const setRecipient = (address = '') => (formInfo.to = address);
const getStatusWallet = (ethereumAddress: string) => ethereumAddress === formInfo.to;
const onClose = () => router.back();

const setAddress = (address: string, showHistoryBook = false) => {
  formInfo.newAddress = address;
  popupControls.showHistoryBook = showHistoryBook;
};

const onBack = () => {
  popupControls.showConfirmScreen = false;
  popupControls.showMyWallets = false;

  if (showEditAddressBook.value) setAddress('', true);
  else popupControls.showHistoryBook = false;
};

const setWallet = (ethereumAddress: string) => {
  formInfo.to = ethereumAddress;

  toggleMyWalletsVisibility();
};

const onProceed = () => {
  if (!popupControls.showConfirmScreen) popupControls.showConfirmScreen = true;
  else popupControls.showConfirmationPasswordPopup = true;
};

function validateAddress() {
  if (formInfo.to === '' || network.value === '' || isSameAddress.value) errors.incorrectRecipient = true;
  else {
    const isValid = BaseApi.validateAddress(formInfo.to, network.value);

    errors.incorrectRecipient = !isValid;
  }
}

function validateTx() {
  if (!tx.value.network) return;

  checkNft(tx.value).then((checkData) => {
    if (checkData?.error === 'insufficientFunds') errors.insufficientFunds = true;

    formInfo.fee = checkData.fee;
  });
}
</script>

<style lang="scss" scoped>
.nft-send-form {
  height: 100%;
  display: flex;
  flex-flow: column;
  justify-content: space-between;

  .activity-buttons {
    display: flex;
    user-select: none;
    margin: 10px 0 30px;
  }

  .container {
    display: flex;
    flex-flow: column;
    height: 100%;
  }

  .wallet {
    cursor: pointer;
  }

  .nft-img {
    margin: 0 auto 20px;
    width: 180px;
    height: 180px;
    clip-path: $big-clip-path-left-top-and-right-bottom;
    border-radius: $default-border-radius;
  }
}
</style>
