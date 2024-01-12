<template>
  <div class="nft-settings">
    <div class="form-item">
      <Switcher v-model="spam" />
      <span>Spam</span>
    </div>
    <div class="form-item">
      <Switcher v-model="airdrop" />
      <span>Airdrops</span>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { ref } from 'vue';

const spam = ref(false);
const airdrop = ref(false);
</script>

<style lang="scss" scoped>
.form-item {
  display: flex;
  gap: 5px;
  align-items: center;
  color: $grayish-white;
}
</style>
