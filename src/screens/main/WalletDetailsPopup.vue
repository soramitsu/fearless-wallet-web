<template>
  <Popup
    sizeWidth="mini"
    :showBorder="true"
    :showHeader="false"
    :showBlur="false"
    :showBackground="false"
    :top="top"
    :left="300"
    @handlerClose="close"
  >
    <div class="wallet-details">
      <div v-if="selectedAccountIsSubstrate" class="row" @click="openWalletDetails">
        <div class="label" data-testid="walletDetails">Wallet Details</div>
      </div>

      <div v-if="isExportPossible" class="row" @click="exportToGoogleDrive">
        <div class="label google" data-testid="exportToGoogle">Export to Google</div>
      </div>

      <div class="row" @click="deleteWallet">
        <div class="label delete" data-testid="deleteWallet">Delete Wallet</div>
      </div>
    </div>
  </Popup>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { Components } from '@/router/routes';
import { forgetAccount, initGoogleAuth, updateCurrentAccount } from '@/extension/messaging';
import { useAccountsStore } from '@/stores/accounts';
import { IS_EXTENSION } from '@/consts/global';
import { WalletEcosystem } from '@/interfaces';

defineOptions({
  name: 'WalletDetailsPopup',
});

const accountsStore = useAccountsStore();
const router = useRouter();

const props = defineProps<{
  buttonTopClick: number;
  selectedWalletAddress: string;
}>();

const emit = defineEmits<{
  (_event: 'close'): void;
  (_event: 'closeSelectWalletPopup'): void;
}>();

const isExtension = IS_EXTENSION;

const selectedAccount = computed(() =>
  accountsStore.accounts.find(({ address }) => address === props.selectedWalletAddress)
);

const selectedAccountIsSubstrate = computed(() => selectedAccount.value?.walletEcosystem === WalletEcosystem.Substrate);

const isExportPossible = computed(() => {
  if (!isExtension || selectedAccount.value?.isMobile) return false;

  return selectedAccountIsSubstrate.value;
});

const top = computed(() => props.buttonTopClick - 30);

const close = () => {
  emit('close');
};

const deleteWallet = async () => {
  await forgetAccount(props.selectedWalletAddress, selectedAccount.value?.isMobile ? 'mobile' : 'native');

  if (accountsStore.accounts.length === 0) {
    router.push({ name: Components.Welcome });
  } else {
    close();
  }
};

const exportToGoogleDrive = () => {
  initGoogleAuth('export', props.selectedWalletAddress);
};

const openWalletDetails = async () => {
  const walletInfo = accountsStore.accounts.find(({ address }) => address === props.selectedWalletAddress);

  await updateCurrentAccount(props.selectedWalletAddress, walletInfo?.walletEcosystem);

  router.push({ name: Components.AccountSetting });

  emit('closeSelectWalletPopup');
};
</script>

<style lang="scss" scoped>
.wallet-details {
  color: $default-white;
  font-weight: 500;
  display: flex;
  flex-flow: column;
  max-height: 90px;
  overflow: hidden;
  gap: 16px;
  padding: 0 10px;

  .row {
    &:last-child {
      margin-bottom: 0;
    }

    &:hover {
      cursor: pointer;
      color: rgba(255, 255, 255, 0.9);

      .delete {
        opacity: 1;
      }
    }

    .label {
      margin: auto 0 auto 10px;
      width: 160px;
      text-align: left;
    }

    .delete {
      color: $orange-color;
      opacity: 0.8;
    }
  }
}
</style>
