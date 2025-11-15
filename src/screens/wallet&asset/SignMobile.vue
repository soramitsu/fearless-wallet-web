<template>
  <div class="mobile-sign__popup">
    <span>{{ $t('mobileConnector.signMobile') }}</span>

    <FButton text="Sign" width="100%" size="medium" fontSize="big" type="primary" :border="false" @click="handleSign" />

    <FButton
      text="Cancel"
      width="100%"
      size="medium"
      fontSize="big"
      type="secondary"
      :border="false"
      @click="handleCancel"
    />
  </div>
</template>

<script lang="ts" setup>
const emit = defineEmits<{
  onSign: [];
  onCancel: [];
}>();

function handleSign() {
  emit('onSign');
}

function handleCancel() {
  emit('onCancel');
}
</script>

<style lang="scss" scoped>
.mobile-sign__popup {
  display: flex;
  flex-flow: column;
  gap: 10px;
}
</style>
