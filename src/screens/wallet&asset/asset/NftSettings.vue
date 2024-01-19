<template>
  <Popup
    sizeWidth="mini"
    verticalPlacement="top"
    horizontalPlacement="right"
    :top="40"
    :left="-40"
    :showBorder="true"
    headerText="Hide NFTs"
    @handlerClose="onClose"
  >
    <div class="nft-settings">
      <div class="form-item">
        <span>Spam</span>
        <Switcher v-model="nftSettings.spam" />
      </div>
      <div class="form-item">
        <span>Airdrops</span>
        <Switcher v-model="nftSettings.airdrop" />
      </div>
    </div>
  </Popup>
</template>

<script lang="ts" setup>
import { reactive, onBeforeUnmount, onMounted } from 'vue';
import { changeNftSettings } from '@/extension/messaging/nfts';
import { accountController } from '@/controllers';

const emit = defineEmits(['handleClose']);
const nftSettings = reactive({ spam: false, airdrop: false });

onMounted(() => {
  const settings = accountController.getNftSettings();

  nftSettings.airdrop = !!settings.airdrop;
  nftSettings.spam = !!settings.spam;
});

onBeforeUnmount(() => {
  changeNftSettings(nftSettings);
  accountController.setNftSettings(nftSettings);
});
const onClose = () => emit('handleClose');
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
