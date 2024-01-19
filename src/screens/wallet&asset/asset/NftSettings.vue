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
        <Switcher v-model="spam" />
      </div>
      <div class="form-item">
        <span>Airdrops</span>
        <Switcher v-model="airdrop" />
      </div>
    </div>
  </Popup>
</template>

<script lang="ts" setup>
import { ref, onBeforeUnmount, onMounted } from 'vue';
import { changeNftSettings } from '@/extension/messaging/nfts';
import { accountController } from '@/controllers';
import { type NftSettings } from '@/extension/background/extension-base/src/services/nft-service/types';

const emit = defineEmits(['handleClose']);

const spam = ref(false);
const airdrop = ref(false);

onMounted(() => {
  const settings = accountController.getNftSettings();

  airdrop.value = !!settings.airdrop;
  spam.value = !!settings.spam;
});

onBeforeUnmount(() => {
  const settings: NftSettings = { spam: spam.value, airdrop: airdrop.value };

  changeNftSettings(settings);
  accountController.setNftSettings(settings);
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
