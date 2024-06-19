<template>
  <Popup
    sizeWidth="mini"
    verticalPlacement="top"
    horizontalPlacement="right"
    data-testid="hidNfts"
    :top="40"
    :left="-40"
    :showBorder="true"
    headerText="nft.hideNfts"
    @handlerClose="onClose"
  >
    <div class="nft-settings">
      <div class="form-item">
        <span data-testid="spam">{{ $t('nft.spam') }}</span>
        <Switcher data-testid="spamSwitcher" :value="nftSettings.spam" @change="toggleNftSettingsSpam" />
      </div>
      <div class="form-item">
        <span data-testid="airdrop">{{ $t('nft.airdrop') }}</span>
        <Switcher data-testid="airdropSwitcher" :value="nftSettings.airdrop" @change="toggleNftSettingsAirdrop" />
      </div>
    </div>
  </Popup>
</template>

<script lang="ts" setup>
import { ref, onBeforeUnmount, onMounted, computed } from 'vue';
import { changeNftSettings } from '@/extension/messaging/nfts';
import { accountController } from '@/controllers';
import { type SelectedWallet, useStore } from '@/store';
const store = useStore();
const emit = defineEmits(['handleClose']);
const nftSettings = ref({ spam: false, airdrop: false });
const selectedWallet = computed<SelectedWallet>(() => store.getters.selectedWallet);
onMounted(() => {
  const settings = accountController.getNftSettings();

  if (!Object.keys(settings).length) {
    nftSettings.value.airdrop = false;
    nftSettings.value.spam = true;

    return;
  }

  nftSettings.value.airdrop = !!settings.airdrop;
  nftSettings.value.spam = !!settings.spam;
});

onBeforeUnmount(() => {
  changeNftSettings({
    address: selectedWallet.value.ethereumAddress,
    settings: nftSettings.value,
  });
  accountController.setNftSettings(nftSettings.value);
});
const onClose = () => emit('handleClose');

const toggleNftSettingsSpam = () => {
  nftSettings.value.spam = !nftSettings.value.spam;
};

const toggleNftSettingsAirdrop = () => {
  nftSettings.value.airdrop = !nftSettings.value.airdrop;
};
</script>

<style lang="scss" scoped>
.nft-settings {
  display: flex;
  flex-flow: column;
  gap: 5px;
  margin: 5px;

  .form-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 5px;
    color: $grayish-white;
    border: 1px solid transparent;
    padding: 0px 0 10px;

    &:nth-child(odd) {
      border-bottom-color: $default-background-color;
    }
  }
}
</style>
