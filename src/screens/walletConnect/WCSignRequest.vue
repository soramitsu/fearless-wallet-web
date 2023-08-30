<template>
  <div class="controls">
    <FButton text="walletConnect.reject" type="secondary" :border="false" width="100%" @click="onReject" />
    <FButton text="walletConnect.approve" width="100%" @click="onApprove" />
  </div>
</template>

<script setup lang="ts">
const onApprove = () => {
  console.info('approve');
};

const onReject = () => {
  console.info('reject');
};
</script>

<style lang="scss" scoped>
.controls {
  display: flex;
  flex-direction: row;
  gap: 10px;
}
</style>
