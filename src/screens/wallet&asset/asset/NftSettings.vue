<template>
  <Popup
    sizeWidth="mini"
    verticalPlacement="top"
    horizontalPlacement="right"
    :top="40"
    :left="-40"
    :showBorder="true"
    headerText="Hide NFTs"
    @handlerClose="$emit('handlerClose')"
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
import { ref } from 'vue';

const spam = ref(false);
const airdrop = ref(false);
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
